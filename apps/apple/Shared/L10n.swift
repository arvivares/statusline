import Foundation

protocol StatuslineLocalizedError: LocalizedError {}

/// UI language only. Never apply this to protocol fields, identifiers or stored samples.
enum L10n {
    nonisolated static func resolveLanguage(_ primary: String?) -> String {
        let language = primary?.trimmingCharacters(in: .whitespacesAndNewlines)
            .components(separatedBy: CharacterSet(charactersIn: "-_:.@"))
            .first?.lowercased()
        return language == "es" ? "es" : "en"
    }

    nonisolated static var language: String {
        resolveLanguage(Locale.preferredLanguages.first)
    }

    nonisolated static var locale: Locale { Locale(identifier: language) }

    nonisolated static func text(_ key: String, _ arguments: Any...) -> String {
        translate(key, primary: language, arguments: arguments)
    }

    nonisolated static func translate(
        _ key: String, primary: String, arguments: [Any] = [], bundle: Bundle = .main
    ) -> String {
        let bundle = bundle.path(forResource: resolveLanguage(primary), ofType: "lproj")
            .flatMap(Bundle.init(path:))
        let template = bundle?.localizedString(forKey: key, value: key, table: "Statusline") ?? key
        guard !arguments.isEmpty else { return template }
        // Replace from the end in one pass; a value containing {0} must stay literal.
        let expression = try! NSRegularExpression(pattern: #"\{(\d+)\}"#)
        var result = template
        for match in expression.matches(in: template, range: NSRange(template.startIndex..., in: template)).reversed() {
            guard let indexRange = Range(match.range(at: 1), in: template),
                  let index = Int(template[indexRange]), arguments.indices.contains(index),
                  let range = Range(match.range, in: result) else { continue }
            result.replaceSubrange(range, with: String(describing: arguments[index]))
        }
        return result
    }

    nonisolated static func relative(_ date: Date) -> String {
        date.formatted(.relative(presentation: .named).locale(locale))
    }

    nonisolated static func error(_ error: Error) -> String {
        // Only our localized errors are user-facing; never display raw OS/server prose.
        if let localized = error as? StatuslineLocalizedError, let description = localized.errorDescription {
            return description
        }
        return text("Statusline could not complete the operation. Please try again.")
    }

    nonisolated static func relayError(_ code: String) -> String {
        switch code {
        case "pairingExpired", "pairingAlreadyClaimed", "invalidPairingToken":
            text("The pairing has expired or was already used. Create a new QR in the companion.")
        case "channelNotFound", "channelExpired", "unauthorized", "invalidReaderToken":
            text("The channel has expired or was disconnected. Pair this device again.")
        case "rateLimited":
            text("Too many requests. Wait a moment before trying again.")
        default:
            text("The relay returned an unexpected response.")
        }
    }
}
