import Foundation
import Testing
@testable import statusline

@Suite("English and Spanish localization")
struct LocalizationTests {
    @Test("Uses only the primary system language", arguments: [
        ("es", "es"), ("es-ES", "es"), ("es-MX", "es"), ("ES_ar.UTF-8", "es"),
        ("en-GB", "en"), ("fr-FR", "en"), ("fr:es", "en"), ("ar", "en"),
        ("C", "en"), ("", "en"), ("espanol", "en")
    ])
    func resolvesPrimaryLanguage(primary: String, expected: String) {
        #expect(L10n.resolveLanguage(primary) == expected)
    }

    @Test("Loads both bundled languages and uses English for unsupported languages")
    func loadsTranslatedResources() {
        #expect(L10n.resolveLanguage(nil) == "en")
        #expect(L10n.translate("WEEKLY LIMIT", primary: "es-MX") == "LÍMITE SEMANAL")
        #expect(L10n.translate("WEEKLY LIMIT", primary: "en-GB") == "WEEKLY LIMIT")
        #expect(L10n.translate("WEEKLY LIMIT", primary: "fr-FR") == "WEEKLY LIMIT")
        #expect(L10n.translate("CURRENT", primary: "es") == "AL DÍA")
    }

    @Test("Treats interpolation arguments as literal data")
    func interpolatesOnce() {
        #expect(L10n.translate("{0} / LEFT", primary: "es", arguments: [53]) == "53 / LIBRE")
        #expect(L10n.translate("{0} percent remaining. Resets {1}", primary: "es",
                              arguments: ["{1}", "Monday"]) == "{1} por ciento restante. Reinicia Monday")
    }

    @Test("Does not leak raw relay or operating system messages")
    func localizesErrorBoundary() {
        let error = CodexRelayError.server(code: "pairingExpired", message: "private backend detail")
        #expect(L10n.error(error) == L10n.relayError("pairingExpired"))
        #expect(!L10n.error(error).contains("private backend detail"))
        #expect(L10n.error(NSError(domain: "test", code: 1)) ==
                L10n.text("Statusline could not complete the operation. Please try again."))
    }
}
