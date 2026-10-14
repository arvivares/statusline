import SwiftUI

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var viewModel = CodexStatusViewModel()
    @State private var isSettingsPresented = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    DataPlaneAppHeader(
                        syncState: viewModel.relaySyncState,
                        isRefreshing: viewModel.isRefreshing,
                        onRefresh: refreshFromRelay,
                        onSettings: { isSettingsPresented = true }
                    )

                    if let focused = viewModel.focusedProvider {
                        AgentFocusPanel(provider: focused).id(focused.id)
                        AgentWatchlist(providers: viewModel.watchlist, onSelect: viewModel.focus)
                    } else {
                        WaitingForDesktopPanel(
                            syncState: viewModel.relaySyncState,
                            hasInventory: viewModel.services != nil,
                            onLoadDemo: loadLocalDemo
                        )
                    }

                    if !viewModel.relaySyncState.isPaired {
                        Button(L10n.text("Private sync"), systemImage: "link") {
                            isSettingsPresented = true
                        }
                        .buttonStyle(DataPlaneSecondaryButtonStyle())
                    }

                    if let feedback = viewModel.feedback {
                        StatusFeedbackLabel(feedback: feedback)
                    }
                }
                .frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 28)
                .padding(.vertical, 18)
            }
            .scrollIndicators(.hidden)
            .background {
                DataPlaneGridBackground()
                    .ignoresSafeArea()
            }
            .toolbar(.hidden, for: .navigationBar)
            .task(id: scenePhase) {
                guard scenePhase == .active else { return }
                await viewModel.runForegroundRefresh()
            }
            .sheet(isPresented: $isSettingsPresented) {
                StatuslineSettingsView(viewModel: viewModel)
            }
        }
        .tint(DataPlaneTheme.signal)
        .preferredColorScheme(.dark)
    }

    private func refreshFromRelay() {
        Task {
            await viewModel.refreshFromRelay(userInitiated: true)
        }
    }

    private func loadLocalDemo() {
        viewModel.loadLocalDemo()
    }
}

