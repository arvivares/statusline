import SwiftUI

enum DataPlaneTheme {
    static let canvas = Color(red: 13 / 255, green: 14 / 255, blue: 11 / 255)
    static let surface = Color(red: 20 / 255, green: 21 / 255, blue: 15 / 255)
    static let ink = Color(red: 236 / 255, green: 233 / 255, blue: 220 / 255)
    static let muted = Color(red: 157 / 255, green: 155 / 255, blue: 137 / 255)
    static let line = Color(red: 59 / 255, green: 57 / 255, blue: 41 / 255)
    static let grid = Color(red: 239 / 255, green: 198 / 255, blue: 90 / 255).opacity(0.045)
    static let signal = Color(red: 239 / 255, green: 198 / 255, blue: 90 / 255)
    static let critical = Color(red: 242 / 255, green: 104 / 255, blue: 86 / 255)

    static func emphasis(for remainingPercentage: Int) -> Color {
        remainingPercentage <= 20 ? critical : signal
    }
}

struct DataPlaneGridBackground: View {
    let spacing: CGFloat

    init(spacing: CGFloat = 24) {
        self.spacing = spacing
    }

    var body: some View {
        ZStack {
            DataPlaneTheme.canvas

            Canvas { context, size in
                var path = Path()
                var x: CGFloat = 0
                var y: CGFloat = 0

                while x <= size.width {
                    path.move(to: CGPoint(x: x, y: 0))
                    path.addLine(to: CGPoint(x: x, y: size.height))
                    x += spacing
                }

                while y <= size.height {
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: size.width, y: y))
                    y += spacing
                }

                context.stroke(path, with: .color(DataPlaneTheme.grid), lineWidth: 0.5)
            }
        }
        .accessibilityHidden(true)
    }
}

struct DataPlaneSurface<Content: View>: View {
    let cornerRadius: CGFloat
    let content: Content

    init(
        cornerRadius: CGFloat = 18,
        @ViewBuilder content: () -> Content
    ) {
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    var body: some View {
        content
            .background(DataPlaneTheme.surface.opacity(0.96), in: .rect(cornerRadius: cornerRadius))
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius)
                    .strokeBorder(DataPlaneTheme.line)
            }
    }
}

struct DataPlaneLabel: View {
    let text: String
    var tint: Color = DataPlaneTheme.muted

    var body: some View {
        Text(verbatim: text.uppercased())
            .font(.caption2.monospaced().weight(.semibold))
            .tracking(1.1)
            .foregroundStyle(tint)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }
}

struct DataPlaneStatusIndicator: View {
    let label: String
    var tint: Color = DataPlaneTheme.signal

    var body: some View {
        HStack(spacing: 7) {
            Rectangle()
                .fill(tint)
                .frame(width: 7, height: 7)
                .shadow(color: tint.opacity(0.45), radius: 4)

            DataPlaneLabel(text: label, tint: tint)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }
}

struct DataPlaneMeter: View {
    let remainingPercentage: Int
    var height: CGFloat = 11
    var showsScale = true

    private let segmentCount = 20

    private var normalizedPercentage: Int {
        min(max(remainingPercentage, 0), 100)
    }

    private var fullSegments: Int {
        normalizedPercentage / 5
    }

    private var hasPartialSegment: Bool {
        normalizedPercentage < 100 && normalizedPercentage % 5 != 0
    }

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 2) {
                ForEach(0..<segmentCount, id: \.self) { index in
                    Rectangle()
                        .fill(fillColor(for: index))
                        .frame(maxWidth: .infinity)
                        .overlay {
                            Rectangle()
                                .strokeBorder(DataPlaneTheme.line, lineWidth: 1)
                        }
                }
            }
            .frame(height: height)

            if showsScale {
                HStack {
                    Text("0")
                    Spacer()
                    Text(L10n.text("{0} / LEFT", normalizedPercentage))
                    Spacer()
                    Text("100")
                }
                .font(.caption2.monospaced())
                .foregroundStyle(DataPlaneTheme.muted)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.text("Codex weekly limit"))
        .accessibilityValue(L10n.text("{0} percent remaining", normalizedPercentage))
    }

    private func fillColor(for index: Int) -> Color {
        if index < fullSegments {
            return DataPlaneTheme.emphasis(for: normalizedPercentage)
        }

        if index == fullSegments, hasPartialSegment {
            return DataPlaneTheme.ink
        }

        return .clear
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
                .font(.subheadline.monospaced().weight(.semibold))
                .foregroundStyle(isAccented ? DataPlaneTheme.signal : DataPlaneTheme.ink)
                .lineLimit(2)

            if let detail {
                Text(verbatim: detail)
                    .font(.caption2.monospaced())
                    .foregroundStyle(DataPlaneTheme.muted)
                    .lineLimit(2)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: minimumHeight, alignment: .topLeading)
        .background(DataPlaneTheme.surface.opacity(0.72))
        .overlay {
            Rectangle()
                .strokeBorder(DataPlaneTheme.line, lineWidth: 0.5)
        }
        .accessibilityElement(children: .combine)
    }
}

struct DataPlaneRule: View {
    var body: some View {
        Rectangle()
            .fill(DataPlaneTheme.line)
            .frame(height: 1)
            .accessibilityHidden(true)
    }
}

struct DataPlanePrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.footnote.monospaced().weight(.bold))
            .textCase(.uppercase)
            .tracking(0.8)
            .foregroundStyle(DataPlaneTheme.canvas)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(DataPlaneTheme.signal.opacity(isEnabled ? 1 : 0.42))
            .opacity(configuration.isPressed ? 0.78 : 1)
    }
}

struct DataPlaneSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.footnote.monospaced().weight(.semibold))
            .foregroundStyle(DataPlaneTheme.ink)
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(DataPlaneTheme.surface.opacity(0.8))
            .overlay {
                Rectangle()
                    .strokeBorder(DataPlaneTheme.line)
            }
            .opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.42)
    }
}
