import UIKit

/// The Continuity brand mark: two interlaced open arcs (teal and iris) passing a thread forward.
final class ContinuityMarkView: UIView {
    private let leftArc = CAShapeLayer()
    private let rightArc = CAShapeLayer()
    private let dotLayer = CAShapeLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        commonInit()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        commonInit()
    }

    private func commonInit() {
        isOpaque = false
        backgroundColor = .clear
        for (layer, color) in [(leftArc, ContinuityTheme.Color.teal), (rightArc, ContinuityTheme.Color.iris)] {
            layer.fillColor = nil
            layer.strokeColor = color.cgColor
            layer.lineCap = .round
            self.layer.addSublayer(layer)
        }
        dotLayer.fillColor = ContinuityTheme.Color.ink.cgColor
        layer.addSublayer(dotLayer)
    }

    override var intrinsicContentSize: CGSize { CGSize(width: 22, height: 22) }

    override func layoutSubviews() {
        super.layoutSubviews()
        let w = bounds.width
        let scale = w / 22
        let radius = 0.26 * w
        let offset = 0.35 * w
        let cy = bounds.midY
        let leftCenter = CGPoint(x: bounds.midX - offset / 2, y: cy)
        let rightCenter = CGPoint(x: bounds.midX + offset / 2, y: cy)
        let span = 280 * CGFloat.pi / 180
        let leftStart = 40 * CGFloat.pi / 180   // gap faces right, centered on 0°
        let rightStart = 220 * CGFloat.pi / 180 // gap faces left, centered on 180°

        leftArc.path = UIBezierPath(arcCenter: leftCenter, radius: radius, startAngle: leftStart, endAngle: leftStart + span, clockwise: true).cgPath
        rightArc.path = UIBezierPath(arcCenter: rightCenter, radius: radius, startAngle: rightStart, endAngle: rightStart + span, clockwise: true).cgPath
        leftArc.lineWidth = 1.8 * scale
        rightArc.lineWidth = 1.8 * scale

        let dotRadius = 1.25 * scale
        let dotCenter = CGPoint(x: rightCenter.x + radius, y: cy)
        dotLayer.path = UIBezierPath(ovalIn: CGRect(x: dotCenter.x - dotRadius, y: dotCenter.y - dotRadius, width: dotRadius * 2, height: dotRadius * 2)).cgPath
    }

    /// Draws both arcs in (strokeEnd 0 to 1, 0.9s ease in-out, 0.15s stagger), then reveals the dot.
    func animateDraw() {
        let timing = CAMediaTimingFunction(name: .easeInEaseOut)
        for (index, arc) in [leftArc, rightArc].enumerated() {
            let animation = CABasicAnimation(keyPath: "strokeEnd")
            animation.fromValue = 0
            animation.toValue = 1
            animation.duration = 0.9
            animation.timingFunction = timing
            animation.beginTime = CACurrentMediaTime() + 0.15 * Double(index)
            animation.fillMode = .backwards
            arc.add(animation, forKey: "draw")
        }
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 0
        fade.toValue = 1
        fade.duration = 0.3
        fade.beginTime = CACurrentMediaTime() + 0.15 + 0.7
        fade.fillMode = .backwards
        dotLayer.add(fade, forKey: "fade")
    }
}
