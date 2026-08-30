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
        if case .error = self {
            return true
        }
        return false
    }
}

enum CodexCloudSyncState: Equatable {
    case idle
    case syncing
    case waitingForMac
    case synced(Date)
    case failed(String)

    var message: String {
        switch self {
        case .idle:
            "Preparando sincronización…"
        case .syncing:
            "Buscando cambios en iCloud…"
        case .waitingForMac:
            "Esperando el primer estado enviado por tu Mac."
        case .synced(let date):
            "Sincronizado \(date.formatted(.relative(presentation: .named)))"
        case .failed(let message):
            message
        }
    }

    var systemImage: String {
        switch self {
        case .idle:
            "icloud"
        case .syncing:
            "arrow.triangle.2.circlepath.icloud"
        case .waitingForMac:
            "macbook.and.iphone"
        case .synced:
            "checkmark.icloud.fill"
        case .failed:
            "exclamationmark.icloud.fill"
        }
    }

    var isError: Bool {
        if case .failed = self {
            return true
        }
        return false
    }
}

@Observable
@MainActor
final class CodexStatusViewModel {
    var sourceText: String
    private(set) var status: CodexUsageStatus?
    private(set) var feedback: CodexStatusFeedback?
    private(set) var cloudSyncState: CodexCloudSyncState = .idle
    private(set) var isManualUpdateInProgress = false

    private let parser: CodexStatusParser
    private let store: CodexStatusStore
    private let cloudRepository: CodexCloudStatusRepository

    convenience init() {
        self.init(
            parser: CodexStatusParser(),
            store: CodexStatusStore(),
            cloudRepository: CodexCloudStatusRepository()
        )
    }

    init(
        parser: CodexStatusParser,
        store: CodexStatusStore,
        cloudRepository: CodexCloudStatusRepository
    ) {
        self.parser = parser
        self.store = store
        self.cloudRepository = cloudRepository

        let savedStatus = store.loadSaved()
        status = savedStatus
        sourceText = savedStatus?.sourceText.contains("% left") == true
            ? savedStatus?.sourceText ?? CodexStatusConstants.exampleLine
            : CodexStatusConstants.exampleLine
    }

    func start() async {
        do {
            try await cloudRepository.ensureChangeSubscription()
        } catch {
            cloudSyncState = .failed(error.localizedDescription)
        }

        await refreshFromCloud()
    }

    func refreshFromCloud(userInitiated: Bool = false) async {
        guard cloudSyncState != .syncing else {
            return
        }

        cloudSyncState = .syncing

        do {
            guard let cloudStatus = try await cloudRepository.fetchStatus() else {
                store.clear()
                status = nil
                cloudSyncState = .waitingForMac
                WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind)
                return
            }

            try store.save(cloudStatus)
            status = cloudStatus
            cloudSyncState = .synced(cloudStatus.updatedAt)
            WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind)

            if userInitiated {
                feedback = .success("Estado recibido desde iCloud.")
            }
        } catch {
            cloudSyncState = .failed(error.localizedDescription)
        }
    }

    func reloadLocalStatus() {
        status = store.loadSaved()
        if let status {
            cloudSyncState = .synced(status.updatedAt)
        } else {
            cloudSyncState = .waitingForMac
        }
    }

    func updateStatus() async {
        guard !sourceText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            feedback = .error("Pega primero la línea de estado de Codex.")
            return
        }

        isManualUpdateInProgress = true
        defer { isManualUpdateInProgress = false }

        do {
            let parsedStatus = try parser.parse(sourceText)
            try store.save(parsedStatus)
            status = parsedStatus
            WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind)

            do {
                try await cloudRepository.saveStatus(parsedStatus)
                cloudSyncState = .synced(parsedStatus.updatedAt)
                feedback = .success("Widget e iCloud actualizados correctamente.")
            } catch {
                cloudSyncState = .failed(error.localizedDescription)
                feedback = .error("El widget local se actualizó, pero iCloud no: \(error.localizedDescription)")
            }
        } catch {
            feedback = .error(error.localizedDescription)
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
}