private struct StatuslineSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var viewModel: CodexStatusViewModel
    @State private var isPairingPresented = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 18) {
                        DataPlaneLabel(text: L10n.text("Notifications"), tint: DataPlaneTheme.ink)

                        if viewModel.relaySyncState.isPaired,
                            viewModel.services?.providers.contains(where: { $0.id == .codex })
                                == true
                                || viewModel.resetNotificationsEnabled
                        {
                            Toggle(
                                isOn: Binding(
                                    get: { viewModel.resetNotificationsEnabled },
                                    set: viewModel.setResetNotifications
                                )
                            ) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(
                                        L10n.text(
                                            "Notify me when new Codex reset credits are added")
                                    )
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(DataPlaneTheme.ink)
                                    Text(
                                        L10n.text(
                                            "Statusline sends a generic alert; reset details stay encrypted."
                                        )
                                    )
                                    .font(.caption)
                                    .foregroundStyle(DataPlaneTheme.muted)
                                    Text(
                                        L10n.text(
                                            "With your permission, Statusline stores an encrypted Firebase installation ID on its relay to send alerts. Turning off all alerts removes the relay registration."
                                        )
                                    )
                                    .font(.caption)
                                    .foregroundStyle(DataPlaneTheme.muted)
                                }
                            }
                            .tint(DataPlaneTheme.signal)
                            .disabled(
                                !ResetPushManager.shared.isConfigured || viewModel.isDisconnecting
                            )
                            .accessibilityIdentifier("codexResetNotifications")
                        }

                        if viewModel.relaySyncState.isPaired,
                            viewModel.services?.providers.isEmpty == false
                                || viewModel.quotaNotificationsEnabled
                        {
                            Toggle(
                                isOn: Binding(
                                    get: { viewModel.quotaNotificationsEnabled },
                                    set: viewModel.setQuotaNotifications
                                )
                            ) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(L10n.text("Quota notifications"))
                                        .font(.subheadline.weight(.medium))
                                        .foregroundStyle(DataPlaneTheme.ink)
                                    Text(
                                        L10n.text(
                                            "When an exhausted 5h or weekly quota resets, and one hour before a weekly reset with at least 20% left."
                                        )
                                    )
                                    .font(.caption)
                                    .foregroundStyle(DataPlaneTheme.muted)
                                    Text(
                                        L10n.text(
                                            "Only for services in your Companion, running and connected. With permission, the relay stores an encrypted Firebase installation ID and receives the alert type, service and delivery expiry; quota readings stay encrypted."
                                        )
                                    )
                                    .font(.caption)
                                    .foregroundStyle(DataPlaneTheme.muted)
                                }
                            }
                            .tint(DataPlaneTheme.signal)
                            .disabled(
                                !ResetPushManager.shared.isConfigured || viewModel.isDisconnecting
                            )
                            .accessibilityIdentifier("quotaNotifications")
                        }

                        if !viewModel.relaySyncState.isPaired {
                            Text(L10n.text("Connect Companion to enable notifications."))
                                .font(.subheadline)
                                .foregroundStyle(DataPlaneTheme.muted)
                        }

                        if viewModel.notificationRegistrationPending {
                            Label(
                                L10n.text("Notifications pending registration"),
                                systemImage: "clock"
                            )
                            .font(.caption)
                            .foregroundStyle(DataPlaneTheme.muted)
                            .accessibilityIdentifier("notificationRegistrationPending")
                        }

                    }

                    if let feedback = viewModel.feedback {
                        StatusFeedbackLabel(feedback: feedback)
                    }

                    DataPlaneRule()
                    UniversalRelayPanel(
                        state: viewModel.relaySyncState,
                        endpoint: viewModel.relayEndpoint,
                        onPair: { isPairingPresented = true },
                        onDisconnect: { viewModel.disconnectRelay() }
                    )
                    DataPlaneRule()
                    StatuslineLegalFooter(
                        privacyURL: StatuslinePublicPage.url(path: "privacy"),
                        supportURL: StatuslinePublicPage.url(path: "support")
                    )
                }
                .frame(maxWidth: 720, alignment: .leading)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 28)
                .padding(.vertical, 24)
            }
            .scrollIndicators(.hidden)
            .background {
                DataPlaneGridBackground()
                    .ignoresSafeArea()
            }
            .navigationTitle(L10n.text("Settings"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.text("Done")) { dismiss() }
                        .accessibilityIdentifier("closeSettings")
                }
            }
            .sheet(isPresented: $isPairingPresented) {
                RelayPairingSheet { uri in
                    await viewModel.pair(using: uri)
                    if viewModel.relaySyncState.isPaired {
                        isPairingPresented = false
                    }
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .tint(DataPlaneTheme.signal)
        .preferredColorScheme(.dark)
    }

}

private struct StatusFeedbackLabel: View {
    let feedback: CodexStatusFeedback

    var body: some View {
        Label(feedback.message, systemImage: feedback.systemImage)
            .font(.caption)
            .foregroundStyle(feedback.isError ? DataPlaneTheme.critical : DataPlaneTheme.signal)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier("statusFeedback")
    }
}

private enum StatuslinePublicPage {
    private static let websiteURL = URL(
        string: "https://statusline.inmerzion.io"
    )!

    static func url(path: String) -> URL {
        let baseURL = L10n.language == "es" ? websiteURL.appending(path: "es") : websiteURL
        return baseURL.appending(path: path)
    }
}

