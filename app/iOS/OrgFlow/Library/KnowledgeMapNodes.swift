import UIKit

private typealias Tone = KnowledgeMapData.Tone

/// A person's initials on a pale tone fill with a tone ring. Leaving or departed people get a
/// pulsing apricot glow; Unassigned is a dashed, muted "?".
final class MapAvatarView: UIView {
    private let glow = CALayer()
    private let fill = CAGradientLayer()
    private let ring = CAShapeLayer()
    private let label = UILabel()
    private let diameter: CGFloat
    private var warns = false

    init(diameter: CGFloat) {
        self.diameter = diameter
        super.init(frame: CGRect(x: 0, y: 0, width: diameter, height: diameter))
        translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: diameter),
            heightAnchor.constraint(equalToConstant: diameter),
        ])
        glow.backgroundColor = ContinuityTheme.Color.apricot.cgColor
        glow.shadowColor = ContinuityTheme.Color.apricot.cgColor
        glow.shadowRadius = diameter * 0.22
        glow.shadowOpacity = 1
        glow.shadowOffset = .zero
        glow.opacity = 0
        layer.addSublayer(glow)
        fill.type = .axial
        fill.startPoint = CGPoint(x: 0.2, y: 0)
        fill.endPoint = CGPoint(x: 0.8, y: 1)
        layer.addSublayer(fill)
        ring.fillColor = nil
        ring.lineWidth = max(1.5, diameter / 22)
        layer.addSublayer(ring)
        label.font = ContinuityTheme.Font.text(diameter * 0.36, weight: .semibold)
        label.textAlignment = .center
        label.adjustsFontSizeToFitWidth = true
        label.minimumScaleFactor = 0.6
        addSubview(label)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func configure(initials: String?, tone: KnowledgeMapData.Tone, warns: Bool) {
        self.warns = warns
        let unassigned = initials == nil
        label.text = initials ?? "?"
        label.textColor = unassigned ? ContinuityTheme.Color.secondaryInk : tone.ink
        fill.colors = unassigned
            ? [UIColor.white.cgColor, Tone.muted.pale.cgColor]
            : [UIColor.white.cgColor, tone.pale.cgColor, tone.color.withAlphaComponent(0.35).cgColor]
        ring.strokeColor = (warns ? ContinuityTheme.Color.apricot : unassigned ? ContinuityTheme.Color.secondaryInk.withAlphaComponent(0.6) : tone.color).cgColor
        ring.lineDashPattern = unassigned ? [3, 3] : nil
        updateGlow()
        setNeedsLayout()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        updateGlow()
    }

    private func updateGlow() {
        glow.removeAllAnimations()
        guard warns else {
            glow.opacity = 0
            return
        }
        if UIAccessibility.isReduceMotionEnabled || window == nil {
            glow.opacity = 0.45
            return
        }
        glow.opacity = 0.55
        let pulse = CAAnimationGroup()
        let opacity = CABasicAnimation(keyPath: "opacity")
        opacity.fromValue = 0.2
        opacity.toValue = 0.75
        let scale = CABasicAnimation(keyPath: "transform.scale")
        scale.fromValue = 1
        scale.toValue = 1.32
        pulse.animations = [opacity, scale]
        pulse.duration = 1.1
        pulse.autoreverses = true
        pulse.repeatCount = .infinity
        pulse.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        glow.add(pulse, forKey: "pulse")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        glow.frame = bounds
        glow.cornerRadius = bounds.width / 2
        fill.frame = bounds
        fill.cornerRadius = bounds.width / 2
        ring.frame = bounds
        ring.path = UIBezierPath(ovalIn: bounds.insetBy(dx: ring.lineWidth / 2, dy: ring.lineWidth / 2)).cgPath
        CATransaction.commit()
        label.frame = bounds.insetBy(dx: 3, dy: 3)
    }
}

/// Shared styling for the white cards that float on the map.
class MapCardNode: UIView {
    let card = UIView()
    private(set) var tone: KnowledgeMapData.Tone = .teal

