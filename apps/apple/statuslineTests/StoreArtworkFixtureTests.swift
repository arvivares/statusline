import Foundation
import Testing
import WidgetKit
@testable import statusline

/// Opt-in, synthetic capture fixture. Not linked into the distributed app.
@Suite("Store artwork fixture", .serialized)
@MainActor
struct StoreArtworkFixtureTests {
    @Test(.enabled(if: ["Statusline README QA", "Statusline Mobile Claude QA"].contains(ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] ?? "")
        && FileManager.default.fileExists(atPath: NSHomeDirectory() + "/tmp/statusline-store-capture.allow")))
    func seedUnpairedCaptureSimulator() throws {
        #if targetEnvironment(simulator)
        let reader = CodexRelayReaderRepository()
        #expect(try reader.isPaired() == false)
        try #require(reader.pairedChannelID() == nil, "Never overwrite a real pairing.")
        let store = CodexStatusStore()
        try #require(store.servicesStore.load()?.channelID == nil)
        try #require(store.loadSaved()?.relayChannelID == nil)
        let now = Date.now
        let updated = now.addingTimeInterval(-120)
        let weekly = AgentQuotaWindow(remainingPercentage: 53,
            resetAt: Int64(now.timeIntervalSince1970) + 259_200, windowMinutes: 10_080)
        let short = AgentQuotaWindow(remainingPercentage: 73,
            resetAt: Int64(now.timeIntervalSince1970) + 3_600, windowMinutes: 300)
        var providers = [
            AgentProviderReading(id: .codex, status: "ready", updatedAt: updated, weekly: weekly, shortWindow: nil),
            AgentProviderReading(id: .antigravity, status: "ready", updatedAt: updated, weekly: nil, shortWindow: short)
        ]
        if ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] == "Statusline Mobile Claude QA" {
            providers.append(AgentProviderReading(id: .claude, status: "ready", updatedAt: updated,
                weekly: weekly, shortWindow: AgentQuotaWindow(remainingPercentage: 32,
                    resetAt: Int64(now.timeIntervalSince1970) + 7_200, windowMinutes: 300)))
        }
        let snapshot = AgentServicesSnapshot(providers: providers, updatedAt: updated, channelID: nil, sequence: 0)
        try store.servicesStore.save(snapshot)
        store.servicesStore.focus(.codex)
        #expect(store.servicesStore.load() == snapshot)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }
}
