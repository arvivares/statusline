import Foundation
import Observation
import WidgetKit

enum CodexStatusFeedback: Equatable {
    case success(String)
    case error(String)

    var message: String {
        switch self {
        case .success(let message), .error(let message):
            message
        }
    }

    var systemImage: String {
        switch self {
        case .success:
            "checkmark.circle.fill"
        case .error:
            "exclamationmark.triangle.fill"
        }
    }

    var isError: Bool {
        if case .error = self { true } else { false }
    }
}

enum CodexRelaySyncState: Equatable {
    case notConfigured
    case unpaired
    case pairing
    case syncing
    case waitingForDesktop
    case synced(Date)
    case failed(String)

    var message: String {
        switch self {
        case .notConfigured:
            L10n.text("This build does not have a relay endpoint configured yet.")
        case .unpaired:
            L10n.text("Scan the QR shown by Statusline Companion to connect this device.")
        case .pairing:
            L10n.text("Validating the encrypted pairing with the relay…")
        case .syncing:
            L10n.text("Looking for the latest encrypted snapshot…")
        case .waitingForDesktop:
            L10n.text("Device connected. Waiting for the companion’s first sample.")
        case .synced(let date):
            L10n.text("Synced {0}", L10n.relative(date))
        case .failed(let message):
            message
        }
    }

    var systemImage: String {
        switch self {
        case .notConfigured:
            "network.slash"
        case .unpaired:
            "qrcode.viewfinder"
        case .pairing:
            "link.badge.plus"
        case .syncing:
            "arrow.triangle.2.circlepath"
        case .waitingForDesktop:
            "desktopcomputer"
        case .synced:
            "checkmark.shield.fill"
        case .failed:
            "exclamationmark.shield.fill"
        }
    }

    var isError: Bool {
        if case .failed = self { true } else { false }
    }

    var isPaired: Bool {
        switch self {
        case .syncing, .waitingForDesktop, .synced:
            true
        case .notConfigured, .unpaired, .pairing, .failed:
            false
        }
    }
}

@Observable
@MainActor
final class CodexStatusViewModel {
    private(set) var status: CodexUsageStatus?
    private(set) var services: AgentServicesSnapshot?
    private(set) var preferredProvider: AgentProviderID?
    private(set) var feedback: CodexStatusFeedback?
    private(set) var relaySyncState: CodexRelaySyncState = .unpaired
    private let store: CodexStatusStore
    private let relayRepository: any CodexRelayReading
    private var isRefreshing = false
    private var pairingGeneration = 0

    convenience init() {
        self.init(
            store: CodexStatusStore(),
            relayRepository: CodexRelayReaderRepository()
        )
    }

    init(
        store: CodexStatusStore,
        relayRepository: any CodexRelayReading
    ) {
        self.store = store
        self.relayRepository = relayRepository
        preferredProvider = store.servicesStore.focusedProvider

        reloadLocalStatus()
    }

    var focusedProvider: AgentProviderReading? { services?.focusedProvider(preferred: preferredProvider) }
    var watchlist: [AgentProviderReading] { services?.providers.filter { $0.id != focusedProvider?.id } ?? [] }

