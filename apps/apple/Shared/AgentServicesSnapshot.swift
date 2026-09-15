import Foundation

enum AgentProviderID: String, Codable, Sendable {
    case codex
    case antigravity

    var name: String { self == .codex ? "Codex" : "Gemini" }
    var source: String { self == .codex ? "OpenAI" : "Antigravity" }
}

enum AgentQuotaPeriod: String, Codable, Sendable {
    case weekly
    case shortWindow
}

struct AgentQuotaWindow: Codable, Equatable, Sendable {
    let remainingPercentage: Int
    let resetAt: Int64
    let windowMinutes: Int

    var resetDate: Date { Date(timeIntervalSince1970: TimeInterval(resetAt)) }
    var label: String {
        if windowMinutes >= 8_640 { return L10n.text("Weekly") }
        return windowMinutes.isMultiple(of: 60) ? L10n.text("{0}h", windowMinutes / 60) : L10n.text("{0} min", windowMinutes)
    }
}

struct AgentProviderReading: Codable, Equatable, Identifiable, Sendable {
    let id: AgentProviderID
    let status: String
    let updatedAt: Date
    let weekly: AgentQuotaWindow?
    let shortWindow: AgentQuotaWindow?

    var defaultPeriod: AgentQuotaPeriod { id == .codex ? .weekly : .shortWindow }
    func window(for period: AgentQuotaPeriod? = nil) -> AgentQuotaWindow? {
        (period ?? defaultPeriod) == .weekly ? weekly ?? shortWindow : shortWindow ?? weekly
    }
    func isStale(at date: Date, period: AgentQuotaPeriod? = nil) -> Bool {
        status != "ready" || date.timeIntervalSince(updatedAt) >= CodexSyncPolicy.staleInterval
            || (window(for: period)?.resetDate ?? .distantPast) <= date
    }
}

/// Local projection. Channel, envelope sequence and legacy source text are never
/// part of the services plaintext sent over the network.
struct AgentServicesSnapshot: Codable, Equatable, Sendable {
    let providers: [AgentProviderReading]
    let updatedAt: Date
    let channelID: UUID?
    let sequence: Int64
    var legacyCodex: CodexUsageStatus? = nil

    static func legacy(_ status: CodexUsageStatus, sequence: Int64 = 0) -> Self {
        Self(providers: [AgentProviderReading(id: .codex, status: "ready", updatedAt: status.updatedAt,
            weekly: AgentQuotaWindow(remainingPercentage: status.remainingPercentage,
                resetAt: Int64(status.resetDate.timeIntervalSince1970), windowMinutes: 10_080), shortWindow: nil)],
            updatedAt: status.updatedAt, channelID: status.relayChannelID, sequence: sequence, legacyCodex: status)
    }

    var codexStatus: CodexUsageStatus? {
        if let legacyCodex { return legacyCodex }
        guard let reading = providers.first(where: { $0.id == .codex }), reading.status == "ready",
              let weekly = reading.weekly else { return nil }
        return CodexUsageStatus(remainingPercentage: weekly.remainingPercentage, resetDate: weekly.resetDate,
            updatedAt: reading.updatedAt, sourceText: "Statusline encrypted relay", relayChannelID: channelID)
    }

    func focusedProvider(preferred: AgentProviderID?) -> AgentProviderReading? {
        providers.first { $0.id == preferred } ?? providers.first { $0.id == .codex } ?? providers.first
    }

    func nextWidgetRefresh(after date: Date) -> Date {
        let regular = date.addingTimeInterval(CodexSyncPolicy.widgetInterval)
        let reset = providers.flatMap { [$0.weekly?.resetDate, $0.shortWindow?.resetDate].compactMap { $0 } }
            .filter { $0 > date }.min() ?? regular
        return max(date.addingTimeInterval(300), min(reset, regular))
    }

    func staleTransitions(after date: Date, before refresh: Date) -> [Date] {
        let transitions = providers.flatMap { reading in
            [reading.updatedAt.addingTimeInterval(CodexSyncPolicy.staleInterval), reading.weekly?.resetDate, reading.shortWindow?.resetDate]
                .compactMap { $0 }.filter { $0 > date && $0 < refresh }
        }
        return Set(transitions).sorted()
    }

    func supersedes(_ previous: Self) -> Bool {
        guard channelID == previous.channelID else { return false }
        // v1 does not authenticate its outer sequence. An old Codex projection
        // must not downgrade a newer services inventory just by raising it.
        if legacyCodex != nil, previous.legacyCodex == nil, updatedAt <= previous.updatedAt { return false }
        if sequence > 0, previous.sequence > 0 { return sequence > previous.sequence }
        return updatedAt > previous.updatedAt
    }

