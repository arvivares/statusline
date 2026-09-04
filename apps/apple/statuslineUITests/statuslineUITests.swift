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
        app.launch()

        let scanButton = app.buttons["Escanear QR"]
        XCTAssertTrue(scanButton.waitForExistence(timeout: 5))
        scrollToHittable(scanButton, in: app)
        scanButton.tap()

        XCTAssertTrue(app.staticTexts["Conecta este dispositivo"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Cancelar"].exists)

        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Statusline private pairing"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    @MainActor
    func testManualInputIsReviewable() throws {
        let app = XCUIApplication()
        app.launch()

        let manualInput = app.buttons["FALLBACK.INPUT, Actualización manual"]
        XCTAssertTrue(manualInput.waitForExistence(timeout: 5))
        scrollToHittable(manualInput, in: app)
        manualInput.tap()

        XCTAssertTrue(app.buttons["Usar ejemplo"].waitForExistence(timeout: 5))

        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Statusline local control"
        screenshot.lifetime = .keepAlways
        add(screenshot)
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
