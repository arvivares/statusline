import Foundation
import Testing
@testable import statusline

@Suite("Packaged app and widget relay configuration")
@MainActor
struct BundleConfigurationTests {
    @Test("The embedded widget has the same configured relay and version as the app")
    func embeddedWidgetCanResolveItsRelayWithoutEnvironmentOverrides() throws {
        let app = Bundle.main
        let plugins = try #require(app.builtInPlugInsURL)
        let widget = try #require(Bundle(url: plugins.appendingPathComponent("CodexStatusWidgetExtension.appex")))
        // An injected environment value must not mask an empty packaged plist.
        let appConfiguration = try #require(StatusRelayConfiguration.current(environment: [:], bundle: app))
        let widgetConfiguration = try #require(StatusRelayConfiguration.current(environment: [:], bundle: widget))
        #expect(appConfiguration == widgetConfiguration)
        for key in ["CFBundleShortVersionString", "CFBundleVersion"] {
            let appValue = try #require(app.object(forInfoDictionaryKey: key) as? String)
            let widgetValue = try #require(widget.object(forInfoDictionaryKey: key) as? String)
            #expect(!appValue.isEmpty)
            #expect(appValue == widgetValue)
        }
    }
}