    override init(frame: CGRect) {
        super.init(frame: frame)
        card.backgroundColor = .white
        card.layer.cornerCurve = .continuous
        card.layer.borderWidth = ContinuityTheme.Metrics.hairline * 2
        card.layer.borderColor = ContinuityTheme.Color.hairline.cgColor
        card.layer.shadowColor = ContinuityTheme.Color.ink.cgColor
        card.layer.shadowOpacity = 0.08
        card.layer.shadowRadius = 10
        card.layer.shadowOffset = CGSize(width: 0, height: 4)
        card.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(card)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func setTone(_ tone: KnowledgeMapData.Tone) { self.tone = tone }

    /// Sizes the node to its card's content, keeping its center.
    func fitToContent() {
        let size = card.systemLayoutSizeFitting(UIView.layoutFittingCompressedSize)
        let center = self.center
        bounds = CGRect(origin: .zero, size: CGSize(width: ceil(size.width), height: ceil(size.height)))
        card.frame = bounds
        self.center = center
        card.layer.shadowPath = UIBezierPath(roundedRect: bounds, cornerRadius: card.layer.cornerRadius).cgPath
    }

    /// Visual states. `emphasis` lifts the card (drop target, dragged); `outline` draws a tone border.
    func applyState(emphasis: CGFloat, outline: UIColor?, glow: UIColor?, rotation: CGFloat = 0, animated: Bool) {
        let changes = {
            self.card.transform = CGAffineTransform(scaleX: emphasis, y: emphasis).rotated(by: rotation)
            self.card.layer.borderColor = (outline ?? ContinuityTheme.Color.hairline).cgColor
            self.card.layer.borderWidth = outline == nil ? ContinuityTheme.Metrics.hairline * 2 : 2
            self.card.layer.shadowColor = (glow ?? ContinuityTheme.Color.ink).cgColor
            self.card.layer.shadowOpacity = glow == nil ? (emphasis > 1.01 ? 0.18 : 0.08) : 0.55
            self.card.layer.shadowRadius = glow == nil ? (emphasis > 1.01 ? 18 : 10) : 16
            self.card.layer.shadowOffset = CGSize(width: 0, height: glow == nil ? (emphasis > 1.01 ? 10 : 4) : 0)
        }
        if animated, !UIAccessibility.isReduceMotionEnabled {
            UIView.animate(springDuration: 0.35, bounce: 0.3, options: [.allowUserInteraction, .beginFromCurrentState], animations: changes)
        } else {
            changes()
        }
    }
}

/// "Your organization" at the center, with a slowly turning thread mark.
final class MapRootNode: MapCardNode {
    private let mark = CAGradientLayer()
    private let markView = UIView()
    private let title = UILabel()
    private let detail = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        card.layer.cornerRadius = 24
        mark.type = .conic
        mark.startPoint = CGPoint(x: 0.5, y: 0.5)
        mark.endPoint = CGPoint(x: 0.5, y: 0)
        mark.colors = [ContinuityTheme.Color.teal, ContinuityTheme.Color.iris, ContinuityTheme.Color.apricot, ContinuityTheme.Color.teal].map(\.cgColor)
        mark.frame = CGRect(x: 0, y: 0, width: 30, height: 30)
        mark.cornerRadius = 15
        let hole = CALayer()
        hole.backgroundColor = UIColor.white.cgColor
        hole.frame = CGRect(x: 9, y: 9, width: 12, height: 12)
        hole.cornerRadius = 6
        markView.layer.addSublayer(mark)
        markView.layer.addSublayer(hole)
        markView.translatesAutoresizingMaskIntoConstraints = false

