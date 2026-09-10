import XCTest

/// Real app captures, using only the public demo/manual controls on an unpaired simulator.
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
        try XCTSkipUnless(scan.waitForExistence(timeout: 10), "Use a clean, unpaired simulator.")

        let demo = app.buttons[spanish ? "Ver demo local" : "View local demo"]
        if demo.exists {
            reveal(demo, in: app)
            demo.tap()
        }

        let manual = app.buttons.matching(NSPredicate(
            format: "label CONTAINS %@", spanish ? "Actualización manual" : "Manual update"
        )).firstMatch
        XCTAssertTrue(manual.waitForExistence(timeout: 5))
        reveal(manual, in: app)
        manual.tap()

        let example = app.buttons[spanish ? "Usar ejemplo" : "Use example"]
        XCTAssertTrue(example.waitForExistence(timeout: 5))
        reveal(example, in: app)
        example.tap()
        let save = app.buttons[spanish ? "Guardar en este dispositivo" : "Save on this device"]
        reveal(save, in: app)
        save.tap()
        XCTAssertTrue(app.staticTexts[spanish
            ? "Widget local actualizado. El relay no fue modificado."
            : "Local widget updated. The relay was not changed."].waitForExistence(timeout: 5))

        // Collapse the editor and return to the quota overview.
        reveal(manual, in: app, upwards: true)
        manual.tap()
        for _ in 0..<4 { app.swipeDown() }
        let quota = app.descendants(matching: .any)["weeklyQuotaValue"]
        XCTAssertTrue(quota.waitForExistence(timeout: 5))
        XCTAssertEqual(quota.value as? String,
            spanish ? "70 por ciento restante" : "70 percent remaining")
        retain(app, "\(language)-01-weekly-quota")

        reveal(manual, in: app)
        manual.tap()
        reveal(save, in: app)
        // Retain the scrolled editor for visual QA. A successful UI test alone
        // does not qualify an attachment for the store: inspect safe-area overlap.
        app.swipeUp()
        retain(app, "\(language)-02-manual-update")

        for _ in 0..<4 { app.swipeDown() }
        reveal(scan, in: app)
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
