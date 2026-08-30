import Foundation
import Testing
@testable import statusline

@Suite("Codex status parser")
@MainActor
struct CodexStatusParserTests {
    @Test("Parses the weekly percentage and reset date")
    func parsesWeeklyStatus() throws {
        let calendar = makeCalendar()
        let now = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 27, hour: 12))
        )

        let status = try CodexStatusParser().parse(
            CodexStatusConstants.exampleLine,
            now: now,
            calendar: calendar
        )

        #expect(status.remainingPercentage == 70)
        #expect(calendar.component(.year, from: status.resetDate) == 2026)
        #expect(calendar.component(.month, from: status.resetDate) == 9)
        #expect(calendar.component(.day, from: status.resetDate) == 2)
        #expect(calendar.component(.hour, from: status.resetDate) == 9)
        #expect(calendar.component(.minute, from: status.resetDate) == 2)
    }

    @Test("Moves a past reset date into the next year")
    func rollsPastResetIntoNextYear() throws {
        let calendar = makeCalendar()
        let now = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 9, day: 3, hour: 12))
        )

        let status = try CodexStatusParser().parse(
            CodexStatusConstants.exampleLine,
            now: now,
            calendar: calendar
        )

        #expect(calendar.component(.year, from: status.resetDate) == 2027)
    }

    @Test("Rejects percentages outside the valid range")
    func rejectsInvalidPercentage() {
        #expect {
            try CodexStatusParser().parse(
                "Weekly limit: 120% left (resets 09:02 on 2 Sep)"
            )
        } throws: { error in
            error as? CodexStatusParseError == .percentageOutOfRange
        }
    }

    @Test("Rejects status text without a reset date")
    func rejectsMissingResetDate() {
        #expect(throws: CodexStatusParseError.self) {
            try CodexStatusParser().parse("Weekly limit: 70% left")
        }
    }

    private func makeCalendar() -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "en_US_POSIX")
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
        return calendar
    }
}

@Suite("Codex App Server rate limits")
@MainActor
struct CodexRateLimitsResponseTests {
    @Test("Prefers the weekly window and converts used into remaining")
    func mapsWeeklyWindow() throws {
        let payload = Data(
            #"""
            {
              "rateLimits": {
                "limitId": "codex",
                "limitName": null,
                "planType": "plus",
                "primary": {
                  "usedPercent": 12,
                  "windowDurationMins": 300,
                  "resetsAt": 1787857200
                },
                "secondary": {
                  "usedPercent": 36,
                  "windowDurationMins": 10080,
                  "resetsAt": 1788332520
                }
              },
              "rateLimitsByLimitId": null
            }
            """#.utf8
        )

        let response = try JSONDecoder().decode(CodexRateLimitsResponse.self, from: payload)
        let now = Date(timeIntervalSince1970: 1_787_850_000)
        let status = try response.weeklyStatus(now: now)

        #expect(status.remainingPercentage == 64)
        #expect(status.resetDate == Date(timeIntervalSince1970: 1_788_332_520))
        #expect(status.updatedAt == now)
    }

    @Test("Falls back to the Codex bucket in the multi-limit response")
    func mapsCodexBucket() throws {
        let payload = Data(
            #"""
            {
              "rateLimits": {
                "limitId": "codex_other",
                "secondary": {
                  "usedPercent": 5,
                  "windowDurationMins": 10080,
                  "resetsAt": 1788332520
                }
              },
              "rateLimitsByLimitId": {
                "codex": {
                  "limitId": "codex",
                  "secondary": {
                    "usedPercent": 70,
                    "windowDurationMins": 10080,
                    "resetsAt": 1788332520
                  }
                }
              }
            }
            """#.utf8
        )

        let response = try JSONDecoder().decode(CodexRateLimitsResponse.self, from: payload)
        let status = try response.weeklyStatus()

        #expect(status.remainingPercentage == 30)
    }

    @Test("Rejects a non-weekly quota window")
    func rejectsNonWeeklyWindow() throws {
        let payload = Data(
            #"""
            {
              "rateLimits": {
                "limitId": "codex",
                "primary": {
                  "usedPercent": 12,
                  "windowDurationMins": 300,
                  "resetsAt": 1787857200
                }
              },
              "rateLimitsByLimitId": null
            }
            """#.utf8
        )

        let response = try JSONDecoder().decode(CodexRateLimitsResponse.self, from: payload)

        #expect(throws: CodexRateLimitMappingError.missingWeeklyWindow) {
            try response.weeklyStatus()
        }
    }
}
