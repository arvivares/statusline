import SwiftUI
import Testing
@testable import statusline

@Suite("Still Signature layout captures")
@MainActor
struct AgentLayoutTests {
    @Test(arguments: ["codex", "antigravity", "both", "unavailable"])
    func capturesActualViews(variant: String) throws {
        let now = Date.now
        let checked = now.addingTimeInterval(-120)
        let weekly = AgentQuotaWindow(remainingPercentage: 53, resetAt: Int64(now.timeIntervalSince1970) + 500_000, windowMinutes: 10_080)
        let short = AgentQuotaWindow(remainingPercentage: 73, resetAt: Int64(now.timeIntervalSince1970) + 3_600, windowMinutes: 300)
        let codex = AgentProviderReading(id: .codex, status: "ready", updatedAt: checked, weekly: weekly, shortWindow: nil)
        let google = AgentProviderReading(id: .antigravity, status: variant == "unavailable" ? "unavailable" : "ready",
            updatedAt: checked, weekly: nil, shortWindow: variant == "unavailable" ? nil : short)
        let focused = variant == "codex" ? codex : google
        let watchlist = variant == "both" || variant == "unavailable" ? [codex] : []
        try capture(SmallAgentWidget(provider: focused, date: now).padding(16).frame(width: 170, height: 170), name: "small-\(variant)")
        try capture(MediumAgentWidget(provider: focused, watchlist: watchlist, date: now).padding(16).frame(width: 364, height: 170), name: "medium-\(variant)")
        try capture(VStack(spacing: 16) {
            AgentFocusPanel(provider: focused)
            AgentWatchlist(providers: watchlist, onSelect: { _ in })
        }.padding(.horizontal, 28).frame(width: 390), name: "phone-\(variant)")
    }

    private func capture(_ content: some View, name: String) throws {
        let renderer = ImageRenderer(content: content.background(DataPlaneTheme.canvas)
            .environment(\.locale, L10n.locale).preferredColorScheme(.dark))
        renderer.scale = 2
        let data = try #require(renderer.uiImage?.pngData())
        #expect(data.count > 1_000)
        Attachment.record(data, named: "\(name)-\(L10n.language).png")
    }
}
