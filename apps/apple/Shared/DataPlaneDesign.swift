import SwiftUI

// Shared Still Signature primitives. Names are retained for existing callers.
enum DataPlaneTheme {
    static let canvas = Color(red: 24 / 255, green: 24 / 255, blue: 19 / 255)
    static let surface = canvas
    static let ink = Color(red: 242 / 255, green: 240 / 255, blue: 235 / 255)
    static let muted = Color(red: 160 / 255, green: 158 / 255, blue: 151 / 255)
    static let line = Color(red: 62 / 255, green: 62 / 255, blue: 55 / 255)
    static let track = Color(red: 47 / 255, green: 47 / 255, blue: 41 / 255)
    static let signal = Color(red: 239 / 255, green: 198 / 255, blue: 90 / 255)
    static let critical = Color(red: 242 / 255, green: 104 / 255, blue: 86 / 255)

    static func emphasis(for remainingPercentage: Int) -> Color {
        remainingPercentage <= 20 ? critical : signal
    }
}

struct DataPlaneGridBackground: View {
    var spacing: CGFloat = 24

    var body: some View {
        DataPlaneTheme.canvas.accessibilityHidden(true)
    }
}

/// Layout grouping only: the screen owns its single surface.
struct DataPlaneSurface<Content: View>: View {
    let content: Content

    init(cornerRadius: CGFloat = 18, @ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View { content }
}

struct DataPlaneLabel: View {
    let text: String
    var tint: Color = DataPlaneTheme.muted

    var body: some View {
        Text(verbatim: text)
            .font(.caption)
            .foregroundStyle(tint)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }
}

struct DataPlaneStatusIndicator: View {
    let label: String
    var tint: Color = DataPlaneTheme.signal

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(tint).frame(width: 5, height: 5)
            DataPlaneLabel(text: label, tint: tint)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }
}

/// Fixed 4:2 stripes from the logo; the final active stripe is fully white.
/// At 0% no white marker is drawn. The numeric value remains exact.
struct DataPlaneMeter: View {
    let remainingPercentage: Int
    var height: CGFloat = 8
    var showsScale = false
    var stripeWidth: CGFloat = 4

    private var normalizedPercentage: Int {
        min(max(remainingPercentage, 0), 100)
    }

    var body: some View {
        Canvas { context, size in
            let step = stripeWidth * 1.5
            let edge = size.width * CGFloat(normalizedPercentage) / 100
            let terminal = edge > 0 ? max(0, ceil(edge / step) - 1) : -1
            var x: CGFloat = 0
            var index: CGFloat = 0
            while x < size.width {
                let rect = CGRect(x: x, y: 0, width: min(stripeWidth, size.width - x), height: size.height)
                let color: Color = index == terminal ? .white
                    : (x < edge ? DataPlaneTheme.signal : DataPlaneTheme.track)
                context.fill(Path(rect), with: .color(color))
                x += step
                index += 1
            }
        }
        .frame(height: height)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.text("Codex weekly limit"))
        .accessibilityValue(L10n.text("{0} percent remaining", normalizedPercentage))
    }
}

struct DataPlaneMetricCell: View {
    let label: String
    let value: String
    var detail: String?
    var isAccented = false
    var minimumHeight: CGFloat = 88

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            DataPlaneLabel(text: label)
            Text(verbatim: value)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(DataPlaneTheme.ink)
            if let detail {
                Text(verbatim: detail)
                    .font(.caption)
                    .foregroundStyle(DataPlaneTheme.muted)
            }
        }
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, minHeight: minimumHeight, alignment: .topLeading)
        .accessibilityElement(children: .combine)
    }
}

struct DataPlaneRule: View {
    var body: some View {
        Rectangle().fill(DataPlaneTheme.line).frame(height: 0.5).accessibilityHidden(true)
    }
}

struct DataPlanePrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(DataPlaneTheme.canvas)
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(DataPlaneTheme.signal.opacity(isEnabled ? 1 : 0.42), in: .capsule)
            .opacity(configuration.isPressed ? 0.78 : 1)
    }
}

struct DataPlaneSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.medium))
            .foregroundStyle(DataPlaneTheme.ink)
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(DataPlaneTheme.track.opacity(configuration.isPressed ? 1 : 0.45), in: .capsule)
            .opacity(isEnabled ? 1 : 0.42)
    }
}