        title.text = "Your organization"
        title.font = ContinuityTheme.Font.display(20, weight: .semibold)
        title.textColor = ContinuityTheme.Color.ink
        detail.numberOfLines = 1
        let labels = UIStackView(arrangedSubviews: [title, detail])
        labels.axis = .vertical
        labels.spacing = 1
        let row = UIStackView(arrangedSubviews: [markView, labels])
        row.alignment = .center
        row.spacing = 10
        row.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(row)
        NSLayoutConstraint.activate([
            markView.widthAnchor.constraint(equalToConstant: 30),
            markView.heightAnchor.constraint(equalToConstant: 30),
            row.topAnchor.constraint(equalTo: card.topAnchor, constant: 10),
            row.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -10),
            row.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 10),
            row.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -18),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func configure(items: Int, people: Int) {
        detail.attributedText = ContinuityTheme.caption("\(items) \(items == 1 ? "item" : "items") · \(people) \(people == 1 ? "person" : "people")", size: 13)
        fitToContent()
        card.layer.cornerRadius = bounds.height / 2
        card.layer.shadowPath = UIBezierPath(roundedRect: bounds, cornerRadius: bounds.height / 2).cgPath
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        mark.removeAllAnimations()
        guard window != nil, !UIAccessibility.isReduceMotionEnabled else { return }
        let spin = CABasicAnimation(keyPath: "transform.rotation.z")
        spin.fromValue = 0
        spin.toValue = CGFloat.pi * 2
        spin.duration = 9
        spin.repeatCount = .infinity
        mark.add(spin, forKey: "spin")
    }
}

/// A person (or Unassigned): avatar, name, role and how many items they own.
final class MapClusterNode: MapCardNode {
    let avatar = MapAvatarView(diameter: 46)
    private let name = UILabel()
    private let detail = UILabel()
    /// How many items they own, as a small tone-colored badge on the avatar.
    private let badge = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        card.layer.cornerRadius = 22
        name.font = ContinuityTheme.Font.text(17.5, weight: .semibold)
        name.textColor = ContinuityTheme.Color.ink
        detail.font = ContinuityTheme.Font.text(14.5)
        detail.textColor = ContinuityTheme.Color.secondaryInk
        for label in [name, detail] {
            label.lineBreakMode = .byTruncatingTail
            label.widthAnchor.constraint(lessThanOrEqualToConstant: 168).isActive = true
        }
        badge.font = UIFont.monospacedDigitSystemFont(ofSize: 12.5, weight: .bold)
        badge.textColor = .white
        badge.textAlignment = .center
        badge.layer.cornerRadius = 10
        badge.layer.masksToBounds = true
        badge.layer.borderColor = UIColor.white.cgColor
        badge.layer.borderWidth = 1.5
        badge.translatesAutoresizingMaskIntoConstraints = false
        avatar.addSubview(badge)
        NSLayoutConstraint.activate([
            badge.heightAnchor.constraint(equalToConstant: 20),
            badge.widthAnchor.constraint(greaterThanOrEqualToConstant: 20),
            badge.centerXAnchor.constraint(equalTo: avatar.trailingAnchor, constant: -4),
            badge.centerYAnchor.constraint(equalTo: avatar.topAnchor, constant: 4),
        ])
        let labels = UIStackView(arrangedSubviews: [name, detail])
        labels.axis = .vertical
        labels.spacing = 1
        let row = UIStackView(arrangedSubviews: [avatar, labels])
        row.alignment = .center
        row.spacing = 11
        row.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(row)
        NSLayoutConstraint.activate([
            row.topAnchor.constraint(equalTo: card.topAnchor, constant: 7),
            row.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -7),
            row.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 7),
            row.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func configure(_ cluster: KnowledgeMapData.Cluster, count: Int) {
        setTone(cluster.tone)
        name.text = cluster.name
        let role = cluster.person?.role.flatMap { $0.isEmpty ? nil : $0 }
        detail.text = cluster.person == nil ? "Needs an owner" : (role ?? "\(count) \(count == 1 ? "item" : "items")")
        badge.text = "\(count)"
        badge.isHidden = count == 0
        badge.backgroundColor = cluster.person?.isDeparting == true ? ContinuityTheme.Color.apricot : cluster.tone.color
        badge.invalidateIntrinsicContentSize()
        avatar.configure(initials: cluster.person?.initials, tone: cluster.tone, warns: cluster.person?.isDeparting == true)
        fitToContent()
    }
}

