import Foundation

enum CodexSyncPolicy {
    static let foregroundInterval: Duration = .seconds(60)
    static let widgetInterval: TimeInterval = 30 * 60
    static let staleInterval: TimeInterval = 15 * 60

    static func isStale(_ status: CodexUsageStatus, at date: Date) -> Bool {
        date.timeIntervalSince(status.updatedAt) >= staleInterval || status.resetDate <= date
    }

    static func nextWidgetRefresh(after date: Date, status: CodexUsageStatus?) -> Date {
        let regular = date.addingTimeInterval(widgetInterval)
        guard let reset = status?.resetDate, reset > date else { return regular }
        // Avoid rapid retries when a reset is seconds away. Never infer a new quota.
        return max(date.addingTimeInterval(5 * 60), min(reset, regular))
    }
}

/// The widget writes only its own cache, never the app's shared cache. Pairing
/// identity is checked on every read so old data cannot cross account changes.
@MainActor
final class CodexWidgetSnapshotLoader {
    private let reader: any CodexRelayReading
    private let sharedStore: CodexStatusStore
    private let widgetStore: CodexStatusStore
    private var pending: Task<CodexUsageStatus?, Never>?

    init(reader: any CodexRelayReading, sharedStore: CodexStatusStore, widgetStore: CodexStatusStore) {
        self.reader = reader
        self.sharedStore = sharedStore
        self.widgetStore = widgetStore
    }

    func cachedStatus() -> CodexUsageStatus? {
        do {
            guard let channel = try reader.pairedChannelID() else {
                // Retain the account-free manual mode. Never show a disconnected relay sample.
                let local = sharedStore.loadSaved()
                return local?.relayChannelID == nil ? local : nil
            }
            return [sharedStore.loadSaved(), widgetStore.loadSaved()]
                .compactMap { $0 }
                .filter { $0.relayChannelID == channel }
                .max { $0.updatedAt < $1.updatedAt }
        } catch {
            // Keychain unavailable, e.g. before the first unlock after reboot.
            return nil
        }
    }

    func load(now: Date = .now) async -> CodexUsageStatus? {
        if let pending { return await pending.value }
        let task = Task { @MainActor in
            let cached = self.cachedStatus()
            guard self.reader.endpoint != nil, (try? self.reader.isPaired()) == true else { return cached }
            // An app-triggered reload can use the just-fetched shared sample.
            if let cached, now.timeIntervalSince(cached.updatedAt) >= 0,
               now.timeIntervalSince(cached.updatedAt) < 60 { return cached }
            do {
                if let fetched = try await self.reader.fetchStatus() {
                    try Task.checkCancellation()
                    guard fetched.relayChannelID == (try self.reader.pairedChannelID()) else { return self.cachedStatus() }
                    if let latest = self.cachedStatus(), latest.updatedAt > fetched.updatedAt { return latest }
                    try self.widgetStore.save(fetched)
                    return fetched
                }
            } catch {
                // Offline, timeout, bad ciphertext or missing snapshot: last good sample.
                // No immediate retry loop and no WidgetCenter reload from the provider.
            }
            return self.cachedStatus()
        }
        pending = task
        let result = await task.value
        pending = nil
        return result
    }
}
