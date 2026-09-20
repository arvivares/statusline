import XCTest

/// Captures the production UI with reviewed synthetic local caches, never a paired device.
@MainActor
final class AgentStoreScreenshotTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        #if !targetEnvironment(simulator)
        throw XCTSkip("Only the dedicated capture simulator is allowed.")
        #endif
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] == "Statusline README QA")
    }

    func testEnglishViews() throws { try capture(language: "en", locale: "en_US") }
    func testSpanishViews() throws { try capture(language: "es", locale: "es_ES") }

    func testSpanishWidgetHome() throws { try captureWidgetHome(language: "es", locale: "es_ES") }
    func testEnglishWidgetHome() throws { try captureWidgetHome(language: "en", locale: "en_US") }

    private func captureWidgetHome(language: String, locale: String) throws {
        try XCTSkipUnless(Locale.preferredLanguages.first?.hasPrefix(language) == true,
            "Set the dedicated simulator system language and restart before capturing widgets.")
        try capture(language: language, locale: locale)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        XCUIDevice.shared.press(.home)
        springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.65))
            .press(forDuration: 0.05, thenDragTo: springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.65)))
        let widget = springboard.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@", "Antigravity")).firstMatch
        XCTAssertTrue(widget.waitForExistence(timeout: 10), "A medium Statusline widget must be on Home Screen page 2.")
        retain(springboard, "\(language)-04-widget")
    }

    private func capture(language: String, locale: String) throws {
        let es = language == "es"
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(\(language))", "-AppleLocale", locale]
        app.launch()
        defer { app.terminate() }
        try XCTSkipUnless(app.staticTexts[es ? "SIN VÍNCULO" : "UNPAIRED"].waitForExistence(timeout: 8),
            "Refusing to interact with a paired simulator.")
        let codex = app.buttons["focus-codex"]
        if codex.exists { codex.tap() }
        let quota = app.descendants(matching: .any)["weeklyQuotaValue"]
        XCTAssertEqual(quota.value as? String, es ? "53 por ciento restante" : "53 percent remaining")
        XCTAssertTrue(app.buttons["focus-antigravity"].exists, "Seed the guarded synthetic fixture first.")
        retain(app, "\(language)-01-quota")
        app.buttons["focus-antigravity"].tap()
        XCTAssertEqual(quota.value as? String, es ? "73 por ciento restante" : "73 percent remaining")
        retain(app, "\(language)-02-gemini")

        let sync = app.buttons[es ? "Sincronización privada" : "Private sync"]
        reveal(sync, app: app)
        sync.tap()
        let scan = app.buttons[es ? "Escanear QR" : "Scan QR"]
        reveal(scan, app: app)
        retain(app, "\(language)-03-private-sync")
        let privacy = app.descendants(matching: .any)
            .matching(identifier: es ? "Privacidad" : "Privacy").firstMatch
        reveal(privacy, app: app)
        retain(app, "\(language)-05-privacy")
    }

    private func reveal(_ element: XCUIElement, app: XCUIApplication) {
        for _ in 0..<8 where !element.isHittable {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.77))
                .press(forDuration: 0.03, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.35)))
        }
        XCTAssertTrue(element.isHittable, "Expected visible control: \(element.label)")
    }

    private func retain(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "still-focus-\(name)"
        shot.lifetime = .keepAlways
        add(shot)
    }
}
