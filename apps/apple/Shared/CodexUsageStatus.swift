import Foundation

enum CodexStatusConstants {
    static let appGroupIdentifier = "group.inmerzion.statusline"
    static let storageKey = "codex.weeklyUsageStatus.v1"
    static let widgetKind = "CodexStatusWidget"
    static let exampleLine = "Weekly limit: [██████████████░░░░░░] 70% left (resets 09:02 on 2 Sep)"
}

struct CodexUsageStatus: Codable, Equatable, Sendable {
    let remainingPercentage: Int
    let resetDate: Date
    let updatedAt: Date
    let sourceText: String

    var remainingFraction: Double {
        Double(remainingPercentage) / 100
    }

    static var example: CodexUsageStatus {
        (try? CodexStatusParser().parse(CodexStatusConstants.exampleLine))
            ?? CodexUsageStatus(
                remainingPercentage: 70,
                resetDate: .now.addingTimeInterval(6 * 24 * 60 * 60),
                updatedAt: .now,
                sourceText: CodexStatusConstants.exampleLine
            )
    }
}

enum CodexStatusParseError: Error, Equatable, StatuslineLocalizedError, Sendable {
    case missingPercentage
    case percentageOutOfRange
    case missingResetDate
    case invalidResetDate

    var errorDescription: String? {
        switch self {
        case .missingPercentage:
            L10n.text("No percentage followed by ‘% left’ was found.")
        case .percentageOutOfRange:
            L10n.text("The remaining percentage must be between 0 and 100.")
        case .missingResetDate:
            L10n.text("No date in the format ‘resets 09:02 on 2 Sep’ was found.")
        case .invalidResetDate:
            L10n.text("The reset date is invalid.")
        }
    }
}

struct CodexStatusParser: Sendable {
    func parse(
        _ text: String,
        now: Date = .now,
        calendar inputCalendar: Calendar = .autoupdatingCurrent
    ) throws -> CodexUsageStatus {
        let percentageGroups = captureGroups(
            pattern: #"(\d{1,3})\s*%\s*left"#,
            in: text
        )

        guard let percentageText = percentageGroups.first,
              let percentage = Int(percentageText) else {
            throw CodexStatusParseError.missingPercentage
        }

        guard (0...100).contains(percentage) else {
            throw CodexStatusParseError.percentageOutOfRange
        }

        let resetGroups = captureGroups(
            pattern: #"resets\s+(\d{1,2}):(\d{2})\s+on\s+(\d{1,2})\s+([A-Za-z]+)"#,
            in: text
        )

        guard resetGroups.count == 4,
              let hour = Int(resetGroups[0]),
              let minute = Int(resetGroups[1]),
              let day = Int(resetGroups[2]),
              let month = Self.monthNumber(for: resetGroups[3]) else {
            throw CodexStatusParseError.missingResetDate
        }

        guard (0...23).contains(hour), (0...59).contains(minute) else {
            throw CodexStatusParseError.invalidResetDate
        }

        var calendar = inputCalendar
        calendar.locale = Locale(identifier: "en_US_POSIX")

        let currentYear = calendar.component(.year, from: now)
        guard var resetDate = makeDate(
            year: currentYear,
            month: month,
            day: day,
            hour: hour,
            minute: minute,
            calendar: calendar
        ) else {
            throw CodexStatusParseError.invalidResetDate
        }

        if resetDate <= now {
            guard let nextResetDate = makeDate(
                year: currentYear + 1,
                month: month,
                day: day,
                hour: hour,
                minute: minute,
                calendar: calendar
            ) else {
                throw CodexStatusParseError.invalidResetDate
            }
            resetDate = nextResetDate
        }

        return CodexUsageStatus(
            remainingPercentage: percentage,
            resetDate: resetDate,
            updatedAt: now,
            sourceText: text.trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }

    private func captureGroups(pattern: String, in text: String) -> [String] {
        guard let expression = try? NSRegularExpression(
            pattern: pattern,
            options: [.caseInsensitive]
        ) else {
            return []
        }

        let fullRange = NSRange(text.startIndex..<text.endIndex, in: text)
        guard let match = expression.firstMatch(in: text, range: fullRange) else {
            return []
        }

        return (1..<match.numberOfRanges).compactMap { index in
            guard let range = Range(match.range(at: index), in: text) else {
                return nil
            }
            return String(text[range])
        }
    }

    private func makeDate(
        year: Int,
        month: Int,
        day: Int,
        hour: Int,
        minute: Int,
        calendar: Calendar
    ) -> Date? {
        var components = DateComponents()
        components.calendar = calendar
        components.timeZone = calendar.timeZone
        components.year = year
        components.month = month
        components.day = day
        components.hour = hour
        components.minute = minute

        guard let date = calendar.date(from: components),
              calendar.component(.year, from: date) == year,
              calendar.component(.month, from: date) == month,
              calendar.component(.day, from: date) == day,
              calendar.component(.hour, from: date) == hour,
              calendar.component(.minute, from: date) == minute else {
            return nil
        }

        return date
    }

    private static func monthNumber(for token: String) -> Int? {
        let abbreviation = String(token.lowercased().prefix(3))
        return [
            "jan": 1,
            "feb": 2,
            "mar": 3,
            "apr": 4,
            "may": 5,
            "jun": 6,
            "jul": 7,
            "aug": 8,
            "sep": 9,
            "oct": 10,
            "nov": 11,
            "dec": 12,
        ][abbreviation]
    }
}

struct CodexStatusStore {
    private let defaults: UserDefaults

    init(defaults: UserDefaults? = UserDefaults(suiteName: CodexStatusConstants.appGroupIdentifier)) {
        self.defaults = defaults ?? .standard
    }

    func loadSaved() -> CodexUsageStatus? {
        guard let data = defaults.data(forKey: CodexStatusConstants.storageKey),
              let status = try? JSONDecoder().decode(CodexUsageStatus.self, from: data) else {
            return nil
        }
        return status
    }

    func load() -> CodexUsageStatus {
        loadSaved() ?? .example
    }

    func save(_ status: CodexUsageStatus) throws {
        let data = try JSONEncoder().encode(status)
        defaults.set(data, forKey: CodexStatusConstants.storageKey)
    }

    func clear() {
        defaults.removeObject(forKey: CodexStatusConstants.storageKey)
    }
}
