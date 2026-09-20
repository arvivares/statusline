import XCTest

/// Real app captures, using only the public demo/sync controls on an unpaired simulator.
/// Run this class explicitly; it never pairs, signs in, or modifies a physical phone.
@MainActor
final class StoreScreenshotTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        #if !targetEnvironment(simulator)
        throw XCTSkip("Store captures require an unpaired simulator, never a personal phone.")
        #endif
    }

    func testEnglishScreenshots() throws {
        try capture(language: "en", locale: "en_US")
    }

    func testSpanishScreenshots() throws {
        try capture(language: "es", locale: "es_ES")
    }

    private func capture(language: String, locale: String) throws {
        let spanish = language == "es"
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(\(language))", "-AppleLocale", locale]
        app.launch()
        defer { app.terminate() }

        let scan = app.buttons[spanish ? "Escanear QR" : "Scan QR"]
        // A paired simulator must not be disconnected or overwritten for a screenshot.
        try XCTSkipUnless(app.staticTexts[spanish ? "SIN VÍNCULO" : "UNPAIRED"]
            .waitForExistence(timeout: 10), "Use a clean, unpaired simulator.")

        let demo = app.buttons[spanish ? "Ver demo local" : "View local demo"]
        if demo.exists {
            reveal(demo, in: app)
            demo.tap()
        }

        for _ in 0..<4 { app.swipeDown() }
        let quota = app.descendants(matching: .any)["weeklyQuotaValue"]
        XCTAssertTrue(quota.waitForExistence(timeout: 5))
        XCTAssertEqual(quota.value as? String,
            spanish ? "70 por ciento restante" : "70 percent remaining")
        retain(app, "\(language)-01-weekly-quota")

        let sync = app.buttons[spanish ? "Sincronización privada" : "Private sync"]
        reveal(sync, in: app)
        sync.tap()
        reveal(scan, in: app)
        retain(app, "\(language)-02-private-sync")
        scan.tap()
        XCTAssertTrue(app.staticTexts[spanish ? "Conecta este dispositivo" : "Connect this device"]
            .waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons[spanish ? "Cancelar" : "Cancel"].exists)
        retain(app, "\(language)-03-private-pairing")
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication, upwards: Bool = false) {
        for _ in 0..<6 where !element.isHittable {
            if upwards { app.swipeDown() } else { app.swipeUp() }
        }
        XCTAssertTrue(element.isHittable)
    }

    private func retain(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
