import Foundation

enum CodexRateLimitMappingError: Error, LocalizedError, Sendable {
    case missingWeeklyWindow
    case missingResetDate

    var errorDescription: String? {
        switch self {
        case .missingWeeklyWindow:
            "Codex no devolvió una ventana de uso compatible."
        case .missingResetDate:
            "Codex no devolvió la fecha del próximo reinicio."
        }
    }
}

struct CodexRateLimitsResponse: Decodable, Sendable {
    let rateLimits: CodexRateLimitSnapshot
    let rateLimitsByLimitId: [String: CodexRateLimitSnapshot]?

    func weeklyStatus(now: Date = .now) throws -> CodexUsageStatus {
        let snapshot = preferredCodexSnapshot
        let windows = [snapshot.primary, snapshot.secondary].compactMap { $0 }

        guard let weeklyWindow = windows.first(where: {
            $0.windowDurationMins == 10_080
        }) else {
            throw CodexRateLimitMappingError.missingWeeklyWindow
        }

        guard let resetTimestamp = weeklyWindow.resetsAt else {
            throw CodexRateLimitMappingError.missingResetDate
        }

        let usedPercentage = min(max(weeklyWindow.usedPercent, 0), 100)
        let remainingPercentage = 100 - usedPercentage

        return CodexUsageStatus(
            remainingPercentage: remainingPercentage,
            resetDate: Date(timeIntervalSince1970: TimeInterval(resetTimestamp)),
            updatedAt: now,
            sourceText: "Sincronizado automáticamente desde Codex App Server."
        )
    }

    private var preferredCodexSnapshot: CodexRateLimitSnapshot {
        rateLimitsByLimitId?["codex"] ?? rateLimits
    }
}

struct CodexRateLimitSnapshot: Decodable, Sendable {
    let limitId: String?
    let limitName: String?
    let planType: String?
    let primary: CodexRateLimitWindow?
    let secondary: CodexRateLimitWindow?
}

struct CodexRateLimitWindow: Decodable, Sendable {
    let usedPercent: Int
    let windowDurationMins: Int?
    let resetsAt: Int64?
}
