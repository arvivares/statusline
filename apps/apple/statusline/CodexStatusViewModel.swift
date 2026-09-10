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
    var sourceText: String
    private(set) var status: CodexUsageStatus?
    private(set) var feedback: CodexStatusFeedback?
    private(set) var relaySyncState: CodexRelaySyncState = .unpaired
    private(set) var isManualUpdateInProgress = false

    private let parser: CodexStatusParser
    private let store: CodexStatusStore
    private let relayRepository: any CodexRelayReading
    private var isRefreshing = false
    private var pairingGeneration = 0

    convenience init() {
        self.init(
            parser: CodexStatusParser(),
            store: CodexStatusStore(),
            relayRepository: CodexRelayReaderRepository()
        )
    }

    init(
        parser: CodexStatusParser,
        store: CodexStatusStore,
        relayRepository: any CodexRelayReading
    ) {
        self.parser = parser
        self.store = store
        self.relayRepository = relayRepository

        let savedStatus = store.loadSaved()
        status = savedStatus
        sourceText = savedStatus?.sourceText.contains("% left") == true
            ? savedStatus?.sourceText ?? CodexStatusConstants.exampleLine
            : CodexStatusConstants.exampleLine
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
            let fetched = try await relayRepository.fetchStatus()
            try Task.checkCancellation()
            guard generation == pairingGeneration else { return }
            guard let relayStatus = fetched else {
                // Keep a last successful sample if the relay is temporarily empty.
                relaySyncState = .waitingForDesktop
                return
            }
            let changed = status != relayStatus
            try store.save(relayStatus)
            status = relayStatus
            relaySyncState = .synced(relayStatus.updatedAt)
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
        status = store.loadSaved()
        if let status {
            relaySyncState = .synced(status.updatedAt)
        }
    }

    func updateStatus() {
        guard !sourceText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            feedback = .error(L10n.text("Paste the Codex status line first."))
            return
        }

        isManualUpdateInProgress = true
        defer { isManualUpdateInProgress = false }

        do {
            let parsedStatus = try parser.parse(sourceText)
            try store.save(parsedStatus)
            status = parsedStatus
            WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind)
            feedback = .success(L10n.text("Local widget updated. The relay was not changed."))
        } catch {
            feedback = .error(L10n.error(error))
        }
    }

    func acceptPastedText(_ values: [String]) {
        guard let firstValue = values.first else {
            return
        }
        sourceText = firstValue
        feedback = nil
    }

    func restoreExample() {
        sourceText = CodexStatusConstants.exampleLine
        feedback = nil
    }

    func loadLocalDemo() {
        sourceText = CodexStatusConstants.exampleLine
        updateStatus()

        if status != nil {
            feedback = .success(L10n.text("Local demo enabled. The app and widget show an example sample."))
        }
    }
}
