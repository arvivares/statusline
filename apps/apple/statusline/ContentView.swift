import SwiftUI

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var viewModel = CodexStatusViewModel()
    @State private var isManualUpdateExpanded = false
    @State private var isPairingPresented = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    DataPlaneAppHeader(syncState: viewModel.relaySyncState)

                    if let status = viewModel.status {
                        CodexDataPlanePanel(
                            status: status,
                            syncState: viewModel.relaySyncState
                        )
                    } else {
                        WaitingForDesktopPanel(
                            syncState: viewModel.relaySyncState,
                            onLoadDemo: loadLocalDemo
                        )
                    }

                    UniversalRelayPanel(
                        state: viewModel.relaySyncState,
                        endpoint: viewModel.relayEndpoint,
                        onRefresh: refreshFromRelay,
                        onPair: { isPairingPresented = true },
                        onDisconnect: viewModel.disconnectRelay
                    )

                    ManualUpdatePanel(
                        isExpanded: $isManualUpdateExpanded,
                        sourceText: $viewModel.sourceText,
                        feedback: viewModel.feedback,
                        isUpdating: viewModel.isManualUpdateInProgress,
                        onPaste: viewModel.acceptPastedText,
                        onRestoreExample: viewModel.restoreExample,
                        onUpdate: updateStatus
                    )

                    StatuslineLegalFooter(
                        privacyURL: StatuslinePublicPage.url(path: "privacy"),
                        supportURL: StatuslinePublicPage.url(path: "support")
                    )
                }
                .frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 16)
                .padding(.vertical, 18)
            }
            .scrollIndicators(.hidden)
            .background {
                DataPlaneGridBackground()
                    .ignoresSafeArea()
            }
            .toolbar(.hidden, for: .navigationBar)
            .task {
                await viewModel.start()
            }
            .onChange(of: scenePhase, handleScenePhaseChange)
            .sheet(isPresented: $isPairingPresented) {
                RelayPairingSheet { uri in
                    await viewModel.pair(using: uri)
                    if viewModel.relaySyncState.isPaired {
                        isPairingPresented = false
                    }
                }
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

    private func updateStatus() {
        viewModel.updateStatus()
    }

    private func loadLocalDemo() {
        viewModel.loadLocalDemo()
    }

    private func handleScenePhaseChange(_ oldPhase: ScenePhase, _ newPhase: ScenePhase) {
        guard newPhase == .active else {
            return
        }

        Task {
            await viewModel.refreshFromRelay()
        }
    }
}

private enum StatuslinePublicPage {
    private static let fallbackBaseURL = URL(
        string: "https://statusline-relay.inmerzion.workers.dev"
    )!

    static func url(path: String) -> URL {
        let baseURL = StatusRelayConfiguration.current()?.baseURL ?? fallbackBaseURL
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

            Text(L10n.text("Statusline is an independent app and is not affiliated with or endorsed by OpenAI."))
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

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                DataPlaneLabel(text: L10n.text("STL / DATA PLANE"), tint: DataPlaneTheme.ink)
                Spacer()
                DataPlaneStatusIndicator(
                    label: syncState.dataPlaneLabel,
                    tint: syncState.dataPlaneTint
                )
            }

            Text(L10n.text("Codex Status"))
                .font(.largeTitle.bold())
                .tracking(-1.4)
                .foregroundStyle(DataPlaneTheme.ink)

            Text(L10n.text("Weekly quota, reset and private sync in one view."))
                .font(.subheadline)
                .foregroundStyle(DataPlaneTheme.muted)
        }
        .padding(.horizontal, 2)
        .accessibilityElement(children: .contain)
    }
}

private struct CodexDataPlanePanel: View {
    let status: CodexUsageStatus
    let syncState: CodexRelaySyncState

    private let columns = [
        GridItem(.flexible(), spacing: 0),
        GridItem(.flexible(), spacing: 0),
    ]

