import SwiftUI
import Vision
import VisionKit

struct RelayPairingSheet: View {
    @Environment(\.dismiss) private var dismiss

    let onPair: @MainActor (String) async -> Void

    @State private var pairingLink = ""
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    DataPlaneLabel(text: L10n.text("RELAY / DEVICE PAIRING"), tint: DataPlaneTheme.signal)

                    Text(L10n.text("Connect this device"))
                        .font(.title2.bold())
                        .foregroundStyle(DataPlaneTheme.ink)

                    Text(L10n.text("Scan the companion’s private QR. The encryption key is stored in Keychain and is never sent to the relay."))
                        .font(.subheadline)
                        .foregroundStyle(DataPlaneTheme.muted)

                    if DataScannerViewController.isSupported,
                       DataScannerViewController.isAvailable {
                        RelayQRCodeScanner { value in
                            pairingLink = value
                            submit()
                        }
                        .frame(minHeight: 280)
                        .clipShape(.rect(cornerRadius: 16))
                        .overlay {
                            RoundedRectangle(cornerRadius: 16)
                                .strokeBorder(DataPlaneTheme.line)
                        }
                        .accessibilityLabel(L10n.text("QR code scanner"))
                    } else {
                        DataPlaneSurface {
                            Text(L10n.text("The camera is unavailable here. Paste the private link shown by the companion below."))
                                .font(.subheadline)
                                .foregroundStyle(DataPlaneTheme.muted)
                                .padding(18)
                        }
                    }

                    DataPlaneSurface {
                        VStack(alignment: .leading, spacing: 12) {
                            DataPlaneLabel(text: L10n.text("PRIVATE.PAIRING.LINK"))

                            TextField("statusline://pair?…", text: $pairingLink, axis: .vertical)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .font(.caption.monospaced())
                                .foregroundStyle(DataPlaneTheme.ink)
                                .padding(12)
                                .background(DataPlaneTheme.canvas)
                                .overlay {
                                    Rectangle().strokeBorder(DataPlaneTheme.line)
                                }

                            Button(action: submit) {
                                HStack(spacing: 9) {
                                    if isSubmitting {
                                        ProgressView()
                                            .controlSize(.small)
                                            .tint(DataPlaneTheme.canvas)
                                    }
                                    Text(isSubmitting ? L10n.text("Pairing…") : L10n.text("Connect device"))
                                }
                                .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(DataPlanePrimaryButtonStyle())
                            .disabled(
                                isSubmitting
                                    || pairingLink.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            )
                        }
                        .padding(16)
                    }
                }
                .padding(18)
            }
            .scrollIndicators(.hidden)
            .background {
                DataPlaneGridBackground()
                    .ignoresSafeArea()
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.text("Cancel")) {
                        dismiss()
                    }
                }
            }
        }
        .tint(DataPlaneTheme.signal)
        .preferredColorScheme(.dark)
        .presentationDetents([.large])
    }

    private func submit() {
        let value = pairingLink.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, !isSubmitting else {
            return
        }
        isSubmitting = true
        Task { @MainActor in
            await onPair(value)
            isSubmitting = false
        }
    }
}

private struct RelayQRCodeScanner: UIViewControllerRepresentable {
    let onCode: @MainActor (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let controller = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        controller.delegate = context.coordinator
        Task { @MainActor in
            try? controller.startScanning()
        }
        return controller
    }

    func updateUIViewController(
        _ uiViewController: DataScannerViewController,
        context: Context
    ) {}

    static func dismantleUIViewController(
        _ uiViewController: DataScannerViewController,
        coordinator: Coordinator
    ) {
        uiViewController.stopScanning()
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        private let parent: RelayQRCodeScanner
        private var hasDeliveredCode = false

        init(parent: RelayQRCodeScanner) {
            self.parent = parent
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didAdd addedItems: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            guard !hasDeliveredCode else {
                return
            }
            for item in addedItems {
                guard case .barcode(let barcode) = item,
                      let value = barcode.payloadStringValue else {
                    continue
                }
                hasDeliveredCode = true
                parent.onCode(value)
                return
            }
        }
    }
}
