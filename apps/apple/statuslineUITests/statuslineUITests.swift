//
//  statuslineUITests.swift
//  statuslineUITests
//
//  Created by Inmerzion on 27/8/26.
//

import XCTest

final class statuslineUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testLocalDemoIsAvailableWithoutPairing() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(es)", "-AppleLocale", "es_ES"]
        app.launch()

        let demoButton = app.buttons["Ver demo local"]
        let loadedDemo = demoButton.waitForExistence(timeout: 3)
        if loadedDemo {
            demoButton.tap()
        }

        let quota = app.descendants(matching: .any)["weeklyQuotaValue"]
        XCTAssertTrue(quota.waitForExistence(timeout: 5))

        let quotaValue = try XCTUnwrap(quota.value as? String)
        if loadedDemo {
            XCTAssertEqual(quotaValue, "70 por ciento restante")
        } else {
            let percentage = quotaValue.split(separator: " ").first.flatMap { Int($0) }
            XCTAssertNotNil(percentage)
            XCTAssertTrue((0...100).contains(percentage ?? -1))
        }
    }

    @MainActor
    func testPairingSheetOffersManualFallback() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(es)", "-AppleLocale", "es_ES"]
        app.launch()
        try XCTSkipUnless(app.staticTexts["SIN VÍNCULO"].waitForExistence(timeout: 5),
            "Pairing UI checks require an unpaired installation.")

        let sync = app.buttons["Sincronización privada"]
        if sync.exists {
            scrollToHittable(sync, in: app)
            sync.tap()
        }

        let scanButton = app.buttons["Escanear QR"]
        XCTAssertTrue(scanButton.waitForExistence(timeout: 5))
        scrollToHittable(scanButton, in: app)
        scanButton.tap()

        XCTAssertTrue(app.staticTexts["Conecta este dispositivo"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Cancelar"].exists)
        XCTAssertTrue(app.textFields["statusline://pair?…"].exists)

        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Statusline private pairing"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    @MainActor
    func testEnglishStatusInputIsAbsent() {
        verifyStatusInputIsAbsent(language: "en", locale: "en_US")
    }

    @MainActor
    func testSpanishStatusInputIsAbsent() {
        verifyStatusInputIsAbsent(language: "es", locale: "es_ES")
    }

    @MainActor
    private func verifyStatusInputIsAbsent(language: String, locale: String) {
        let spanish = language == "es"
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(\(language))", "-AppleLocale", locale]
        app.launch()
        defer { app.terminate() }
        XCTAssertTrue(app.staticTexts["Statusline"].waitForExistence(timeout: 5))

        // Check both the overview and the bottom of the scroll view, where the
        // retired editor lived. Pairing links remain in their separate sheet.
        for _ in 0..<5 {
            XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label CONTAINS %@",
                spanish ? "Actualización manual" : "Manual update")).firstMatch.exists)
            XCTAssertFalse(app.textFields[spanish ? "Línea de estado de Codex" : "Codex status line"].exists)
            XCTAssertFalse(app.buttons[spanish ? "Guardar en este dispositivo" : "Save on this device"].exists)
            app.swipeUp()
        }
        XCTAssertTrue(app.buttons[spanish ? "Privacidad" : "Privacy"].isHittable)
        XCTAssertTrue(app.buttons[spanish ? "Soporte" : "Support"].isHittable)
    }

    @MainActor
    private func scrollToHittable(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<5 where !element.isHittable {
            app.swipeUp()
        }
    }

    @MainActor
    func testLaunchPerformance() throws {
        // This measures how long it takes to launch your application.
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            XCUIApplication().launch()
        }
    }
}