    func focus(_ provider: AgentProviderID) {
        guard services?.providers.contains(where: { $0.id == provider }) == true else { return }
        preferredProvider = provider
        store.servicesStore.focus(provider)
        WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind)
    }

    var relayEndpoint: String? { relayRepository.endpoint }

    /// Owned by ContentView.task(id: scenePhase); cancels when no longer active.
    func runForegroundRefresh(
        sleep: (Duration) async throws -> Void = { try await Task.sleep(for: $0) }
    ) async {
        reloadLocalStatus()
        while !Task.isCancelled {
            await start()
            do { try await sleep(CodexSyncPolicy.foregroundInterval) }
            catch { return }
        }
    }

    func start() async {
        guard relaySyncState != .pairing, !Task.isCancelled else { return }
        guard relayRepository.endpoint != nil else {
            relaySyncState = .notConfigured
            return
        }
        do {
            guard try relayRepository.isPaired() else {
                relaySyncState = .unpaired
                return
            }
            await refreshFromRelay()
        } catch {
            relaySyncState = .failed(L10n.error(error))
        }
    }

    func pair(using uri: String) async {
        guard relaySyncState != .pairing else {
            return
        }
        relaySyncState = .pairing
        pairingGeneration += 1
        feedback = nil
        do {
            try await relayRepository.pair(using: uri)
            store.clear()
            store.servicesStore.clear()
            services = nil
            preferredProvider = nil
            status = nil
            WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind)
            feedback = .success(L10n.text("Device connected with encryption."))
            relaySyncState = .waitingForDesktop
            await refreshFromRelay()
        } catch {
            relaySyncState = .failed(L10n.error(error))
            feedback = .error(L10n.error(error))
        }
    }

    func refreshFromRelay(userInitiated: Bool = false) async {
        guard !isRefreshing, relaySyncState != .pairing, !Task.isCancelled else {
            return
        }
        guard relayRepository.endpoint != nil else {
            relaySyncState = .notConfigured
            return
        }

        let generation = pairingGeneration
        let previousState = relaySyncState
        isRefreshing = true
        defer { isRefreshing = false }
        relaySyncState = .syncing
        do {
            let fetched = try await relayRepository.fetchServices()
            try Task.checkCancellation()
            guard generation == pairingGeneration else { return }
            guard let relayStatus = fetched else {
                // Keep a last successful sample if the relay is temporarily empty.
                relaySyncState = .waitingForDesktop
                return
            }
            guard relayStatus.channelID == (try relayRepository.pairedChannelID()) else { return }
            let selected: AgentServicesSnapshot
            if let previous = services, previous.channelID == relayStatus.channelID,
               !relayStatus.supersedes(previous) { selected = previous }
            else { selected = relayStatus }
            let changed = services != selected
            try store.servicesStore.save(selected)
            services = selected
            status = selected.codexStatus
            if let status { try store.save(status) } else { store.clear() }
            relaySyncState = .synced(selected.updatedAt)
            if changed { WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind) }
            if userInitiated {
                feedback = .success(L10n.text("Encrypted snapshot updated."))
            }
        } catch is CancellationError {
            if generation == pairingGeneration { relaySyncState = previousState }
        } catch CodexRelayError.notPaired {
            if generation == pairingGeneration { relaySyncState = .unpaired }
        } catch {
            if generation == pairingGeneration { relaySyncState = .failed(L10n.error(error)) }
        }
    }

    func disconnectRelay() {
        do {
            try relayRepository.disconnect()
            pairingGeneration += 1
            store.clear()
            store.servicesStore.clear()
            services = nil
            preferredProvider = nil
            status = nil
            relaySyncState = .unpaired
            feedback = .success(L10n.text("This device was disconnected from the relay."))
            WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind)
        } catch {
            relaySyncState = .failed(L10n.error(error))
            feedback = .error(L10n.error(error))
        }
    }

    func reloadLocalStatus() {
        do {
            let channel = try relayRepository.pairedChannelID()
            if let saved = store.servicesStore.load(), saved.channelID == channel {
                services = saved
            } else if let legacy = store.loadSaved(), legacy.relayChannelID == channel {
                services = .legacy(legacy)
            } else { services = nil }
            status = services?.codexStatus
            if let services { relaySyncState = .synced(services.updatedAt) }
        } catch {
            status = nil
            services = nil
        }
    }

    func loadLocalDemo() {
        do {
            // Demo data is fixed and local; arbitrary status text is no longer accepted.
            guard try !relayRepository.isPaired(), !isRefreshing,
                  relaySyncState != .pairing else { return }
            let demo = CodexUsageStatus.example
            let snapshot = AgentServicesSnapshot.legacy(demo)
            try store.save(demo)
            try store.servicesStore.save(snapshot)
            status = demo
            services = snapshot
            WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind)
            feedback = .success(L10n.text("Local demo enabled. The app and widget show an example sample."))
        } catch {
            feedback = .error(L10n.error(error))
        }
    }
}
