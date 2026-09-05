import AppKit
import CoreImage.CIFilterBuiltins
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
                        relayState: viewModel.relayState,
                        isBusy: viewModel.isBusy
                    )
                } else {
                    CompanionEmptyDataPlane(
                        state: viewModel.connectionState,
                        message: viewModel.message
                    )
                }

                CompanionConnectionPanel(viewModel: viewModel)
                CompanionRelayPanel(viewModel: viewModel)
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
                DataPlaneLabel(text: L10n.text("STL / COMPANION / DATA PLANE"), tint: DataPlaneTheme.signal)
                Text(L10n.text("Codex relay"))
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
    let relayState: StatusRelayPublisherState
    let isBusy: Bool

    var body: some View {
        DataPlaneSurface(cornerRadius: 16) {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 5) {
                        DataPlaneLabel(text: L10n.text("CODEX.ACCOUNT"))
                        Text(accountEmail ?? L10n.text("Codex connected"))
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
                                label: L10n.text("RESET"),
                                value: status.resetDate.formatted(
                                    .dateTime.hour().minute().day().month(.abbreviated).locale(L10n.locale)
                                ).uppercased(),
                                detail: L10n.text("NEXT WEEKLY WINDOW"),
                                isAccented: true,
                                minimumHeight: 96
                            )

                            DataPlaneMetricCell(
                                label: L10n.text("SAMPLE"),
                                value: L10n.relative(status.updatedAt),
                                detail: L10n.text("LAST CODEX READ"),
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
                            label: L10n.text("RESET"),
                            value: status.resetDate.formatted(
                                .dateTime.hour().minute().day().month(.abbreviated).locale(L10n.locale)
                            ).uppercased(),
                            detail: L10n.text("NEXT WEEKLY WINDOW"),
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
            label: L10n.text("SOURCE"),
            value: L10n.text("Codex local"),
            detail: L10n.text("SESSION STAYS ON MAC"),
            minimumHeight: 82
        )

        DataPlaneMetricCell(
            label: L10n.text("RELAY"),
            value: isBusy ? L10n.text("Reading Codex") : relayState.displayValue,
            detail: L10n.text("AES-256-GCM · UNIVERSAL"),
            minimumHeight: 82
        )

        DataPlaneMetricCell(
            label: L10n.text("STATUS"),
            value: connectionState.dataPlaneLabel,
            detail: L10n.text("ACCOUNT CHANNEL"),
            minimumHeight: 82
        )
    }
}

private struct CompanionQuotaReadout: View {
    let status: CodexUsageStatus

