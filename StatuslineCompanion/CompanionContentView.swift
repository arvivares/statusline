import SwiftUI

@MainActor
struct CompanionContentView: View {
    let viewModel: CompanionViewModel

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                CompanionDataPlaneHeader(state: viewModel.connectionState)

                if let status = viewModel.status {
                    CompanionDataPlaneStatus(
                        status: status,
                        accountEmail: viewModel.accountEmail,
                        connectionState: viewModel.connectionState,
                        isBusy: viewModel.isBusy
                    )
                } else {
                    CompanionEmptyDataPlane(
                        state: viewModel.connectionState,
                        message: viewModel.message
                    )
                }

                CompanionConnectionPanel(viewModel: viewModel)
                CompanionPrivacyPanel()
            }
            .frame(maxWidth: 920)
            .frame(maxWidth: .infinity)
            .padding(24)
        }
        .scrollIndicators(.hidden)
        .background {
            DataPlaneGridBackground()
                .ignoresSafeArea()
        }
        .frame(minWidth: 620, minHeight: 600)
        .tint(DataPlaneTheme.signal)
        .preferredColorScheme(.dark)
        .task {
            viewModel.start()
        }
    }
}

private struct CompanionDataPlaneHeader: View {
    let state: CompanionConnectionState

    var body: some View {
        HStack(alignment: .bottom, spacing: 24) {
            VStack(alignment: .leading, spacing: 9) {
                DataPlaneLabel(text: "STL / COMPANION / DATA PLANE", tint: DataPlaneTheme.signal)
                Text("Codex relay")
                    .font(.largeTitle.bold())
                    .tracking(-1.4)
                    .foregroundStyle(DataPlaneTheme.ink)
            }

            Spacer()

            DataPlaneStatusIndicator(
                label: state.dataPlaneLabel,
                tint: state.dataPlaneTint
            )
            .padding(.bottom, 5)
        }
        .padding(.horizontal, 2)
    }
}

private struct CompanionDataPlaneStatus: View {
    let status: CodexUsageStatus
    let accountEmail: String?
    let connectionState: CompanionConnectionState
    let isBusy: Bool

    var body: some View {
        DataPlaneSurface(cornerRadius: 16) {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 5) {
                        DataPlaneLabel(text: "CODEX.ACCOUNT")
                        Text(accountEmail ?? "Codex connected")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(DataPlaneTheme.ink)
                            .textSelection(.enabled)
                    }

                    Spacer()

                    DataPlaneStatusIndicator(
                        label: connectionState.dataPlaneLabel,
                        tint: connectionState.dataPlaneTint
                    )
                }
                .padding(18)

                DataPlaneRule()

                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 0) {
                        CompanionQuotaReadout(status: status)
                            .padding(22)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        VStack(spacing: 0) {
                            DataPlaneMetricCell(
                                label: "RESET",
                                value: status.resetDate.formatted(
                                    .dateTime.hour().minute().day().month(.abbreviated)
                                ).uppercased(),
                                detail: "NEXT WEEKLY WINDOW",
                                isAccented: true,
                                minimumHeight: 96
                            )

                            DataPlaneMetricCell(
                                label: "SAMPLE",
                                value: status.updatedAt.formatted(.relative(presentation: .named)),
                                detail: "LAST CODEX READ",
                                isAccented: true,
                                minimumHeight: 96
                            )
                        }
                        .frame(width: 230)
                    }

                    VStack(spacing: 0) {
                        CompanionQuotaReadout(status: status)
                            .padding(20)

                        DataPlaneMetricCell(
                            label: "RESET",
                            value: status.resetDate.formatted(
                                .dateTime.hour().minute().day().month(.abbreviated)
                            ).uppercased(),
                            detail: "NEXT WEEKLY WINDOW",
                            isAccented: true
                        )
                    }
                }

                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 0) {
                        statusMetrics
                    }

                    VStack(spacing: 0) {
                        statusMetrics
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var statusMetrics: some View {
        DataPlaneMetricCell(
            label: "SOURCE",
            value: "Codex local",
            detail: "SESSION STAYS ON MAC",
            minimumHeight: 82
        )

        DataPlaneMetricCell(
            label: "RELAY",
            value: isBusy ? "iCloud / syncing" : "Private iCloud",
            detail: "QUOTA METADATA ONLY",
            minimumHeight: 82
        )

        DataPlaneMetricCell(
            label: "STATUS",
            value: connectionState.dataPlaneLabel,
            detail: "ACCOUNT CHANNEL",
            minimumHeight: 82
        )
    }
}

