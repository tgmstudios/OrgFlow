import UIKit

/// Design tokens for Continuity. Light, editorial, with saturated color reserved for the thread.
enum ContinuityTheme {
    enum Color {
        static let canvas = UIColor(hex: 0xFAF9F6)
        static let ink = UIColor(hex: 0x202E35)
        static let secondaryInk = UIColor(hex: 0x75828A)
        static let teal = UIColor(hex: 0x4FAAA5)
        static let iris = UIColor(hex: 0xA99AE6)
        static let apricot = UIColor(hex: 0xF2AA88)
        static let paleTeal = UIColor(hex: 0xD8F0EE)
        static let paleLavender = UIColor(hex: 0xF1EDFA)
        static let hairline = UIColor(hex: 0xDFE5E4)
        /// OrgFlow's primary purple (the web's `--primary`), for selected voice controls.
        static let primary = UIColor(hex: 0x7753CE)
    }

    enum Font {
        /// Editorial serif used for headlines and the user's own prompts.
        static func display(_ size: CGFloat, weight: UIFont.Weight = .regular) -> UIFont {
            let base = UIFont.systemFont(ofSize: size, weight: weight)
            guard let descriptor = base.fontDescriptor.withDesign(.serif) else { return base }
            return UIFont(descriptor: descriptor, size: size)
        }

        static func text(_ size: CGFloat, weight: UIFont.Weight = .regular) -> UIFont {
            UIFont.systemFont(ofSize: size, weight: weight)
        }

        /// Technical caption: monospaced, uppercase by convention, slightly tracked.
        static func caption(_ size: CGFloat = 10.5, weight: UIFont.Weight = .medium) -> UIFont {
            UIFont.monospacedSystemFont(ofSize: size, weight: weight)
        }
    }

    enum Metrics {
        static let gutter: CGFloat = 24
        static let hairline: CGFloat = 1 / 3
        static let controlSize: CGFloat = 44
        static let captionTracking: CGFloat = 1.4
    }

    /// Attributed string for mono captions ("§ 01 — LIVING THREAD").
    static func caption(_ text: String, color: UIColor = Color.secondaryInk, size: CGFloat = 10.5) -> NSAttributedString {
        NSAttributedString(string: text.uppercased(), attributes: [
            .font: Font.caption(size),
            .foregroundColor: color,
            .kern: Metrics.captionTracking,
        ])
    }

    /// Liquid Glass effect for interactive surfaces.
    static func glassEffect(tint: UIColor? = nil, interactive: Bool = true) -> UIVisualEffect {
        let effect = UIGlassEffect(style: .regular)
        effect.isInteractive = interactive
        effect.tintColor = tint
        return effect
    }
}

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: alpha
        )
    }
}
