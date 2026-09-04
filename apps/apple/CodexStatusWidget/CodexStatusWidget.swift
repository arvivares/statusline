import SwiftUI
import WidgetKit

struct CodexStatusEntry: TimelineEntry {
    let date: Date
    let status: CodexUsageStatus?
}

struct CodexStatusProvider: TimelineProvider {
    func placeholder(in context: Context) -> CodexStatusEntry {
        CodexStatusEntry(date: .now, status: .example)
    }

    func getSnapshot(
        in context: Context,
        completion: @escaping (CodexStatusEntry) -> Void
    ) {
        let status = context.isPreview ? .example : CodexStatusStore().loadSaved()
        completion(CodexStatusEntry(date: .now, status: status))
    }

    func getTimeline(
        in context: Context,
        completion: @escaping (Timeline<CodexStatusEntry>) -> Void
    ) {
        let now = Date.now
        let status = CodexStatusStore().loadSaved()
        let entry = CodexStatusEntry(date: now, status: status)
        let regularRefresh = now.addingTimeInterval(60 * 60)
        let refreshDate: Date

        if let resetDate = status?.resetDate, resetDate > now {
            refreshDate = min(resetDate, regularRefresh)
        } else {
            refreshDate = regularRefresh
        }

        completion(Timeline(entries: [entry], policy: .after(refreshDate)))
    }
}

struct CodexStatusWidgetEntryView: View {
    @Environment(\.widgetFamily) private var widgetFamily

    let entry: CodexStatusEntry

    var body: some View {
        Group {
            if let status = entry.status {
                if widgetFamily == .systemMedium {
                    MediumDataPlaneWidget(status: status)
                } else {
                    SmallDataPlaneWidget(status: status)
                }
            } else {
                EmptyDataPlaneWidget()
            }
        }
        .containerBackground(for: .widget) {
            DataPlaneGridBackground(spacing: 18)
        }
        .preferredColorScheme(.dark)
    }
}

private struct EmptyDataPlaneWidget: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                DataPlaneLabel(text: "WEEKLY LIMIT", tint: DataPlaneTheme.signal)
                Spacer()
                DataPlaneLabel(text: "NO DATA")
            }

            Spacer(minLength: 0)

            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text("--")
                    .font(.largeTitle.bold())
                    .foregroundStyle(DataPlaneTheme.ink)
                Text("%")
                    .font(.headline.bold())
                    .foregroundStyle(DataPlaneTheme.muted)
            }

            DataPlaneMeter(remainingPercentage: 0, height: 6, showsScale: false)
                .accessibilityHidden(true)

            DataPlaneLabel(text: "CONNECT MAC COMPANION")
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Sin datos de Codex. Abre Statusline Companion en tu Mac.")
    }
}

private struct SmallDataPlaneWidget: View {
    let status: CodexUsageStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                DataPlaneLabel(text: "WEEKLY LIMIT", tint: DataPlaneTheme.signal)
                Spacer()
                DataPlaneStatusIndicator(label: "live")
            }

            Spacer(minLength: 0)

            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(status.remainingPercentage, format: .number)
                    .font(.system(.largeTitle, design: .rounded).bold())
                    .tracking(-2)
                    .foregroundStyle(DataPlaneTheme.ink)
                    .contentTransition(.numericText())

                Text("%")
                    .font(.headline.bold())
                    .foregroundStyle(DataPlaneTheme.emphasis(for: status.remainingPercentage))
            }

            DataPlaneMeter(
                remainingPercentage: status.remainingPercentage,
                height: 6,
                showsScale: false
            )
            .accessibilityHidden(true)

            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    DataPlaneLabel(text: "RESETS")
                    Text(status.resetDate, format: .dateTime.hour().minute())
                        .font(.caption.monospaced().weight(.bold))
                        .foregroundStyle(DataPlaneTheme.signal)
                }

                Spacer()

                Text(status.resetDate, format: .dateTime.day().month(.abbreviated))
                    .font(.caption2.monospaced())
                    .foregroundStyle(DataPlaneTheme.muted)
                    .textCase(.uppercase)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Límite semanal de Codex")
        .accessibilityValue(
            "\(status.remainingPercentage) por ciento restante. Reinicio \(status.resetDate.formatted())"
        )
    }
}

private struct MediumDataPlaneWidget: View {
    let status: CodexUsageStatus

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                DataPlaneLabel(text: "REMAINING", tint: DataPlaneTheme.signal)

                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(status.remainingPercentage, format: .number)
                        .font(.system(.largeTitle, design: .rounded).bold())
                        .tracking(-2)
                        .foregroundStyle(DataPlaneTheme.ink)
                        .contentTransition(.numericText())

                    Text("%")
                        .font(.headline.bold())
                        .foregroundStyle(DataPlaneTheme.emphasis(for: status.remainingPercentage))
                }
            }
            .frame(minWidth: 72, alignment: .leading)

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    DataPlaneLabel(text: "WEEKLY LIMIT")
                    Spacer()
                    DataPlaneStatusIndicator(label: "live")
                }

                DataPlaneMeter(
                    remainingPercentage: status.remainingPercentage,
                    height: 7,
                    showsScale: false
                )

                HStack {
                    Text("0")
                    Spacer()
                    Text("\(status.remainingPercentage) LEFT")
                    Spacer()
                    Text("100")
                }
                .font(.caption2.monospaced())
                .foregroundStyle(DataPlaneTheme.muted)
            }

            Rectangle()
                .fill(DataPlaneTheme.line)
                .frame(width: 1)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 5) {
                DataPlaneLabel(text: "RESETS")
                Text(status.resetDate, format: .dateTime.hour().minute())
                    .font(.headline.monospaced().weight(.bold))
                    .foregroundStyle(DataPlaneTheme.signal)
                Text(status.resetDate, format: .dateTime.day().month(.abbreviated))
                    .font(.caption2.monospaced())
                    .foregroundStyle(DataPlaneTheme.muted)
                    .textCase(.uppercase)
            }
            .frame(minWidth: 62, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Límite semanal de Codex")
        .accessibilityValue(
            "\(status.remainingPercentage) por ciento restante. Reinicio \(status.resetDate.formatted())"
        )
    }
}

struct CodexStatusWidget: Widget {
    let kind = CodexStatusConstants.widgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CodexStatusProvider()) { entry in
            CodexStatusWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Codex Data Plane")
        .description("Consulta el límite semanal restante y su próximo reinicio.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct CodexStatusWidgetBundle: WidgetBundle {
    var body: some Widget {
        CodexStatusWidget()
    }
}