private struct CompanionQuotaReadout: View {
    let status: CodexUsageStatus

    @ScaledMetric(relativeTo: .largeTitle) private var valueSize = 68.0

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            DataPlaneLabel(text: "WEEKLY QUOTA")

            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(status.remainingPercentage, format: .number)
                    .font(.system(size: valueSize, weight: .bold, design: .rounded))
                    .tracking(-4)
                    .foregroundStyle(DataPlaneTheme.ink)
                    .contentTransition(.numericText())

                Text("%")
                    .font(.title.bold())
                    .foregroundStyle(DataPlaneTheme.emphasis(for: status.remainingPercentage))

                Text("LEFT")
                    .font(.caption2.monospaced().weight(.bold))
                    .tracking(1)
                    .foregroundStyle(DataPlaneTheme.emphasis(for: status.remainingPercentage))
            }
            .lineLimit(1)
            .minimumScaleFactor(0.72)
            .accessibilityHidden(true)

            DataPlaneMeter(remainingPercentage: status.remainingPercentage)
        }
    }
}

private struct CompanionEmptyDataPlane: View {
    let state: CompanionConnectionState
    let message: String

    var body: some View {
        DataPlaneSurface(cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    DataPlaneLabel(text: "CDX.WEEKLY.QUOTA")
                    Spacer()
                    DataPlaneLabel(text: "NO SAMPLE")
                }
                .padding(18)

                DataPlaneRule()

                VStack(alignment: .leading, spacing: 17) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("--")
                            .font(.largeTitle.bold())
                            .foregroundStyle(DataPlaneTheme.ink)
                        Text("% LEFT")
                            .font(.caption.monospaced().weight(.bold))
                            .foregroundStyle(DataPlaneTheme.muted)
                    }

                    DataPlaneMeter(remainingPercentage: 0)
                        .accessibilityHidden(true)

                    Text(message)
                        .font(.subheadline.monospaced())
                        .foregroundStyle(DataPlaneTheme.muted)
                }
                .padding(20)

                HStack {
                    DataPlaneLabel(text: "ACCOUNT.CHANNEL")
                    Spacer()
                    DataPlaneStatusIndicator(
                        label: state.dataPlaneLabel,
                        tint: state.dataPlaneTint
                    )
                }
                .padding(16)
                .overlay(alignment: .top) {
                    DataPlaneRule()
                }
            }
        }
    }
}

@MainActor
private struct CompanionConnectionPanel: View {
    let viewModel: CompanionViewModel

    var body: some View {
        DataPlaneSurface(cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 15) {
                HStack {
                    VStack(alignment: .leading, spacing: 5) {
                        DataPlaneLabel(text: "ACCOUNT.CONTROL", tint: DataPlaneTheme.ink)
                        Text(viewModel.connectionState.controlTitle)
                            .font(.headline)
                            .foregroundStyle(DataPlaneTheme.ink)
                    }

                    Spacer()

                    if viewModel.isBusy {
                        ProgressView()
                            .controlSize(.small)
                            .tint(DataPlaneTheme.signal)
                            .accessibilityLabel("Procesando")
                    }
                }

                DataPlaneRule()

                if let email = viewModel.accountEmail {
                    Text(email)
                        .font(.subheadline.monospaced())
                        .foregroundStyle(DataPlaneTheme.signal)
                        .textSelection(.enabled)
                }

                Text(viewModel.message)
                    .font(.subheadline)
                    .foregroundStyle(DataPlaneTheme.muted)

                if let challenge = viewModel.loginChallenge,
                   let userCode = challenge.userCode {
                    LoginChallengePanel(
                        userCode: userCode,
                        onCopy: viewModel.copyUserCode,
                        onOpen: viewModel.openAuthorizationPage
                    )
                }

                controls
            }
            .padding(18)
        }
    }

    @ViewBuilder
    private var controls: some View {
        switch viewModel.connectionState {
        case .checking, .waitingForLogin:
            EmptyView()

        case .disconnected, .unavailable:
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    connectButtons
                }

                VStack(spacing: 10) {
                    connectButtons
                }
            }

        case .connected:
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    connectedButtons
                }

                VStack(spacing: 10) {
                    connectedButtons
                }
            }
        }
    }

    @ViewBuilder
    private var connectButtons: some View {
        Button("Conectar con Codex", systemImage: "person.crop.circle.badge.checkmark", action: connectWithBrowser)
            .buttonStyle(DataPlanePrimaryButtonStyle())
            .disabled(viewModel.isBusy)

        Button("Usar código de dispositivo", action: connectWithDeviceCode)
            .buttonStyle(DataPlaneSecondaryButtonStyle())
            .disabled(viewModel.isBusy)
    }

    @ViewBuilder
    private var connectedButtons: some View {
        Button("Sincronizar ahora", systemImage: "arrow.clockwise", action: refresh)
            .buttonStyle(DataPlanePrimaryButtonStyle())
            .disabled(viewModel.isBusy)

        Button("Desconectar", systemImage: "rectangle.portrait.and.arrow.right", action: disconnect)
            .buttonStyle(DataPlaneSecondaryButtonStyle())
            .disabled(viewModel.isBusy)
    }

    private func connectWithBrowser() {
        Task {
            await viewModel.connect(mode: .browser)
        }
    }

    private func connectWithDeviceCode() {
        Task {
            await viewModel.connect(mode: .deviceCode)
        }
    }

    private func refresh() {
        Task {
            await viewModel.refresh()
        }
    }

    private func disconnect() {
        Task {
            await viewModel.disconnect()
        }
    }
}