private struct StatuslineLegalFooter: View {
    let privacyURL: URL
    let supportURL: URL

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                DataPlaneLabel(text: L10n.text("PRIVACY / SUPPORT"))
                Spacer()
                DataPlaneLabel(text: L10n.text("INDEPENDENT"), tint: DataPlaneTheme.ink)
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    DataPlaneExternalLink(
                        title: L10n.text("Privacy"),
                        systemImage: "hand.raised",
                        destination: privacyURL
                    )
                    DataPlaneExternalLink(
                        title: L10n.text("Support"),
                        systemImage: "questionmark.circle",
                        destination: supportURL
                    )
                }

                VStack(spacing: 10) {
                    DataPlaneExternalLink(
                        title: L10n.text("Privacy"),
                        systemImage: "hand.raised",
                        destination: privacyURL
                    )
                    DataPlaneExternalLink(
                        title: L10n.text("Support"),
                        systemImage: "questionmark.circle",
                        destination: supportURL
                    )
                }
            }

            Text(
                L10n.text(
                    "Statusline is independent and is not affiliated with or endorsed by OpenAI, Google or Anthropic."
                )
            )
            .font(.caption)
            .foregroundStyle(DataPlaneTheme.muted)
        }
        .padding(.horizontal, 2)
        .accessibilityElement(children: .contain)
    }
}

private struct DataPlaneExternalLink: View {
    let title: String
    let systemImage: String
    let destination: URL

    var body: some View {
        Link(destination: destination) {
            Label(title, systemImage: systemImage)
        }
        .buttonStyle(DataPlaneSecondaryButtonStyle())
        .accessibilityHint(L10n.text("Opens an external web page"))
    }
}

private struct DataPlaneAppHeader: View {
    let syncState: CodexRelaySyncState
    let isRefreshing: Bool
    let onRefresh: () -> Void
    let onSettings: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 5) {
                Text(L10n.text("Statusline"))
                    .font(.headline)
                    .foregroundStyle(DataPlaneTheme.ink)
                DataPlaneStatusIndicator(
                    label: syncState.dataPlaneLabel, tint: syncState.dataPlaneTint)
            }
            Spacer()
            Button(action: onRefresh) {
                Group {
                    if isRefreshing {
                        ProgressView().tint(DataPlaneTheme.signal)
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(.rect)
            }
            .disabled(!syncState.isPaired || isRefreshing)
            .accessibilityLabel(L10n.text("Refresh"))
            .accessibilityIdentifier("refreshStatus")

            Button(action: onSettings) {
                Image(systemName: "gearshape")
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(.rect)
            }
            .accessibilityLabel(L10n.text("Settings"))
            .accessibilityIdentifier("openSettings")
        }
        .buttonStyle(.plain)
        .font(.system(size: 18, weight: .medium))
        .foregroundStyle(DataPlaneTheme.ink)
        .frame(minHeight: 44)
    }
}

private struct WaitingForDesktopPanel: View {
    let syncState: CodexRelaySyncState
    let hasInventory: Bool
    let onLoadDemo: () -> Void

    var body: some View {
        DataPlaneSurface(cornerRadius: 20) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    DataPlaneLabel(text: L10n.text("Your services"))
                    Spacer()
                    DataPlaneLabel(text: L10n.text("NO SAMPLE"), tint: DataPlaneTheme.muted)
                }
                .padding(18)

                DataPlaneRule()

                VStack(alignment: .leading, spacing: 18) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("--")
                            .font(.system(.largeTitle, design: .rounded).bold())
                            .foregroundStyle(DataPlaneTheme.ink)
                        Text(L10n.text("% LEFT"))
                            .font(.caption.monospaced().weight(.bold))
                            .foregroundStyle(DataPlaneTheme.muted)
                    }

                    DataPlaneMeter(remainingPercentage: 0)
                        .accessibilityHidden(true)

                    Text(
                        hasInventory
                            ? L10n.text(
                                "Enable a supported service in your Companion to see its quota here."
                            )
                            : L10n.text(
                                "Open Statusline Companion on Windows, Linux or macOS, create a pairing and scan its QR to receive the first encrypted sample."
                            )
                    )
                    .font(.subheadline)
                    .foregroundStyle(DataPlaneTheme.muted)

                    Button(
                        L10n.text("View local demo"), systemImage: "play.rectangle.fill",
                        action: onLoadDemo
                    )
                    .buttonStyle(DataPlaneSecondaryButtonStyle())
                    .accessibilityHint(
                        L10n.text(
                            "Loads a local sample and updates the widget without an account, a computer or the network."
                        ))
                }
                .padding(18)

                HStack {
                    DataPlaneLabel(text: L10n.text("SOURCE.HOST"))
                    Spacer()
                    DataPlaneStatusIndicator(
                        label: syncState.dataPlaneLabel,
                        tint: syncState.dataPlaneTint
                    )
                }
                .padding(16)
                .overlay(alignment: .top) {
                    DataPlaneRule()
                }
            }
        }
        .accessibilityElement(children: .contain)
    }
}