    @ScaledMetric(relativeTo: .largeTitle) private var valueSize = 68.0

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            DataPlaneLabel(text: L10n.text("WEEKLY QUOTA"))

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
                    DataPlaneLabel(text: L10n.text("CDX.WEEKLY.QUOTA"))
                    Spacer()
                    DataPlaneLabel(text: L10n.text("NO SAMPLE"))
                }
                .padding(18)

                DataPlaneRule()

                VStack(alignment: .leading, spacing: 17) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("--")
                            .font(.largeTitle.bold())
                            .foregroundStyle(DataPlaneTheme.ink)
                        Text(L10n.text("% LEFT"))
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
                    DataPlaneLabel(text: L10n.text("ACCOUNT.CHANNEL"))
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
                        DataPlaneLabel(text: L10n.text("ACCOUNT.CONTROL"), tint: DataPlaneTheme.ink)
                        Text(viewModel.connectionState.controlTitle)
                            .font(.headline)
                            .foregroundStyle(DataPlaneTheme.ink)
                    }

                    Spacer()

                    if viewModel.isBusy {
                        ProgressView()
                            .controlSize(.small)
                            .tint(DataPlaneTheme.signal)
                            .accessibilityLabel(L10n.text("Processing"))
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
        Button(L10n.text("Connect with Codex"), systemImage: "person.crop.circle.badge.checkmark", action: connectWithBrowser)
            .buttonStyle(DataPlanePrimaryButtonStyle())
            .disabled(viewModel.isBusy)

        Button(L10n.text("Use device code"), action: connectWithDeviceCode)
            .buttonStyle(DataPlaneSecondaryButtonStyle())
            .disabled(viewModel.isBusy)
    }

    @ViewBuilder
    private var connectedButtons: some View {
        Button(L10n.text("Sync now"), systemImage: "arrow.clockwise", action: refresh)
            .buttonStyle(DataPlanePrimaryButtonStyle())
            .disabled(viewModel.isBusy)

        Button(L10n.text("Disconnect"), systemImage: "rectangle.portrait.and.arrow.right", action: disconnect)
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
            DataPlaneLabel(text: L10n.text("AUTH.CHALLENGE"))

            Text(userCode)
                .font(.title2.monospaced().weight(.bold))
                .foregroundStyle(DataPlaneTheme.signal)
                .textSelection(.enabled)

            HStack(spacing: 10) {
                Button(L10n.text("Copy code"), systemImage: "doc.on.doc", action: onCopy)
                    .buttonStyle(DataPlaneSecondaryButtonStyle())
                Button(L10n.text("Open OpenAI"), systemImage: "safari", action: onOpen)
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

@MainActor
private struct CompanionRelayPanel: View {
    let viewModel: CompanionViewModel

    var body: some View {
        DataPlaneSurface(cornerRadius: 16) {
            VStack(alignment: .leading, spacing: 15) {
                HStack {
                    VStack(alignment: .leading, spacing: 5) {
                        DataPlaneLabel(text: L10n.text("UNIVERSAL.RELAY"), tint: DataPlaneTheme.ink)
                        Text(viewModel.relayState.controlTitle)
                            .font(.headline)
                            .foregroundStyle(DataPlaneTheme.ink)
                    }

                    Spacer()

                    if viewModel.isRelayBusy {
                        ProgressView()
                            .controlSize(.small)
                            .tint(DataPlaneTheme.signal)
                    } else {
                        DataPlaneStatusIndicator(
                            label: viewModel.relayState.statusLabel,
                            tint: viewModel.relayState.statusTint
                        )
                    }
                }

                DataPlaneRule()

                Text(viewModel.relayMessage)
                    .font(.subheadline)
                    .foregroundStyle(DataPlaneTheme.muted)

                if let endpoint = viewModel.relayEndpoint {
                    Text(endpoint)
                        .font(.caption2.monospaced())
                        .foregroundStyle(DataPlaneTheme.muted)
                        .textSelection(.enabled)
                }

                if let pairingURI = viewModel.pairingURI {
                    pairingSurface(uri: pairingURI)
                }

                controls
            }
            .padding(18)
        }
    }

    @ViewBuilder
    private func pairingSurface(uri: String) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 16) {
                qrCode(uri: uri)
                pairingCopy(uri: uri)
            }

            VStack(alignment: .leading, spacing: 14) {
                qrCode(uri: uri)
                pairingCopy(uri: uri)
            }
        }
        .padding(14)
        .background(DataPlaneTheme.canvas.opacity(0.72))
        .overlay {
            Rectangle().strokeBorder(DataPlaneTheme.line)
        }
    }

    @ViewBuilder
    private func qrCode(uri: String) -> some View {
        if let image = Self.makeQRCode(uri) {
            image
                .interpolation(.none)
                .resizable()
                .scaledToFit()
                .frame(width: 172, height: 172)
                .padding(7)
                .background(DataPlaneTheme.signal)
                .accessibilityLabel(L10n.text("Private pairing QR"))
        }
    }

    private func pairingCopy(uri: String) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            DataPlaneLabel(text: L10n.text("PAIRING.LINK"), tint: DataPlaneTheme.signal)

            Text(uri)
                .font(.caption2.monospaced())
                .foregroundStyle(DataPlaneTheme.muted)
                .lineLimit(5)
                .textSelection(.enabled)

            Text(L10n.text("The link contains the decryption key. Do not share it."))
                .font(.caption)
                .foregroundStyle(DataPlaneTheme.critical)

            Button(L10n.text("Copy private link"), systemImage: "doc.on.doc") {
                viewModel.copyPairingLink()
            }
            .buttonStyle(DataPlaneSecondaryButtonStyle())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var controls: some View {
        switch viewModel.relayState {
        case .notConfigured:
            EmptyView()

        case .unpaired:
            Button(L10n.text("Create pairing"), systemImage: "qrcode") {
                Task { await viewModel.createRelayPairing() }
            }
            .buttonStyle(DataPlanePrimaryButtonStyle())
            .disabled(viewModel.isRelayBusy)

        case .pairing:
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { pairingButtons }
                VStack(spacing: 10) { pairingButtons }
            }

        case .connected:
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { connectedButtons }
                VStack(spacing: 10) { connectedButtons }
            }
        }
    }

    @ViewBuilder
    private var pairingButtons: some View {
        Button(L10n.text("Check scan"), systemImage: "arrow.clockwise") {
            Task { await viewModel.refreshRelayState() }
        }
        .buttonStyle(DataPlanePrimaryButtonStyle())
        .disabled(viewModel.isRelayBusy)

        Button(L10n.text("Replace QR")) {
            Task { await viewModel.createRelayPairing() }
        }
        .buttonStyle(DataPlaneSecondaryButtonStyle())
        .disabled(viewModel.isRelayBusy)

        Button(L10n.text("Remove pairing")) {
            Task { await viewModel.disconnectRelay() }
        }
        .buttonStyle(DataPlaneSecondaryButtonStyle())
        .disabled(viewModel.isRelayBusy)
    }

    @ViewBuilder
    private var connectedButtons: some View {
        Button(L10n.text("Check relay"), systemImage: "arrow.clockwise") {
            Task { await viewModel.refreshRelayState() }
        }
        .buttonStyle(DataPlanePrimaryButtonStyle())
        .disabled(viewModel.isRelayBusy)

        Button(L10n.text("Connect another device")) {
            Task { await viewModel.createRelayPairing() }
        }
        .buttonStyle(DataPlaneSecondaryButtonStyle())
        .disabled(viewModel.isRelayBusy)

        Button(L10n.text("Remove pairing")) {
            Task { await viewModel.disconnectRelay() }
        }
        .buttonStyle(DataPlaneSecondaryButtonStyle())
        .disabled(viewModel.isRelayBusy)
    }

    private static func makeQRCode(_ value: String) -> Image? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(value.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: .init(scaleX: 8, y: 8)),
              let image = CIContext().createCGImage(output, from: output.extent) else {
            return nil
        }
        return Image(nsImage: NSImage(cgImage: image, size: .zero))
    }
}

