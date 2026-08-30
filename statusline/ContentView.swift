import SwiftUI

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var viewModel = CodexStatusViewModel()
    @State private var isManualUpdateExpanded = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    DataPlaneAppHeader(syncState: viewModel.cloudSyncState)

                    if let status = viewModel.status {
                        CodexDataPlanePanel(
                            status: status,
                            syncState: viewModel.cloudSyncState
                        )
                    } else {
                        WaitingForMacPanel(syncState: viewModel.cloudSyncState)
                    }

                    CloudRelayPanel(
                        state: viewModel.cloudSyncState,
                        onRefresh: refreshFromCloud
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
            .onReceive(NotificationCenter.default.publisher(for: .codexStatusDidSync)) { _ in
                viewModel.reloadLocalStatus()
            }
        }
        .tint(DataPlaneTheme.signal)
        .preferredColorScheme(.dark)
    }

    private func refreshFromCloud() {
        Task {
            await viewModel.refreshFromCloud(userInitiated: true)
        }
    }

    private func updateStatus() {
        Task {
            await viewModel.updateStatus()
        }
    }

    private func handleScenePhaseChange(_ oldPhase: ScenePhase, _ newPhase: ScenePhase) {
        guard newPhase == .active else {
            return
        }

        Task {
            await viewModel.refreshFromCloud()
        }
    }
}

private struct DataPlaneAppHeader: View {
    let syncState: CodexCloudSyncState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                DataPlaneLabel(text: "STL / DATA PLANE", tint: DataPlaneTheme.ink)
                Spacer()
                DataPlaneStatusIndicator(
                    label: syncState.dataPlaneLabel,
                    tint: syncState.dataPlaneTint
                )
            }

            Text("Codex Status")
                .font(.largeTitle.bold())
                .tracking(-1.4)
                .foregroundStyle(DataPlaneTheme.ink)

            Text("Cuota semanal, reinicio y relay privado en un solo plano de datos.")
                .font(.subheadline)
                .foregroundStyle(DataPlaneTheme.muted)
        }
        .padding(.horizontal, 2)
        .accessibilityElement(children: .contain)
    }
}

private struct CodexDataPlanePanel: View {
    let status: CodexUsageStatus
    let syncState: CodexCloudSyncState

    private let columns = [
        GridItem(.flexible(), spacing: 0),
        GridItem(.flexible(), spacing: 0),
    ]