    static func decode(_ data: Data, channelID: UUID, sequence: Int64) throws -> Self {
        guard data.count <= 4_096, sequence > 0 else { throw CodexRelayError.invalidSnapshot }
        let wire = try JSONDecoder().decode(ServicesPayload.self, from: data)
        guard wire.schemaVersion == 1, validTimestamp(wire.updatedAt), wire.providers.count <= 16,
              Set(wire.providers.map(\.id)).count == wire.providers.count else { throw CodexRelayError.invalidSnapshot }
        let providers = try wire.providers.compactMap { value -> AgentProviderReading? in
            guard !value.id.isEmpty, value.id.count <= 64,
                  value.id.utf8.allSatisfy({ (97...122).contains($0) || (48...57).contains($0) || $0 == 45 }) else {
                throw CodexRelayError.invalidSnapshot
            }
            // Future adapters must not stop currently supported providers syncing.
            guard let id = AgentProviderID(rawValue: value.id) else { return nil }
            guard let updated = value.updatedAt, validTimestamp(updated), updated <= wire.updatedAt,
                  let status = value.status, ["ready", "unavailable"].contains(status) else { throw CodexRelayError.invalidSnapshot }
            for window in [value.weekly, value.shortWindow].compactMap({ $0 }) {
                guard (0...100).contains(window.remainingPercentage), validTimestamp(window.resetAt),
                      (1...11_520).contains(window.windowMinutes) else { throw CodexRelayError.invalidSnapshot }
            }
            if let weekly = value.weekly, !(8_640...11_520).contains(weekly.windowMinutes) {
                throw CodexRelayError.invalidSnapshot
            }
            if let short = value.shortWindow, short.windowMinutes >= 8_640 {
                throw CodexRelayError.invalidSnapshot
            }
            if id == .antigravity,
               ((value.weekly.map { $0.windowMinutes != 10_080 } ?? false)
                || (value.shortWindow.map { $0.windowMinutes != 300 } ?? false)) { throw CodexRelayError.invalidSnapshot }
            guard status == "ready" ? (value.weekly != nil || value.shortWindow != nil)
                : (value.weekly == nil && value.shortWindow == nil) else { throw CodexRelayError.invalidSnapshot }
            return AgentProviderReading(id: id, status: status, updatedAt: Date(timeIntervalSince1970: TimeInterval(updated)),
                weekly: value.weekly, shortWindow: value.shortWindow)
        }
        return Self(providers: providers, updatedAt: Date(timeIntervalSince1970: TimeInterval(wire.updatedAt)), channelID: channelID, sequence: sequence)
    }

    private static func validTimestamp(_ value: Int64) -> Bool { (1...253_402_300_799).contains(value) }
}

private struct ServicesPayload: Decodable {
    let schemaVersion: Int
    let updatedAt: Int64
    let providers: [ServicePayload]
}

private struct ServicePayload: Decodable {
    let id: String
    var status: String?
    var updatedAt: Int64?
    var weekly: AgentQuotaWindow?
    var shortWindow: AgentQuotaWindow?
    enum CodingKeys: String, CodingKey { case id, status, updatedAt, weekly, shortWindow }
    init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        guard AgentProviderID(rawValue: id) != nil else { return }
        status = try values.decode(String.self, forKey: .status)
        updatedAt = try values.decode(Int64.self, forKey: .updatedAt)
        weekly = try values.decodeIfPresent(AgentQuotaWindow.self, forKey: .weekly)
        shortWindow = try values.decodeIfPresent(AgentQuotaWindow.self, forKey: .shortWindow)
    }
}

@MainActor
struct AgentServicesStore {
    private let defaults: UserDefaults
    private static let key = "statusline.servicesSnapshot.v1"
    private static let focusKey = "statusline.focusedProvider.v1"

    init(defaults: UserDefaults) { self.defaults = defaults }
    func load() -> AgentServicesSnapshot? {
        guard let data = defaults.data(forKey: Self.key), data.count <= 16_384 else { return nil }
        return try? JSONDecoder().decode(AgentServicesSnapshot.self, from: data)
    }
    func save(_ snapshot: AgentServicesSnapshot) throws {
        defaults.set(try JSONEncoder().encode(snapshot), forKey: Self.key)
    }
    func clear() {
        defaults.removeObject(forKey: Self.key)
        defaults.removeObject(forKey: Self.focusKey)
    }
    var focusedProvider: AgentProviderID? {
        defaults.string(forKey: Self.focusKey).flatMap(AgentProviderID.init(rawValue:))
    }
    func focus(_ id: AgentProviderID) { defaults.set(id.rawValue, forKey: Self.focusKey) }
}
