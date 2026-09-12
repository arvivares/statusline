import SwiftUI
import WidgetKit

struct CodexStatusEntry: TimelineEntry {
    let date: Date
    let status: CodexUsageStatus?
}

struct CodexStatusProvider: TimelineProvider {
    // One loader per extension process coalesces small/medium timeline requests.
    private static let loader = CodexWidgetSnapshotLoader(
        reader: CodexRelayReaderRepository(configuration: .current(), isWidget: true),
        sharedStore: CodexStatusStore(),
        widgetStore: CodexStatusStore(defaults: .standard)
    )

    func placeholder(in context: Context) -> CodexStatusEntry {
        CodexStatusEntry(date: .now, status: .example)
    }

    func getSnapshot(
        in context: Context,
        completion: @escaping (CodexStatusEntry) -> Void
    ) {
        let status = context.isPreview ? .example : Self.loader.cachedStatus()
        completion(CodexStatusEntry(date: .now, status: status))
    }

    func getTimeline(
        in context: Context,
        completion: @escaping (Timeline<CodexStatusEntry>) -> Void
    ) {
        if context.isPreview {
            completion(Timeline(entries: [placeholder(in: context)], policy: .never))
            return
        }
        Task { @MainActor in
            let loader = Self.loader
            let status = await loader.load()
            let now = Date.now
            var entries = [CodexStatusEntry(date: now, status: status)]
            let refreshDate = CodexSyncPolicy.nextWidgetRefresh(after: now, status: status)
            // Change freshness locally without spending another network reload.
            if let status {
                let staleAt = min(status.updatedAt.addingTimeInterval(CodexSyncPolicy.staleInterval), status.resetDate)
                if staleAt > now, staleAt < refreshDate {
                    entries.append(CodexStatusEntry(date: staleAt, status: status))
                }
            }
            completion(Timeline(entries: entries, policy: .after(refreshDate)))
        }
    }
}

struct CodexStatusWidgetEntryView: View {
    @Environment(\.widgetFamily) private var widgetFamily

    let entry: CodexStatusEntry

    var body: some View {
        Group {
            if let status = entry.status {
                if widgetFamily == .systemMedium {
                    MediumDataPlaneWidget(status: status, date: entry.date)
                } else {
                    SmallDataPlaneWidget(status: status, date: entry.date)
                }
            } else {
                EmptyDataPlaneWidget()
            }
        }
        .containerBackground(for: .widget) {
            DataPlaneGridBackground(spacing: 18)
        }
        .preferredColorScheme(.dark)
        .environment(\.locale, L10n.locale)
    }
}

private struct EmptyDataPlaneWidget: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                DataPlaneLabel(text: L10n.text("WEEKLY LIMIT"), tint: DataPlaneTheme.signal)
                Spacer()
                DataPlaneLabel(text: L10n.text("NO DATA"))
            }

            Spacer(minLength: 0)

            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("--")
                    .font(.largeTitle.bold())
                    .foregroundStyle(DataPlaneTheme.ink)
                Text("%")
                    .font(.headline.bold())
                    .foregroundStyle(DataPlaneTheme.muted)
            }

            DataPlaneMeter(remainingPercentage: 0, height: 6, showsScale: false)
                .accessibilityHidden(true)

            DataPlaneLabel(text: L10n.text("CONNECT COMPANION"))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.text("No Codex data. Open Statusline Companion on your computer."))
    }
}

private struct SmallDataPlaneWidget: View {
    let status: CodexUsageStatus
    let date: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(L10n.text("Codex")).font(.subheadline.weight(.medium)).foregroundStyle(DataPlaneTheme.ink)
                Text(L10n.text("Weekly")).font(.system(size: 10)).foregroundStyle(DataPlaneTheme.muted)
            }
            Spacer(minLength: 0)
            WidgetQuotaNumber(status: status, size: 46)
            DataPlaneMeter(remainingPercentage: status.remainingPercentage, height: 5, stripeWidth: 2)
                .accessibilityHidden(true)
            Text(L10n.text("Resets") + " " + status.resetDate.formatted(
                .dateTime.day().month(.abbreviated).hour().minute().locale(L10n.locale)
            ))
            .font(.system(size: 10))
            .foregroundStyle(DataPlaneTheme.muted)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            WidgetSampleAge(status: status, date: date)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.text("Codex weekly limit"))
        .accessibilityValue(
            L10n.text("{0} percent remaining. Resets {1}", status.remainingPercentage,
                      status.resetDate.formatted(.dateTime.locale(L10n.locale)))
            + ". " + L10n.text("Last sample: {0}", L10n.relative(status.updatedAt))
        )
    }
}

private struct MediumDataPlaneWidget: View {
    let status: CodexUsageStatus
    let date: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(L10n.text("Codex")).font(.subheadline.weight(.medium)).foregroundStyle(DataPlaneTheme.ink)
                DataPlaneLabel(text: L10n.text("Weekly"))
                Spacer()
                WidgetSampleAge(status: status, date: date)
            }
            HStack(alignment: .center) {
                WidgetQuotaNumber(status: status, size: 58)
                Spacer(minLength: 16)
                VStack(alignment: .trailing, spacing: 4) {
                    DataPlaneLabel(text: L10n.text("Resets"))
                    Text(status.resetDate, format: .dateTime.hour().minute())
                        .font(.title3.weight(.medium))
                        .foregroundStyle(DataPlaneTheme.ink)
                    Text(status.resetDate, format: .dateTime.day().month(.abbreviated))
                        .font(.caption)
                        .foregroundStyle(DataPlaneTheme.muted)
                }
            }
            DataPlaneMeter(remainingPercentage: status.remainingPercentage, height: 6)
                .accessibilityHidden(true)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.text("Codex weekly limit"))
        .accessibilityValue(
            L10n.text("{0} percent remaining. Resets {1}", status.remainingPercentage,
                      status.resetDate.formatted(.dateTime.locale(L10n.locale)))
            + ". " + L10n.text("Last sample: {0}", L10n.relative(status.updatedAt))
        )
    }
}

private struct WidgetQuotaNumber: View {
    let status: CodexUsageStatus
    let size: CGFloat

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(status.remainingPercentage, format: .number)
                .font(.system(size: size, weight: .medium))
                .monospacedDigit()
                .tracking(-2)
                .foregroundStyle(DataPlaneTheme.ink)
            Text("%")
                .font(.system(size: size * 0.38))
                .foregroundStyle(DataPlaneTheme.muted)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.65)
    }
}

private struct WidgetSampleAge: View {
    let status: CodexUsageStatus
    let date: Date

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: CodexSyncPolicy.isStale(status, at: date) ? "clock.badge.exclamationmark" : "clock")
            Text(status.updatedAt, style: .relative)
        }
        .font(.system(size: 9, weight: .medium))
        .foregroundStyle(CodexSyncPolicy.isStale(status, at: date) ? DataPlaneTheme.muted : DataPlaneTheme.signal)
        .lineLimit(1)
        .minimumScaleFactor(0.75)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.text("Last sample: {0}", L10n.relative(status.updatedAt)))
    }
}

struct CodexStatusWidget: Widget {
    let kind = CodexStatusConstants.widgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CodexStatusProvider()) { entry in
            CodexStatusWidgetEntryView(entry: entry)
        }
        .configurationDisplayName(L10n.text("Codex usage"))
        .description(L10n.text("See your remaining weekly quota and its next reset."))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct CodexStatusWidgetBundle: WidgetBundle {
    var body: some Widget {
        CodexStatusWidget()
    }
}