    var body: some View {
        DataPlaneSurface(cornerRadius: 20) {
            VStack(spacing: 0) {
                HStack {
                    DataPlaneLabel(text: "CDX.WEEKLY.QUOTA")
                    Spacer()
                    DataPlaneLabel(text: "PLANE / 010", tint: DataPlaneTheme.signal)
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
                        label: "RESET.TIME",
                        value: status.resetDate.formatted(.dateTime.hour().minute()),
                        detail: "LOCAL TIME",
                        isAccented: true
                    )

                    DataPlaneMetricCell(
                        label: "RESET.DATE",
                        value: status.resetDate.formatted(.dateTime.day().month(.abbreviated)).uppercased(),
                        detail: status.resetDate.formatted(.dateTime.weekday(.wide)).uppercased(),
                        isAccented: true
                    )

                    DataPlaneMetricCell(
                        label: "SOURCE.HOST",
                        value: "Mac companion",
                        detail: "CODEX SESSION LOCAL"
                    )

                    DataPlaneMetricCell(
                        label: "RELAY.STATE",
                        value: syncState.relayValue,
                        detail: "PRIVATE ICLOUD"
                    )
                }

                HStack(alignment: .center, spacing: 14) {
                    VStack(alignment: .leading, spacing: 7) {
                        DataPlaneLabel(text: "STATUS.RECORD")
                        Text("available · quota metadata only")
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

            Text("LEFT")
                .font(.caption2.monospaced().weight(.bold))
                .tracking(1)
                .foregroundStyle(DataPlaneTheme.emphasis(for: status.remainingPercentage))
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .accessibilityHidden(true)
    }
}

private struct DataPlaneQuotaContext: View {
    let status: CodexUsageStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            VStack(alignment: .leading, spacing: 4) {
                DataPlaneLabel(text: "STATUS")
                Text("AVAILABLE")
                    .font(.caption.monospaced().weight(.semibold))
                    .foregroundStyle(DataPlaneTheme.ink)
            }

            VStack(alignment: .leading, spacing: 4) {
                DataPlaneLabel(text: "SAMPLE")
                Text(status.updatedAt, style: .relative)
                    .font(.caption.monospaced())
                    .foregroundStyle(DataPlaneTheme.ink)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct WaitingForMacPanel: View {
    let syncState: CodexCloudSyncState

    var body: some View {
        DataPlaneSurface(cornerRadius: 20) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    DataPlaneLabel(text: "CDX.WEEKLY.QUOTA")
                    Spacer()
                    DataPlaneLabel(text: "NO SAMPLE", tint: DataPlaneTheme.muted)
                }
                .padding(18)

                DataPlaneRule()

                VStack(alignment: .leading, spacing: 18) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("--")
                            .font(.system(.largeTitle, design: .rounded).bold())
                            .foregroundStyle(DataPlaneTheme.ink)
                        Text("% LEFT")
                            .font(.caption.monospaced().weight(.bold))
                            .foregroundStyle(DataPlaneTheme.muted)
                    }

                    DataPlaneMeter(remainingPercentage: 0)
                        .accessibilityHidden(true)

                    Text("Abre Statusline Companion en tu Mac y conecta tu cuenta de Codex para publicar la primera muestra mediante iCloud.")
                        .font(.subheadline)
                        .foregroundStyle(DataPlaneTheme.muted)
                }
                .padding(18)

                HStack {
                    DataPlaneLabel(text: "SOURCE.HOST")
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

private struct CloudRelayPanel: View {
    let state: CodexCloudSyncState
    let onRefresh: () -> Void

    var body: some View {
        DataPlaneSurface {
            VStack(alignment: .leading, spacing: 15) {
                HStack {
                    DataPlaneLabel(text: "RELAY.CONTROL", tint: DataPlaneTheme.ink)
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

                Text("El iPhone lee únicamente el porcentaje, el reinicio y la fecha de actualización desde tu base privada de iCloud.")
                    .font(.caption)
                    .foregroundStyle(DataPlaneTheme.muted)

                Button(action: onRefresh) {
                    HStack(spacing: 9) {
                        if state == .syncing {
                            ProgressView()
                                .controlSize(.small)
                                .tint(DataPlaneTheme.canvas)
                        }
                        Text(state == .syncing ? "Sincronizando" : "Actualizar data plane")
                    }
                }
                .buttonStyle(DataPlanePrimaryButtonStyle())
                .disabled(state == .syncing)
            }
            .padding(17)
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
                        DataPlaneLabel(text: "FALLBACK.INPUT", tint: DataPlaneTheme.ink)
                        Text("Actualización manual")
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
            Text("Pega la línea completa que devuelve `/status` en Codex.")
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
            .accessibilityLabel("Línea de estado de Codex")

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    editorSecondaryActions
                }

                VStack(spacing: 10) {
                    editorSecondaryActions
                }
            }

            Button("Guardar y sincronizar", systemImage: "arrow.triangle.2.circlepath", action: onUpdate)
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

        Button("Usar ejemplo", systemImage: "text.badge.checkmark", action: onRestoreExample)
            .buttonStyle(DataPlaneSecondaryButtonStyle())
    }
}

private extension CodexCloudSyncState {
    var dataPlaneLabel: String {
        switch self {
        case .idle:
            "standby"
        case .syncing:
            "syncing"
        case .waitingForMac:
            "waiting"
        case .synced:
            "current"
        case .failed:
            "error"
        }
    }

    var dataPlaneTint: Color {
        switch self {
        case .failed:
            DataPlaneTheme.critical
        case .idle, .waitingForMac:
            DataPlaneTheme.muted
        case .syncing, .synced:
            DataPlaneTheme.signal
        }
    }

    var relayValue: String {
        switch self {
        case .idle:
            "iCloud / standby"
        case .syncing:
            "iCloud / syncing"
        case .waitingForMac:
            "iCloud / waiting"
        case .synced:
            "iCloud / current"
        case .failed:
            "iCloud / error"
        }
    }
}

#Preview {
    ContentView()
}
