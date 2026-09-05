import Foundation

/// Compile alongside Shared/L10n.swift, then pass an app bundle and repository root.
/// Exercises the actual compiled string tables without installing an app or simulator.
@main
enum AppleLocalizationCheck {
    static func main() throws {
        guard CommandLine.arguments.count == 3,
              let bundle = Bundle(path: CommandLine.arguments[1]) else {
            fatalError("Usage: check-apple-localization <built-app-bundle> <repository-root>")
        }
        let root = URL(fileURLWithPath: CommandLine.arguments[2])
        let catalog = try JSONDecoder().decode([String: String].self,
            from: Data(contentsOf: root.appendingPathComponent("localization/messages.json")))
        struct LocaleCase: Decodable { let primary: String; let expected: String }
        let cases = try JSONDecoder().decode([LocaleCase].self,
            from: Data(contentsOf: root.appendingPathComponent("localization/locale-cases.json")))
        for sample in cases {
            precondition(L10n.resolveLanguage(sample.primary) == sample.expected, sample.primary)
        }
        for (key, spanish) in catalog {
            precondition(L10n.translate(key, primary: "es-MX", bundle: bundle) == spanish, key)
            precondition(L10n.translate(key, primary: "en-GB", bundle: bundle) == key, key)
            precondition(L10n.translate(key, primary: "fr-FR", bundle: bundle) == key, key)
        }
        precondition(L10n.translate("{0} percent remaining. Resets {1}", primary: "es",
            arguments: ["{1}", "Monday"], bundle: bundle) == "{1} por ciento restante. Reinicia Monday")
        print("Apple localization: \(catalog.count) compiled messages × 3 languages and \(cases.count) locale cases passed.")
    }
}