private struct UniversalRelayPanel: View {
    let state: CodexRelaySyncState
    let endpoint: String?
    let onPair: () -> Void
    let onDisconnect: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            HStack {
                DataPlaneLabel(text: L10n.text("Private sync"), tint: DataPlaneTheme.ink)
                Spacer()
                DataPlaneStatusIndicator(
                    label: state.dataPlaneLabel,
                    tint: state.dataPlaneTint
                )
            }

            Text(state.message)
                .font(.subheadline)
                .foregroundStyle(state.isError ? DataPlaneTheme.critical : DataPlaneTheme.ink)

            Text(
                L10n.text(
                    "The relay stores only AES-256-GCM encrypted quota snapshots. Your agents’ credentials and the encryption key never reach the relay."
                )
            )
            .font(.caption)
            .foregroundStyle(DataPlaneTheme.muted)

            if let endpoint {
                Text(endpoint)
                    .font(.caption2.monospaced())
                    .foregroundStyle(DataPlaneTheme.muted)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { controls }
                VStack(spacing: 10) { controls }
            }
        }
    }

    @ViewBuilder
    private var controls: some View {
        switch state {
        case .notConfigured:
            EmptyView()

        case .unpaired, .failed:
            Button(L10n.text("Scan QR"), systemImage: "qrcode.viewfinder", action: onPair)
                .buttonStyle(DataPlanePrimaryButtonStyle())

        case .pairing:
            HStack(spacing: 9) {
                ProgressView()
                    .controlSize(.small)
                Text(L10n.text("Pairing…"))
            }
            .foregroundStyle(DataPlaneTheme.signal)

        case .syncing, .waitingForDesktop, .synced:
            Button(L10n.text("Disconnect"), systemImage: "link.badge.minus", action: onDisconnect)
                .buttonStyle(DataPlaneSecondaryButtonStyle())
                .disabled(state == .syncing)
        }
    }
}

extension CodexRelaySyncState {
    fileprivate var dataPlaneLabel: String {
        switch self {
        case .notConfigured:
            L10n.text("NO ENDPOINT")
        case .unpaired:
            L10n.text("UNPAIRED")
        case .pairing:
            L10n.text("PAIRING")
        case .syncing:
            L10n.text("SYNCING")
        case .waitingForDesktop:
            L10n.text("WAITING")
        case .synced:
            L10n.text("CURRENT")
        case .failed:
            L10n.text("ERROR")
        }
    }

    fileprivate var dataPlaneTint: Color {
        switch self {
        case .failed:
            DataPlaneTheme.critical
        case .notConfigured, .unpaired, .waitingForDesktop:
            DataPlaneTheme.muted
        case .pairing, .syncing, .synced:
            DataPlaneTheme.signal
        }
    }

    fileprivate var relayValue: String {
        switch self {
        case .notConfigured:
            L10n.text("Relay / config")
        case .unpaired:
            L10n.text("Relay / unpaired")
        case .pairing:
            L10n.text("Relay / pairing")
        case .syncing:
            L10n.text("Relay / syncing")
        case .waitingForDesktop:
            L10n.text("Relay / waiting")
        case .synced:
            L10n.text("Relay / current")
        case .failed:
            L10n.text("Relay / error")
        }
    }
}

#Preview {
    ContentView()
}
