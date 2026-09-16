import SwiftUI

struct AgentFocusPanel: View {
    let provider: AgentProviderReading
    @State private var period: AgentQuotaPeriod?
    @ScaledMetric(relativeTo: .largeTitle) private var valueSize = 110.0

    private var window: AgentQuotaWindow? { provider.window(for: period) }

    var body: some View {
        VStack(spacing: 0) {
            Text(verbatim: "\(provider.id.source) · \(provider.id.name)")
                .font(.subheadline)
                .foregroundStyle(DataPlaneTheme.muted)
            if let weekly = provider.weekly, let short = provider.shortWindow {
                Picker(L10n.text("Quota period"), selection: Binding(
                    get: { period ?? provider.defaultPeriod }, set: { period = $0 }
                )) {
                    Text(weekly.label).tag(AgentQuotaPeriod.weekly)
                    Text(short.label).tag(AgentQuotaPeriod.shortWindow)
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 240)
                .padding(.top, 12)
            } else {
                Text(window?.label ?? L10n.text("Unavailable"))
                    .font(.title3.weight(.medium))
                    .foregroundStyle(DataPlaneTheme.ink)
                    .padding(.top, 8)
            }

            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(window.map { String($0.remainingPercentage) } ?? "—")
                    .font(.system(size: valueSize, weight: .medium))
                    .tracking(-4).monospacedDigit()
                    .foregroundStyle(DataPlaneTheme.ink)
                if window != nil {
                    Text("%").font(.largeTitle).foregroundStyle(DataPlaneTheme.muted)
                }
            }
            .lineLimit(1).minimumScaleFactor(0.45)
            .padding(.top, 22)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(L10n.text("{0} quota", provider.id.name))
            .accessibilityValue(window.map { L10n.text("{0} percent remaining", $0.remainingPercentage) } ?? L10n.text("Unavailable"))
            .accessibilityIdentifier("weeklyQuotaValue")

            Text(window == nil ? L10n.text("Check this service in Companion.") : L10n.text("remaining"))
                .font(.subheadline).foregroundStyle(DataPlaneTheme.muted)

            DataPlaneMeter(remainingPercentage: window?.remainingPercentage ?? 0)
                .padding(.top, 28).padding(.bottom, 14)
                .accessibilityHidden(true)

            if let window {
                Text(L10n.text("Resets") + " " + window.resetDate.formatted(
                    .dateTime.day().month(.abbreviated).hour().minute().locale(L10n.locale)))
                    .font(.footnote).foregroundStyle(DataPlaneTheme.muted)
                    .multilineTextAlignment(.center)
            }
            Text(provider.status == "ready"
                ? L10n.text("Last sample: {0}", L10n.relative(provider.updatedAt))
                : L10n.text("Last attempt: {0}", L10n.relative(provider.updatedAt)))
                .font(.caption).foregroundStyle(DataPlaneTheme.muted)
                .padding(.top, 24)
            if provider.isStale(at: .now, period: period), window != nil {
                Text(L10n.text("Waiting for a fresh sample"))
                    .font(.caption).foregroundStyle(DataPlaneTheme.signal).padding(.top, 6)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }
}

struct AgentWatchlist: View {
    let providers: [AgentProviderReading]
    let onSelect: (AgentProviderID) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(providers) { provider in
                DataPlaneRule()
                Button { onSelect(provider.id) } label: {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(verbatim: provider.id.name).font(.subheadline.weight(.medium))
                                .foregroundStyle(DataPlaneTheme.ink)
                            Text(provider.window()?.label ?? L10n.text("Unavailable"))
                                .font(.caption).foregroundStyle(DataPlaneTheme.muted)
                        }
                        Spacer(minLength: 8)
                        if let window = provider.window() {
                            HStack(alignment: .firstTextBaseline, spacing: 5) {
                                Text(window.remainingPercentage, format: .number).font(.title2).monospacedDigit()
                                Text("%").font(.caption)
                            }
                            .foregroundStyle(DataPlaneTheme.ink)
                        } else { Text("—").foregroundStyle(DataPlaneTheme.muted) }
                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(DataPlaneTheme.muted)
                    }
                    .padding(.vertical, 14).frame(minHeight: 60).contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityHint(L10n.text("Show this service in the main view and small widget"))
                .accessibilityIdentifier("focus-\(provider.id.rawValue)")
            }
        }
    }
}
