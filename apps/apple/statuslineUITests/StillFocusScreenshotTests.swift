import XCTest

/// Store artwork source captures. Only public demo controls on the dedicated QA simulator.
@MainActor
final class StillFocusScreenshotTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        #if !targetEnvironment(simulator)
        throw XCTSkip("Store captures must never run on a physical device.")
        #endif
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] == "Statusline README QA",
            "Use the dedicated, unpaired Statusline README QA simulator.")
    }

    func testEnglishViews() throws { try capture(language: "en", locale: "en_US") }
    func testSpanishViews() throws { try capture(language: "es", locale: "es_ES") }

    func testEnglishWidgetHome() throws { try captureWidgetHome(language: "en", locale: "en_US") }
    func testSpanishWidgetHome() throws { try captureWidgetHome(language: "es", locale: "es_ES") }

    /// Fixture: a medium widget at the top of Home Screen page 2.
    /// WidgetKit follows the simulator's system language, not the app launch override.
    private func captureWidgetHome(language: String, locale: String) throws {
        try XCTSkipUnless(Locale.preferredLanguages.first?.hasPrefix(language) == true,
            "Set the isolated simulator system language to \(language) and restart it first.")
        try capture(language: language, locale: locale)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        XCUIDevice.shared.press(.home)
        springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.65))
            .press(forDuration: 0.05, thenDragTo: springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.65)))
        let quota = springboard.descendants(matching: .any).matching(NSPredicate(format: "label == %@",
            language == "es" ? "Límite semanal de Codex" : "Codex weekly limit")).firstMatch
        XCTAssertTrue(quota.waitForExistence(timeout: 10), "Expected the localized medium widget on page 2.")
        retain(springboard, "\(language)-04-widget-home")
    }

    private func capture(language: String, locale: String) throws {
        let es = language == "es"
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(\(language))", "-AppleLocale", locale]
        app.launch()
        defer { app.terminate() }
        try XCTSkipUnless(app.staticTexts[es ? "SIN VÍNCULO" : "UNPAIRED"].waitForExistence(timeout: 8),
            "Refusing to alter a paired or incorrectly signed simulator.")

        let demo = app.buttons[es ? "Ver demo local" : "View local demo"]
        if demo.exists {
            reveal(demo, app: app)
            demo.tap()
        }
        top(app)
        let quota = app.descendants(matching: .any)["weeklyQuotaValue"]
        XCTAssertTrue(quota.waitForExistence(timeout: 5))
        XCTAssertEqual(quota.value as? String, es ? "70 por ciento restante" : "70 percent remaining")
        retain(app, "\(language)-01-quota")

        let sync = app.buttons[es ? "Sincronización privada" : "Private sync"]
        reveal(sync, app: app)
        sync.tap()
        let scan = app.buttons[es ? "Escanear QR" : "Scan QR"]
        reveal(scan, app: app)
        retain(app, "\(language)-03-private-sync")

        let privacy = app.buttons[es ? "Privacidad" : "Privacy"]
        reveal(privacy, app: app)
        retain(app, "\(language)-05-privacy")
    }

    private func reveal(_ element: XCUIElement, app: XCUIApplication, upwards: Bool = false) {
        for _ in 0..<8 where !element.isHittable {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: upwards ? 0.35 : 0.77))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: upwards ? 0.77 : 0.35))
            start.press(forDuration: 0.03, thenDragTo: end)
        }
        XCTAssertTrue(element.isHittable, "Expected visible control: \(element.label)")
    }

    private func top(_ app: XCUIApplication) { for _ in 0..<4 { app.swipeDown() } }
    private func retain(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "still-focus-\(name)"
        shot.lifetime = .keepAlways
        add(shot)
    }
}