    var body: some View {
        DataPlaneSurface(cornerRadius: 20) {
            VStack(spacing: 0) {
                HStack {
                    DataPlaneLabel(text: L10n.text("CDX.WEEKLY.QUOTA"))
                    Spacer()
                    DataPlaneLabel(text: L10n.text("PLANE / 010"), tint: DataPlaneTheme.signal)
                }
                .padding(18)

                DataPlaneRule()

                VStack(alignment: .leading, spacing: 18) {
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .bottom, spacing: 24) {
                            DataPlaneQuotaValue(status: status)
                            Spacer(minLength: 8)
                            DataPlaneQuotaContext(status: status)
                                .frame(maxWidth: 180, alignment: .leading)
                        }

                        VStack(alignment: .leading, spacing: 18) {
                            DataPlaneQuotaValue(status: status)
                            DataPlaneQuotaContext(status: status)
                        }
                    }

                    DataPlaneMeter(remainingPercentage: status.remainingPercentage)
                }
                .padding(18)

                LazyVGrid(columns: columns, spacing: 0) {
                    DataPlaneMetricCell(
                        label: L10n.text("RESET.TIME"),
                        value: status.resetDate.formatted(.dateTime.hour().minute().locale(L10n.locale)),
                        detail: L10n.text("LOCAL TIME"),
                        isAccented: true
                    )

                    DataPlaneMetricCell(
                        label: L10n.text("RESET.DATE"),
                        value: status.resetDate.formatted(.dateTime.day().month(.abbreviated).locale(L10n.locale)).uppercased(),
                        detail: status.resetDate.formatted(.dateTime.weekday(.wide).locale(L10n.locale)).uppercased(),
                        isAccented: true
                    )

                    DataPlaneMetricCell(
                        label: L10n.text("SOURCE.HOST"),
                        value: L10n.text("Desktop companion"),
                        detail: L10n.text("CODEX SESSION LOCAL")
                    )

                    DataPlaneMetricCell(
                        label: L10n.text("RELAY.STATE"),
                        value: syncState.relayValue,
                        detail: L10n.text("E2E · UNIVERSAL")
                    )
                }

                HStack(alignment: .center, spacing: 14) {
                    VStack(alignment: .leading, spacing: 7) {
                        DataPlaneLabel(text: L10n.text("STATUS.RECORD"))
                        Text(L10n.text("available · quota metadata only"))
                            .font(.caption.monospaced())
                            .foregroundStyle(DataPlaneTheme.ink)
                    }

                    Spacer()

                    DataPlaneStatusIndicator(
                        label: syncState.dataPlaneLabel,
                        tint: syncState.dataPlaneTint
                    )
                }
                .padding(16)
            }
        }
    }
}

private struct DataPlaneQuotaValue: View {
    let status: CodexUsageStatus

    @ScaledMetric(relativeTo: .largeTitle) private var valueSize = 72.0

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(status.remainingPercentage, format: .number)
                .font(.system(size: valueSize, weight: .bold, design: .rounded))
                .tracking(-4)
                .foregroundStyle(DataPlaneTheme.ink)
                .contentTransition(.numericText())

            Text("%")
                .font(.title.bold())
                .foregroundStyle(DataPlaneTheme.emphasis(for: status.remainingPercentage))

            Text(L10n.text("LEFT"))
                .font(.caption2.monospaced().weight(.bold))
                .tracking(1)
                .foregroundStyle(DataPlaneTheme.emphasis(for: status.remainingPercentage))
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.text("Weekly quota"))
        .accessibilityValue(L10n.text("{0} percent remaining", status.remainingPercentage))
        .accessibilityIdentifier("weeklyQuotaValue")
    }
}

private struct DataPlaneQuotaContext: View {
    let status: CodexUsageStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            VStack(alignment: .leading, spacing: 4) {
                DataPlaneLabel(text: L10n.text("STATUS"))
                Text(L10n.text("AVAILABLE"))
                    .font(.caption.monospaced().weight(.semibold))
                    .foregroundStyle(DataPlaneTheme.ink)
            }

