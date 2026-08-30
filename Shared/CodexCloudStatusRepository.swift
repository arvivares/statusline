import CloudKit
import Foundation

enum CodexCloudStatusError: Error, LocalizedError, Sendable {
    case invalidRecord
    case saveDidNotReturnRecord
    case iCloudUnavailable

    var errorDescription: String? {
        switch self {
        case .invalidRecord:
            "El estado guardado en iCloud no tiene un formato válido."
        case .saveDidNotReturnRecord:
            "iCloud no confirmó que el estado se haya guardado."
        case .iCloudUnavailable:
            "Inicia sesión en iCloud para sincronizar con tu Mac."
        }
    }
}

@MainActor
final class CodexCloudStatusRepository {
    private enum Schema {
        static let recordType = "CodexUsageStatus"
        static let recordName = "current-weekly-status"
        static let subscriptionID = "codex-usage-status-changes-v1"

        static let remainingPercentage = "remainingPercentage"
        static let resetDate = "resetDate"
        static let updatedAt = "updatedAt"
        static let schemaVersion = "schemaVersion"
    }

    private let container: CKContainer
    private let database: CKDatabase
    private let recordID = CKRecord.ID(recordName: Schema.recordName)

    convenience init() {
        self.init(container: CKContainer(identifier: CodexStatusConstants.cloudKitContainerIdentifier))
    }

    init(container: CKContainer) {
        self.container = container
        database = container.privateCloudDatabase
    }

    func fetchStatus() async throws -> CodexUsageStatus? {
        try await requireAvailableAccount()

        do {
            let record = try await database.record(for: recordID)
            return try status(from: record)
        } catch {
            if Self.isUnknownItem(error) {
                return nil
            }
            throw error
        }
    }

    func saveStatus(_ status: CodexUsageStatus) async throws {
        try await requireAvailableAccount()

        let record = CKRecord(recordType: Schema.recordType, recordID: recordID)
        record[Schema.remainingPercentage] = NSNumber(value: status.remainingPercentage)
        record[Schema.resetDate] = status.resetDate as CKRecordValue
        record[Schema.updatedAt] = status.updatedAt as CKRecordValue
        record[Schema.schemaVersion] = NSNumber(value: 1)

        let result = try await database.modifyRecords(
            saving: [record],
            deleting: [],
            savePolicy: .allKeys,
            atomically: true
        )

        guard let saveResult = result.saveResults[recordID] else {
            throw CodexCloudStatusError.saveDidNotReturnRecord
        }
        _ = try saveResult.get()
    }

    func deleteStatus() async throws {
        try await requireAvailableAccount()

        do {
            _ = try await database.deleteRecord(withID: recordID)
        } catch {
            if !Self.isUnknownItem(error) {
                throw error
            }
        }
    }

    func ensureChangeSubscription() async throws {
        try await requireAvailableAccount()

        do {
            _ = try await database.subscription(for: Schema.subscriptionID)
            return
        } catch {
            if !Self.isUnknownItem(error) {
                throw error
            }
        }

        let subscription = CKDatabaseSubscription(subscriptionID: Schema.subscriptionID)
        subscription.notificationInfo = CKSubscription.NotificationInfo(
            shouldSendContentAvailable: true
        )
        _ = try await database.save(subscription)
    }

    private func requireAvailableAccount() async throws {
        guard try await container.accountStatus() == .available else {
            throw CodexCloudStatusError.iCloudUnavailable
        }
    }

    private func status(from record: CKRecord) throws -> CodexUsageStatus {
        guard let remainingNumber = record[Schema.remainingPercentage] as? NSNumber,
              let resetDate = record[Schema.resetDate] as? Date else {
            throw CodexCloudStatusError.invalidRecord
        }

        let remainingPercentage = remainingNumber.intValue
        guard (0...100).contains(remainingPercentage) else {
            throw CodexCloudStatusError.invalidRecord
        }

        return CodexUsageStatus(
            remainingPercentage: remainingPercentage,
            resetDate: resetDate,
            updatedAt: (record[Schema.updatedAt] as? Date) ?? record.modificationDate ?? .now,
            sourceText: "Sincronizado automáticamente desde el companion de macOS."
        )
    }

    private static func isUnknownItem(_ error: Error) -> Bool {
        (error as? CKError)?.code == .unknownItem
    }
}