private struct LoginChallengePanel: View {
    let userCode: String
    let onCopy: () -> Void
    let onOpen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            DataPlaneLabel(text: "AUTH.CHALLENGE")

            Text(userCode)
                .font(.title2.monospaced().weight(.bold))
                .foregroundStyle(DataPlaneTheme.signal)
                .textSelection(.enabled)

            HStack(spacing: 10) {
                Button("Copiar código", systemImage: "doc.on.doc", action: onCopy)
                    .buttonStyle(DataPlaneSecondaryButtonStyle())
                Button("Abrir OpenAI", systemImage: "safari", action: onOpen)
                    .buttonStyle(DataPlaneSecondaryButtonStyle())
            }
        }
        .padding(15)
        .background(DataPlaneTheme.canvas.opacity(0.7))
        .overlay {
            Rectangle()
                .strokeBorder(DataPlaneTheme.line)
        }
    }
}

private struct CompanionPrivacyPanel: View {
    var body: some View {
        DataPlaneSurface(cornerRadius: 16) {
            VStack(spacing: 0) {
                HStack {
                    DataPlaneLabel(text: "PRIVACY.PLANE", tint: DataPlaneTheme.ink)
                    Spacer()
                    DataPlaneStatusIndicator(label: "private")
                }
                .padding(17)

                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 0) {
                        privacyMetrics
                    }

                    VStack(spacing: 0) {
                        privacyMetrics
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var privacyMetrics: some View {
        DataPlaneMetricCell(
            label: "ICLOUD.PAYLOAD",
            value: "Quota metadata",
            detail: "PERCENT · RESET · UPDATED",
            minimumHeight: 82
        )

        DataPlaneMetricCell(
            label: "CODEX.SESSION",
            value: "Stays on Mac",
            detail: "NOT UPLOADED",
            minimumHeight: 82
        )

        DataPlaneMetricCell(
            label: "ACCOUNT.MATCH",
            value: "Same iCloud",
            detail: "MAC + IPHONE",
            minimumHeight: 82
        )
    }
}

private extension CompanionConnectionState {
    var dataPlaneLabel: String {
        switch self {
        case .checking:
            "checking"
        case .disconnected:
            "offline"
        case .waitingForLogin:
            "authorize"
        case .connected:
            "current"
        case .unavailable:
            "unavailable"
        }
    }

    var dataPlaneTint: Color {
        switch self {
        case .checking, .waitingForLogin:
            DataPlaneTheme.signal
        case .connected:
            DataPlaneTheme.signal
        case .disconnected:
            DataPlaneTheme.muted
        case .unavailable:
            DataPlaneTheme.critical
        }
    }

    var controlTitle: String {
        switch self {
        case .checking:
            "Comprobando Codex"
        case .disconnected:
            "Codex sin conectar"
        case .waitingForLogin:
            "Esperando autorización"
        case .connected:
            "Codex conectado"
        case .unavailable:
            "Codex CLI no disponible"
        }
    }
}
