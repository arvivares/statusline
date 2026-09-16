import SwiftUI
import WidgetKit

struct CodexStatusEntry: TimelineEntry {
    let date: Date
    let snapshot: AgentServicesSnapshot?
    var preferred: AgentProviderID? = nil
    var focused: AgentProviderReading? { snapshot?.focusedProvider(preferred: preferred) }
    var watchlist: [AgentProviderReading] { snapshot?.providers.filter { $0.id != focused?.id } ?? [] }
}

struct CodexStatusProvider: TimelineProvider {
    // One request carries the inventory for both widget sizes.
    private static let loader = AgentWidgetSnapshotLoader(
        reader: CodexRelayReaderRepository(configuration: .current(), isWidget: true),
        sharedStore: CodexStatusStore(), widgetStore: CodexStatusStore(defaults: .standard)
    )

    func placeholder(in context: Context) -> CodexStatusEntry {
        CodexStatusEntry(date: .now, snapshot: .legacy(.example))
    }

    func getSnapshot(in context: Context, completion: @escaping (CodexStatusEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : CodexStatusEntry(
            date: .now, snapshot: Self.loader.cachedSnapshot(), preferred: Self.loader.focusedProvider))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CodexStatusEntry>) -> Void) {
        if context.isPreview {
            completion(Timeline(entries: [placeholder(in: context)], policy: .never))
            return
        }
        Task { @MainActor in
            let snapshot = await Self.loader.load()
            let now = Date.now
            let refresh = snapshot?.nextWidgetRefresh(after: now) ?? now.addingTimeInterval(CodexSyncPolicy.widgetInterval)
            let dates = [now] + (snapshot?.staleTransitions(after: now, before: refresh) ?? [])
            completion(Timeline(entries: dates.map {
                CodexStatusEntry(date: $0, snapshot: snapshot, preferred: Self.loader.focusedProvider)
            }, policy: .after(refresh)))
        }
    }
}

struct CodexStatusWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CodexStatusEntry

    var body: some View {
        Group {
            if let focused = entry.focused {
                if family == .systemMedium {
                    MediumAgentWidget(provider: focused, watchlist: entry.watchlist, date: entry.date)
                } else { SmallAgentWidget(provider: focused, date: entry.date) }
            } else { EmptyAgentWidget() }
        }
        .containerBackground(for: .widget) { DataPlaneTheme.canvas }
        .preferredColorScheme(.dark)
        .environment(\.locale, L10n.locale)
    }
}


struct CodexStatusWidget: Widget {
    // Keep the installed widget's identity through this upgrade.
    let kind = CodexStatusConstants.widgetKind
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CodexStatusProvider()) { CodexStatusWidgetEntryView(entry: $0) }
            .configurationDisplayName(L10n.text("Agent usage"))
            .description(L10n.text("Quotas from your Companion. The small widget follows the service selected in Statusline."))
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct CodexStatusWidgetBundle: WidgetBundle {
    var body: some Widget { CodexStatusWidget() }
}
