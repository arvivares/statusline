import XCTest

/// README captures of the real app, not a mockup. Run only on a fresh simulator.
@MainActor
final class ReadmeScreenshotTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        #if !targetEnvironment(simulator)
        throw XCTSkip("README captures require an isolated simulator, never a personal phone.")
        #endif
    }

    func testEnglishDemo() throws {
        try capture(language: "en", locale: "en_US")
    }

    func testSpanishDemo() throws {
        try capture(language: "es", locale: "es_ES")
    }

    private func capture(language: String, locale: String) throws {
        let spanish = language == "es"
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(\(language))", "-AppleLocale", locale]
        app.launch()
        defer { app.terminate() }

        try XCTSkipUnless(app.staticTexts[spanish ? "SIN VÍNCULO" : "UNPAIRED"]
            .waitForExistence(timeout: 5), "Use a clean, unpaired simulator with valid local signing.")

        let demo = app.buttons[spanish ? "Ver demo local" : "View local demo"]
        if demo.waitForExistence(timeout: 5) {
            demo.tap()
        }

        let quota = app.descendants(matching: .any)["weeklyQuotaValue"]
        XCTAssertTrue(quota.waitForExistence(timeout: 5))
        // Refuse non-demo content; this fixture does not sign in or pair devices.
        XCTAssertEqual(quota.value as? String,
            spanish ? "70 por ciento restante" : "70 percent remaining")
        for _ in 0..<2 { app.swipeDown() }

        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "readme-iphone-still-signature-\(language)"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }
}