            VStack(alignment: .leading, spacing: 4) {
                DataPlaneLabel(text: L10n.text("SAMPLE"))
                Text(status.updatedAt, style: .relative)
                    .font(.caption.monospaced())
                    .foregroundStyle(DataPlaneTheme.ink)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct WaitingForDesktopPanel: View {
    let syncState: CodexRelaySyncState
    let onLoadDemo: () -> Void

    var body: some View {
        DataPlaneSurface(cornerRadius: 20) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    DataPlaneLabel(text: L10n.text("CDX.WEEKLY.QUOTA"))
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

                    Text(L10n.text("Open Statusline Companion on Windows, Linux or macOS, create a pairing and scan its QR to receive the first encrypted sample."))
                        .font(.subheadline)
                        .foregroundStyle(DataPlaneTheme.muted)

                    Button(L10n.text("View local demo"), systemImage: "play.rectangle.fill", action: onLoadDemo)
                        .buttonStyle(DataPlaneSecondaryButtonStyle())
                        .accessibilityHint(L10n.text("Loads a local sample and updates the widget without an account, a computer or the network."))
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
    let onRefresh: () -> Void
    let onPair: () -> Void
    let onDisconnect: () -> Void

    var body: some View {
        DataPlaneSurface {
            VStack(alignment: .leading, spacing: 15) {
                HStack {
                    DataPlaneLabel(text: L10n.text("RELAY.CONTROL"), tint: DataPlaneTheme.ink)
                    Spacer()
                    DataPlaneStatusIndicator(
                        label: state.dataPlaneLabel,
                        tint: state.dataPlaneTint
                    )
                }

                DataPlaneRule()

                Text(state.message)
                    .font(.subheadline.monospaced())
                    .foregroundStyle(state.isError ? DataPlaneTheme.critical : DataPlaneTheme.ink)

                Text(L10n.text("The relay stores only an AES-256-GCM encrypted snapshot. Codex credentials and the encryption key never leave your devices."))
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
            .padding(17)
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
            Button(action: onRefresh) {
                HStack(spacing: 9) {
                    if state == .syncing {
                        ProgressView()
                            .controlSize(.small)
                            .tint(DataPlaneTheme.canvas)
                    }
                    Text(state == .syncing ? L10n.text("Syncing") : L10n.text("Refresh"))
                }
            }
            .buttonStyle(DataPlanePrimaryButtonStyle())
            .disabled(state == .syncing)

            Button(L10n.text("Disconnect"), systemImage: "link.badge.minus", action: onDisconnect)
                .buttonStyle(DataPlaneSecondaryButtonStyle())
                .disabled(state == .syncing)
        }
    }
}

private struct ManualUpdatePanel: View {
    @Binding var isExpanded: Bool
    @Binding var sourceText: String
    let feedback: CodexStatusFeedback?
    let isUpdating: Bool
    let onPaste: ([String]) -> Void
    let onRestoreExample: () -> Void
    let onUpdate: () -> Void

    var body: some View {
        DataPlaneSurface {
            DisclosureGroup(isExpanded: $isExpanded) {
                CodexStatusEditor(
                    sourceText: $sourceText,
                    feedback: feedback,
                    isUpdating: isUpdating,
                    onPaste: onPaste,
                    onRestoreExample: onRestoreExample,
                    onUpdate: onUpdate
                )
                .padding(.top, 17)
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 5) {
                        DataPlaneLabel(text: L10n.text("FALLBACK.INPUT"), tint: DataPlaneTheme.ink)
                        Text(L10n.text("Manual update"))
                            .font(.subheadline.monospaced().weight(.semibold))
                            .foregroundStyle(DataPlaneTheme.ink)
                    }
                    Spacer()
                }
                .contentShape(.rect)
            }
            .tint(DataPlaneTheme.signal)
            .padding(17)
        }
    }
}

private struct CodexStatusEditor: View {
    @Binding var sourceText: String
    let feedback: CodexStatusFeedback?
    let isUpdating: Bool
    let onPaste: ([String]) -> Void
    let onRestoreExample: () -> Void
    let onUpdate: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(L10n.text("Paste the complete line returned by /status in Codex."))
                .font(.caption)
                .foregroundStyle(DataPlaneTheme.muted)

            TextField(
                "Weekly limit: … 70% left (resets 09:02 on 2 Sep)",
                text: $sourceText,
                axis: .vertical
            )
            .lineLimit(4...8)
            .font(.body.monospaced())
            .foregroundStyle(DataPlaneTheme.ink)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .padding(14)
            .background(DataPlaneTheme.canvas.opacity(0.76))
            .overlay {
                Rectangle()
                    .strokeBorder(DataPlaneTheme.line)
            }
            .accessibilityLabel(L10n.text("Codex status line"))

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    editorSecondaryActions
                }

                VStack(spacing: 10) {
                    editorSecondaryActions
                }
            }

            Button(L10n.text("Save on this device"), systemImage: "square.and.arrow.down", action: onUpdate)
                .buttonStyle(DataPlanePrimaryButtonStyle())
                .disabled(isUpdating)

            if let feedback {
                Label(feedback.message, systemImage: feedback.systemImage)
                    .font(.caption)
                    .foregroundStyle(feedback.isError ? DataPlaneTheme.critical : DataPlaneTheme.signal)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var editorSecondaryActions: some View {
        PasteButton(payloadType: String.self, onPaste: onPaste)
            .buttonStyle(DataPlaneSecondaryButtonStyle())

        Button(L10n.text("Use example"), systemImage: "text.badge.checkmark", action: onRestoreExample)
            .buttonStyle(DataPlaneSecondaryButtonStyle())
    }
}

private extension CodexRelaySyncState {
    var dataPlaneLabel: String {
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

    var dataPlaneTint: Color {
        switch self {
        case .failed:
            DataPlaneTheme.critical
        case .notConfigured, .unpaired, .waitingForDesktop:
            DataPlaneTheme.muted
        case .pairing, .syncing, .synced:
            DataPlaneTheme.signal
        }
    }

    var relayValue: String {
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