private struct CompanionPrivacyPanel: View {
    var body: some View {
        DataPlaneSurface(cornerRadius: 16) {
            VStack(spacing: 0) {
                HStack {
                    DataPlaneLabel(text: L10n.text("PRIVACY.PLANE"), tint: DataPlaneTheme.ink)
                    Spacer()
                    DataPlaneStatusIndicator(label: L10n.text("PRIVATE"))
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
            label: L10n.text("RELAY.PAYLOAD"),
            value: L10n.text("Encrypted snapshot"),
            detail: L10n.text("AES-256-GCM · 30 DAY TTL"),
            minimumHeight: 82
        )

        DataPlaneMetricCell(
            label: L10n.text("CODEX.SESSION"),
            value: L10n.text("Stays on Mac"),
            detail: L10n.text("NOT UPLOADED"),
            minimumHeight: 82
        )

        DataPlaneMetricCell(
            label: L10n.text("DEVICE.PAIRING"),
            value: L10n.text("Private QR"),
            detail: "IOS · ANDROID",
            minimumHeight: 82
        )
    }
}

private extension StatusRelayPublisherState {
    var displayValue: String {
        switch self {
        case .notConfigured:
            L10n.text("Relay / config")
        case .unpaired:
            L10n.text("Relay / unpaired")
        case .pairing:
            L10n.text("Relay / pairing")
        case .connected:
            L10n.text("Relay / current")
        }
    }

    var controlTitle: String {
        switch self {
        case .notConfigured:
            L10n.text("Relay not configured")
        case .unpaired:
            L10n.text("Connect a device")
        case .pairing:
            L10n.text("Scan the private QR")
        case .connected:
            L10n.text("Encrypted relay active")
        }
    }

    var statusLabel: String {
        switch self {
        case .notConfigured:
            L10n.text("CONFIG")
        case .unpaired:
            L10n.text("UNPAIRED")
        case .pairing:
            L10n.text("PAIRING")
        case .connected:
            L10n.text("CURRENT")
        }
    }

    var statusTint: Color {
        switch self {
        case .notConfigured, .unpaired:
            DataPlaneTheme.muted
        case .pairing, .connected:
            DataPlaneTheme.signal
        }
    }
}

private extension CompanionConnectionState {
    var dataPlaneLabel: String {
        switch self {
        case .checking:
            L10n.text("CHECKING")
        case .disconnected:
            L10n.text("OFFLINE")
        case .waitingForLogin:
            L10n.text("AUTHORIZE")
        case .connected:
            L10n.text("CURRENT")
        case .unavailable:
            L10n.text("UNAVAILABLE")
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
            L10n.text("Checking Codex")
        case .disconnected:
            L10n.text("Codex not connected")
        case .waitingForLogin:
            L10n.text("Waiting for authorization")
        case .connected:
            L10n.text("Codex connected")
        case .unavailable:
            L10n.text("Codex CLI unavailable")
        }
    }
}
