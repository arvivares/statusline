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
    private let relayRepository: CodexRelayReaderRepository

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
        relayRepository: CodexRelayReaderRepository
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

    func start() async {
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
        feedback = nil
        do {
            try await relayRepository.pair(using: uri)
            feedback = .success(L10n.text("Device connected with encryption."))
            await refreshFromRelay()
        } catch {
            relaySyncState = .failed(L10n.error(error))
            feedback = .error(L10n.error(error))
        }
    }

    func refreshFromRelay(userInitiated: Bool = false) async {
        guard relaySyncState != .syncing else {
            return
        }
        guard relayRepository.endpoint != nil else {
            relaySyncState = .notConfigured
            return
        }

        relaySyncState = .syncing
        do {
            guard let relayStatus = try await relayRepository.fetchStatus() else {
                store.clear()
                status = nil
                relaySyncState = .waitingForDesktop
                WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind)
                return
            }
            try store.save(relayStatus)
            status = relayStatus
            relaySyncState = .synced(relayStatus.updatedAt)
            WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind)
            if userInitiated {
                feedback = .success(L10n.text("Encrypted snapshot updated."))
            }
        } catch CodexRelayError.notPaired {
            relaySyncState = .unpaired
        } catch {
            relaySyncState = .failed(L10n.error(error))
        }
    }

    func disconnectRelay() {
        do {
            try relayRepository.disconnect()
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
