import XCTest

/// Real production controls, synthetic unpaired cache, isolated simulator only.
@MainActor
final class ClaudeMobileUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        #if !targetEnvironment(simulator)
        throw XCTSkip("Never run quota fixtures on a physical device.")
        #endif
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] == "Statusline Mobile Claude QA")
    }

    func testEnglishThreeServices() throws { try validate(language: "en", locale: "en_US") }
    func testSpanishThreeServices() throws { try validate(language: "es", locale: "es_ES") }

    private func validate(language: String, locale: String) throws {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(\(language))", "-AppleLocale", locale]
        app.launch()
        defer { app.terminate() }
        let es = language == "es"
        try XCTSkipUnless(app.staticTexts[es ? "SIN VÍNCULO" : "UNPAIRED"].waitForExistence(timeout: 8),
            "Do not interact with a paired device.")
        let quota = app.descendants(matching: .any)["weeklyQuotaValue"]
        let codex = app.buttons["focus-codex"]
        if codex.exists { reveal(codex, app: app); codex.tap() }
        let claude = app.buttons["focus-claude"]
        reveal(claude, app: app)
        claude.tap()
        XCTAssertEqual(quota.value as? String, es ? "32 por ciento restante" : "32 percent remaining")
        for _ in 0..<3 { app.swipeDown() }
        let period = app.segmentedControls.firstMatch
        XCTAssertTrue(period.waitForExistence(timeout: 5))
        period.buttons[es ? "Semanal" : "Weekly"].tap()
        XCTAssertEqual(quota.value as? String, es ? "53 por ciento restante" : "53 percent remaining")
        period.buttons["5h"].tap()
        XCTAssertEqual(quota.value as? String, es ? "32 por ciento restante" : "32 percent remaining")
        XCTAssertTrue(app.staticTexts["Anthropic · Claude Code"].exists)
        XCTAssertTrue(app.buttons["focus-codex"].exists)
        XCTAssertTrue(app.buttons["focus-antigravity"].exists)
        for _ in 0..<3 { app.swipeDown() }
        XCTAssertTrue(app.buttons["refreshStatus"].exists)
        app.buttons["openSettings"].tap()
        XCTAssertTrue(app.navigationBars[es ? "Configuración" : "Settings"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts[es ? "Notificaciones" : "Notifications"].exists)
        XCTAssertTrue(app.staticTexts[es ? "Sincronización privada" : "Private sync"].exists)
        app.buttons["closeSettings"].tap()
        XCTAssertEqual(quota.value as? String, es ? "32 por ciento restante" : "32 percent remaining")
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "claude-three-services-\(language)"
        capture.lifetime = .keepAlways
        add(capture)
    }

    private func reveal(_ element: XCUIElement, app: XCUIApplication) {
        for _ in 0..<5 where !element.isHittable { app.swipeUp() }
        XCTAssertTrue(element.isHittable)
    }
}
