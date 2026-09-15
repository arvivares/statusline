import Foundation

/// One encrypted request supplies every visible service. Widget-owned storage
/// never writes over the app's snapshot or pairing state.
@MainActor
final class AgentWidgetSnapshotLoader {
    private let reader: any CodexRelayReading
    private let sharedStore: CodexStatusStore
    private let widgetStore: CodexStatusStore
    private var pending: Task<AgentServicesSnapshot?, Never>?

    init(reader: any CodexRelayReading, sharedStore: CodexStatusStore, widgetStore: CodexStatusStore) {
        self.reader = reader
        self.sharedStore = sharedStore
        self.widgetStore = widgetStore
    }

    var focusedProvider: AgentProviderID? { sharedStore.servicesStore.focusedProvider }

    func cachedSnapshot() -> AgentServicesSnapshot? {
        do {
            let channel = try reader.pairedChannelID()
            let candidates = [sharedStore, widgetStore].compactMap { store -> AgentServicesSnapshot? in
                if let saved = store.servicesStore.load(), saved.channelID == channel { return saved }
                guard let legacy = store.loadSaved(), legacy.relayChannelID == channel else { return nil }
                return .legacy(legacy)
            }
            return candidates.reduce(nil) { current, next in
                guard let current else { return next }
                return next.supersedes(current) ? next : current
            }
        } catch { return nil } // Protected data unavailable before first unlock.
    }

    func load(now: Date = .now) async -> AgentServicesSnapshot? {
        if let pending { return await pending.value }
        let task = Task { @MainActor in
            let cached = self.cachedSnapshot()
            guard self.reader.endpoint != nil, (try? self.reader.isPaired()) == true else { return cached }
            if let cached, now.timeIntervalSince(cached.updatedAt) >= 0,
               now.timeIntervalSince(cached.updatedAt) < 60 { return cached }
            do {
                if let fetched = try await self.reader.fetchServices() {
                    try Task.checkCancellation()
                    guard fetched.channelID == (try self.reader.pairedChannelID()) else { return self.cachedSnapshot() }
                    if let latest = self.cachedSnapshot(), !fetched.supersedes(latest) { return latest }
                    try self.widgetStore.servicesStore.save(fetched)
                    return fetched
                }
            } catch {
                // Never infer removal, reset or a full quota from a failed read.
            }
            return self.cachedSnapshot()
        }
        pending = task
        let result = await task.value
        pending = nil
        return result
    }
}
