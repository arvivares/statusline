import SwiftUI

struct EmptyAgentWidget: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L10n.text("Statusline")).font(.subheadline.weight(.medium)).foregroundStyle(DataPlaneTheme.ink)
            Spacer(minLength: 0)
            Text("—").font(.largeTitle).foregroundStyle(DataPlaneTheme.muted)
            DataPlaneMeter(remainingPercentage: 0, height: 5).accessibilityHidden(true)
            Text(L10n.text("CONNECT COMPANION")).font(.caption2).foregroundStyle(DataPlaneTheme.muted)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.text("No services to show. Open Statusline Companion on your computer."))
    }
}

struct SmallAgentWidget: View {
    let provider: AgentProviderReading
    let date: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            AgentWidgetHeading(provider: provider)
            Spacer(minLength: 0)
            AgentWidgetNumber(window: provider.window(), size: 46)
            DataPlaneMeter(remainingPercentage: provider.window()?.remainingPercentage ?? 0, height: 5, stripeWidth: 2)
                .accessibilityHidden(true)
            if let window = provider.window() {
                Text(L10n.text("Resets") + " " + window.resetDate.formatted(
                    .dateTime.day().month(.abbreviated).hour().minute().locale(L10n.locale)))
                    .font(.system(size: 10)).foregroundStyle(DataPlaneTheme.muted)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
            AgentWidgetAge(provider: provider, date: date)
        }
        .accessibilityElement(children: .combine)
    }
}

struct MediumAgentWidget: View {
    let provider: AgentProviderReading
    let watchlist: [AgentProviderReading]
    let date: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                AgentWidgetHeading(provider: provider)
                Spacer(minLength: 8)
                AgentWidgetAge(provider: provider, date: date)
            }
            HStack {
                AgentWidgetNumber(window: provider.window(), size: watchlist.isEmpty ? 58 : 46)
                Spacer(minLength: 12)
                if let window = provider.window() {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(L10n.text("Resets")).font(.caption2)
                        Text(window.resetDate, format: .dateTime.hour().minute()).font(.headline)
                            .foregroundStyle(DataPlaneTheme.ink)
                        Text(window.resetDate, format: .dateTime.day().month(.abbreviated)).font(.caption2)
                    }
                    .foregroundStyle(DataPlaneTheme.muted)
                }
            }
            DataPlaneMeter(remainingPercentage: provider.window()?.remainingPercentage ?? 0, height: 5)
                .accessibilityHidden(true)
            ForEach(watchlist) { other in
                HStack(spacing: 6) {
                    Text(verbatim: other.id.name).font(.caption.weight(.medium)).foregroundStyle(DataPlaneTheme.ink)
                    Text(other.window()?.label ?? L10n.text("Unavailable")).font(.caption2).foregroundStyle(DataPlaneTheme.muted)
                    Spacer(minLength: 8)
                    if let window = other.window() {
                        Text(L10n.text("{0}% left", window.remainingPercentage))
                            .font(.caption).monospacedDigit().foregroundStyle(DataPlaneTheme.ink)
                    }
                    if other.isStale(at: date) {
                        Image(systemName: "clock.badge.exclamationmark").font(.caption2)
                            .foregroundStyle(DataPlaneTheme.muted).accessibilityLabel(L10n.text("Waiting for a fresh sample"))
                    }
                }
                .padding(.top, 4)
                .accessibilityElement(children: .combine)
            }
        }
    }
}

private struct AgentWidgetHeading: View {
    let provider: AgentProviderReading
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(verbatim: provider.id.name).font(.subheadline.weight(.medium)).foregroundStyle(DataPlaneTheme.ink)
            Text(provider.window()?.label ?? L10n.text("Unavailable")).font(.system(size: 10)).foregroundStyle(DataPlaneTheme.muted)
        }
        .lineLimit(1).minimumScaleFactor(0.8)
    }
}

private struct AgentWidgetNumber: View {
    let window: AgentQuotaWindow?
    let size: CGFloat
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(window.map { String($0.remainingPercentage) } ?? "—")
                .font(.system(size: size, weight: .medium)).monospacedDigit().tracking(-2)
                .foregroundStyle(DataPlaneTheme.ink)
            if window != nil { Text("%").font(.system(size: size * 0.38)).foregroundStyle(DataPlaneTheme.muted) }
        }
        .lineLimit(1).minimumScaleFactor(0.65)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(window.map { L10n.text("{0} percent remaining", $0.remainingPercentage) } ?? L10n.text("Unavailable"))
    }
}

private struct AgentWidgetAge: View {
    let provider: AgentProviderReading
    let date: Date
    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: provider.isStale(at: date) ? "clock.badge.exclamationmark" : "clock")
            Text(provider.updatedAt, style: .relative)
        }
        .font(.system(size: 9, weight: .medium))
        .foregroundStyle(provider.isStale(at: date) ? DataPlaneTheme.muted : DataPlaneTheme.signal)
        .lineLimit(1).minimumScaleFactor(0.75)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(provider.status == "ready"
            ? L10n.text("Last sample: {0}", L10n.relative(provider.updatedAt))
            : L10n.text("Last attempt: {0}", L10n.relative(provider.updatedAt)))
    }
}