/// A playbook or indexed source: a pill with its kind's symbol and title.
final class MapItemNode: MapCardNode {
    private let iconBack = UIView()
    private let icon = UIImageView()
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let title = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        card.layer.cornerRadius = 20
        iconBack.layer.cornerRadius = 14
        iconBack.translatesAutoresizingMaskIntoConstraints = false
        icon.contentMode = .center
        icon.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 13, weight: .semibold)
        icon.translatesAutoresizingMaskIntoConstraints = false
        spinner.transform = CGAffineTransform(scaleX: 0.7, y: 0.7)
        spinner.hidesWhenStopped = true
        spinner.translatesAutoresizingMaskIntoConstraints = false
        iconBack.addSubview(icon)
        iconBack.addSubview(spinner)
        title.font = ContinuityTheme.Font.text(16, weight: .medium)
        title.textColor = ContinuityTheme.Color.ink
        title.numberOfLines = 2
        title.lineBreakMode = .byTruncatingTail
        title.preferredMaxLayoutWidth = 150
        title.widthAnchor.constraint(lessThanOrEqualToConstant: 150).isActive = true
        let row = UIStackView(arrangedSubviews: [iconBack, title])
        row.alignment = .center
        row.spacing = 7
        row.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(row)
        NSLayoutConstraint.activate([
            iconBack.widthAnchor.constraint(equalToConstant: 28),
            iconBack.heightAnchor.constraint(equalToConstant: 28),
            icon.centerXAnchor.constraint(equalTo: iconBack.centerXAnchor),
            icon.centerYAnchor.constraint(equalTo: iconBack.centerYAnchor),
            spinner.centerXAnchor.constraint(equalTo: iconBack.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: iconBack.centerYAnchor),
            row.topAnchor.constraint(equalTo: card.topAnchor, constant: 6),
            row.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -6),
            row.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 6),
            row.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -14),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func configure(_ item: KnowledgeMapData.Item, tone: KnowledgeMapData.Tone) {
        setTone(tone)
        title.text = item.title
        icon.image = UIImage(systemName: item.symbol)
        icon.tintColor = tone.ink
        iconBack.backgroundColor = tone.pale
        spinner.color = tone.ink
        fitToContent()
    }

    var isSaving: Bool = false {
        didSet {
            guard isSaving != oldValue else { return }
            if isSaving { spinner.startAnimating() } else { spinner.stopAnimating() }
            icon.isHidden = isSaving
        }
    }
}

/// The soft colored cloud behind a cluster. It breathes slowly unless Reduce Motion is on.
final class MapCloudView: UIView {
    private let gradient = CAGradientLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        gradient.type = .radial
        gradient.startPoint = CGPoint(x: 0.5, y: 0.5)
        gradient.endPoint = CGPoint(x: 1, y: 1)
        gradient.locations = [0, 0.45, 1]
        layer.addSublayer(gradient)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func setTone(_ tone: KnowledgeMapData.Tone) {
        let alpha: CGFloat = tone == .muted ? 0.16 : 0.3
        gradient.colors = [tone.color.withAlphaComponent(alpha), tone.color.withAlphaComponent(alpha * 0.4), tone.color.withAlphaComponent(0)].map(\.cgColor)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        gradient.frame = bounds
        CATransaction.commit()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        gradient.removeAllAnimations()
        guard window != nil, !UIAccessibility.isReduceMotionEnabled else { return }
        let breathe = CABasicAnimation(keyPath: "transform.scale")
        breathe.fromValue = 0.95
        breathe.toValue = 1.05
        breathe.duration = Double.random(in: 3.2...4.6)
        breathe.autoreverses = true
        breathe.repeatCount = .infinity
        breathe.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        breathe.timeOffset = Double.random(in: 0...3)
        gradient.add(breathe, forKey: "breathe")
    }
}
