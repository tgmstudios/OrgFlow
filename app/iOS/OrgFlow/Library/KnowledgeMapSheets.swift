import UIKit

/// Shared building blocks for the map's sheets and the person screen.
enum MapUI {
    static func caption(_ text: String, color: UIColor = ContinuityTheme.Color.secondaryInk) -> UILabel {
        let label = UILabel()
        label.attributedText = ContinuityTheme.caption(text, color: color)
        label.numberOfLines = 0
        return label
    }

    static func title(_ text: String, size: CGFloat = 26) -> UILabel {
        let label = UILabel()
        label.text = text
        label.font = ContinuityTheme.Font.display(size, weight: .semibold)
        label.textColor = ContinuityTheme.Color.ink
        label.numberOfLines = 0
        return label
    }

    static func body(_ text: String, color: UIColor = ContinuityTheme.Color.secondaryInk, size: CGFloat = 15) -> UILabel {
        let label = UILabel()
        label.text = text
        label.font = ContinuityTheme.Font.text(size)
        label.textColor = color
        label.numberOfLines = 0
        return label
    }

    /// The primary (teal, prominent glass) or secondary (glass) capsule action used across OrgFlow.
    static func button(_ title: String, symbol: String?, prominent: Bool, action: UIAction? = nil) -> UIButton {
        var config: UIButton.Configuration = prominent ? .prominentGlass() : .glass()
        config.title = title
        config.cornerStyle = .capsule
        config.buttonSize = .large
        if let symbol {
            config.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .semibold))
            config.imagePadding = 8
        }
        config.baseBackgroundColor = prominent ? ContinuityTheme.Color.teal : nil
        config.baseForegroundColor = prominent ? .white : ContinuityTheme.Color.ink
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var out = incoming
            out.font = ContinuityTheme.Font.text(16, weight: .semibold)
            return out
        }
        let button = action.map { UIButton(configuration: config, primaryAction: $0) } ?? UIButton(configuration: config)
        return button
    }

    /// A tappable row: symbol, title, optional detail, trailing chevron or arrow.
    static func row(symbol: String, tint: UIColor, title: String, detail: String? = nil, external: Bool = false, accessory: Bool = true, action: @escaping () -> Void) -> UIButton {
        var config = UIButton.Configuration.plain()
        config.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 13, weight: .semibold))
        config.imagePadding = 12
        config.imageColorTransformer = UIConfigurationColorTransformer { _ in tint }
        config.title = title
        config.subtitle = detail
        config.titleLineBreakMode = .byTruncatingTail
        config.baseForegroundColor = ContinuityTheme.Color.ink
        config.contentInsets = NSDirectionalEdgeInsets(top: 10, leading: 0, bottom: 10, trailing: accessory ? 22 : 0)
        config.titleAlignment = .leading
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var out = incoming
            out.font = ContinuityTheme.Font.text(15, weight: .medium)
            return out
        }
        config.subtitleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var out = incoming
            out.font = ContinuityTheme.Font.text(12)
            out.foregroundColor = ContinuityTheme.Color.secondaryInk
            return out
        }
        let button = UIButton(configuration: config, primaryAction: UIAction { _ in action() })
        button.contentHorizontalAlignment = .leading
        guard accessory else { return button }
        let chevron = UIImageView(image: UIImage(systemName: external ? "arrow.up.right" : "chevron.right"))
        chevron.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 11, weight: .semibold)
        chevron.tintColor = ContinuityTheme.Color.secondaryInk
        chevron.translatesAutoresizingMaskIntoConstraints = false
        button.addSubview(chevron)
        NSLayoutConstraint.activate([
            chevron.trailingAnchor.constraint(equalTo: button.trailingAnchor),
            chevron.centerYAnchor.constraint(equalTo: button.centerYAnchor),
        ])
        return button
    }

    static func hairline() -> UIView {
        let rule = UIView()
        rule.backgroundColor = ContinuityTheme.Color.hairline
        rule.heightAnchor.constraint(equalToConstant: ContinuityTheme.Metrics.hairline).isActive = true
        return rule
    }

    /// A small pulsing apricot dot, the web's `glow-dot warn`.
    static func glowDot(color: UIColor = ContinuityTheme.Color.apricot) -> UIView {
        let dot = UIView()
        dot.backgroundColor = color
        dot.layer.cornerRadius = 4
        dot.layer.shadowColor = color.cgColor
        dot.layer.shadowOpacity = 0.9
        dot.layer.shadowRadius = 5
        dot.layer.shadowOffset = .zero
        dot.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([dot.widthAnchor.constraint(equalToConstant: 8), dot.heightAnchor.constraint(equalToConstant: 8)])
        if !UIAccessibility.isReduceMotionEnabled {
            let beacon = CABasicAnimation(keyPath: "shadowRadius")
            beacon.fromValue = 2
            beacon.toValue = 9
            beacon.duration = 1.1
            beacon.autoreverses = true
            beacon.repeatCount = .infinity
            dot.layer.add(beacon, forKey: "beacon")
        }
        return dot
    }

    /// A scrolling sheet body with gutters.
    static func scrollingStack(in view: UIView, above bottom: NSLayoutYAxisAnchor? = nil) -> UIStackView {
        let scroll = UIScrollView()
        scroll.alwaysBounceVertical = true
        scroll.translatesAutoresizingMaskIntoConstraints = false
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(stack)
        view.addSubview(scroll)
        let gutter = ContinuityTheme.Metrics.gutter
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottom ?? view.bottomAnchor),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 28),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -28),
            stack.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: gutter),
            stack.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -gutter),
        ])
        return stack
    }

    static func republishWarning(count: Int) -> String {
        "\(count) published \(count == 1 ? "playbook returns" : "playbooks return") to draft and \(count == 1 ? "needs" : "need") re-approval."
    }
}

// MARK: - Inspector

/// The map's inspector: details for the selected cluster or item, with the non-drag alternatives
/// (owner picker, "Hand everything over to…").
final class MapInspectorViewController: UIViewController {
    var onAssign: ((String, String) -> Void)?
    var onHandover: ((String, String) -> Void)?
    var onSelect: ((KnowledgeMapCanvasView.Selection) -> Void)?
    var onOpenArticle: ((String) -> Void)?
    var onOpenPerson: ((String) -> Void)?
    var onClose: (() -> Void)?

    private var data: KnowledgeMapData
    private(set) var selection: KnowledgeMapCanvasView.Selection
    private var busy = false
    private var stack: UIStackView!

    init(data: KnowledgeMapData, selection: KnowledgeMapCanvasView.Selection) {
        self.data = data
        self.selection = selection
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = ContinuityTheme.Color.canvas
        stack = MapUI.scrollingStack(in: view)
        render()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || presentingViewController == nil { onClose?() }
    }

    func update(data: KnowledgeMapData, selection: KnowledgeMapCanvasView.Selection, busy: Bool) {
        self.data = data
        self.selection = selection
        self.busy = busy
        guard isViewLoaded else { return }
        UIView.transition(with: view, duration: UIAccessibility.isReduceMotionEnabled ? 0 : 0.22, options: [.transitionCrossDissolve, .allowUserInteraction]) {
            self.render()
        }
    }

    private func render() {
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        switch selection {
        case .item(let key):
            if let item = data.item(key) { renderItem(item) }
        case .cluster(let id):
            if let cluster = data.cluster(id) { renderCluster(cluster) }
        }
    }

    private func renderItem(_ item: KnowledgeMapData.Item) {
        stack.addArrangedSubview(MapUI.caption(item.kind == .article ? "Playbook" : "Indexed source"))
        let title = MapUI.title(item.title, size: 24)
        stack.addArrangedSubview(title)
        stack.setCustomSpacing(4, after: title)
        if !item.detail.isEmpty { stack.addArrangedSubview(MapUI.body(item.detail, size: 14)) }
        if let last = stack.arrangedSubviews.last { stack.setCustomSpacing(20, after: last) }

        stack.addArrangedSubview(MapUI.caption("Owner"))
        var config = UIButton.Configuration.glass()
        config.title = data.name(of: item.ownerID)
        config.image = UIImage(systemName: "chevron.up.chevron.down", withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .semibold))
        config.imagePlacement = .trailing
        config.imagePadding = 8
        config.baseForegroundColor = ContinuityTheme.Color.ink
        config.cornerStyle = .capsule
        config.showsActivityIndicator = busy
        let picker = UIButton(configuration: config)
        picker.isEnabled = !busy
        picker.contentHorizontalAlignment = .leading
        let choices = [(KnowledgeMapData.unassigned, "Unassigned")] + data.people.map { ($0.id, $0.name) }
        picker.menu = UIMenu(children: choices.map { id, name in
            UIAction(title: name, state: id == item.ownerID ? .on : .off) { [weak self] _ in
                guard id != item.ownerID else { return }
                self?.onAssign?(item.key, id)
            }
        })
        picker.showsMenuAsPrimaryAction = true
        let pickerRow = UIStackView(arrangedSubviews: [picker, UIView()])
        stack.addArrangedSubview(pickerRow)
        if item.kind == .article, item.published {
            let note = MapUI.body("Changing the owner returns this published playbook to draft for re-approval.", size: 13)
            stack.addArrangedSubview(note)
        }
        if let last = stack.arrangedSubviews.last { stack.setCustomSpacing(18, after: last) }

        if item.kind == .article {
            stack.addArrangedSubview(MapUI.button("Open playbook", symbol: "book.pages", prominent: false, action: UIAction { [weak self] _ in
                self?.onOpenArticle?(item.id)
            }))
        } else if let url = item.url {
            stack.addArrangedSubview(MapUI.button("Open original", symbol: "arrow.up.right", prominent: false, action: UIAction { _ in
                UIApplication.shared.open(url)
            }))
        }
    }

    private func renderCluster(_ cluster: KnowledgeMapData.Cluster) {
        let members = data.members(of: cluster.id)
        stack.addArrangedSubview(MapUI.caption(cluster.person == nil ? "Needs an owner" : "Person"))
        let avatar = MapAvatarView(diameter: 46)
        avatar.configure(initials: cluster.person?.initials, tone: cluster.tone, warns: cluster.person?.isDeparting == true)
        let name = MapUI.title(cluster.name, size: 26)
        let header = UIStackView(arrangedSubviews: [avatar, name])
        header.spacing = 12
        header.alignment = .center
        stack.addArrangedSubview(header)
        if let person = cluster.person {
            let line = NSMutableAttributedString(string: person.role ?? "", attributes: [
                .font: ContinuityTheme.Font.text(14), .foregroundColor: ContinuityTheme.Color.secondaryInk,
            ])
            if person.isDeparting {
                var status = person.hasLeft ? "Left" : "Leaving"
                if !person.hasLeft, let date = person.leaveDateValue { status += " " + date.formatted(.dateTime.month(.abbreviated).day()) }
                if line.length > 0 { line.append(NSAttributedString(string: "  ·  ")) }
                line.append(NSAttributedString(string: status, attributes: [
                    .font: ContinuityTheme.Font.text(14, weight: .semibold), .foregroundColor: UIColor(hex: 0xB5603A),
                ]))
            }
            if line.length > 0 {
                let label = UILabel()
                label.attributedText = line
                label.numberOfLines = 0
                stack.addArrangedSubview(label)
            }
        }
        if let last = stack.arrangedSubviews.last { stack.setCustomSpacing(18, after: last) }

        stack.addArrangedSubview(MapUI.caption("\(members.count) \(members.count == 1 ? "item" : "items")"))
        if members.isEmpty {
            stack.addArrangedSubview(MapUI.body("Nothing owned yet. Drag items here.", size: 14))
        }
        for item in members {
            stack.addArrangedSubview(MapUI.row(symbol: item.symbol, tint: cluster.tone.ink, title: item.title, detail: item.detail.isEmpty ? nil : item.detail) { [weak self] in
                self?.onSelect?(.item(item.key))
            })
        }
        if let last = stack.arrangedSubviews.last { stack.setCustomSpacing(20, after: last) }

        if !members.isEmpty {
            let others = data.people.filter { $0.id != cluster.id }
            if !others.isEmpty {
                let title = cluster.person == nil ? "Assign everything to…" : "Hand everything over to…"
                let handover = MapUI.button(title, symbol: "arrow.left.arrow.right", prominent: true)
                handover.menu = UIMenu(children: others.map { person in
                    let successor = person.id == cluster.person?.successorId
                    return UIAction(title: person.name + (successor ? " (successor)" : ""), image: successor ? UIImage(systemName: "star.fill") : nil) { [weak self] _ in
                        self?.onHandover?(cluster.id, person.id)
                    }
                })
                handover.showsMenuAsPrimaryAction = true
                handover.isEnabled = !busy
                stack.addArrangedSubview(handover)
            }
        }
        if let person = cluster.person {
            let title = person.isDeparting ? "Continue handoff" : "Review knowledge & transfer"
            stack.addArrangedSubview(MapUI.button(title, symbol: "person.crop.circle", prominent: false, action: UIAction { [weak self] _ in
                self?.onOpenPerson?(person.id)
            }))
        }
    }
}

// MARK: - Handover

/// Confirms handing every item one cluster owns to a person, listing what moves.
final class HandoverViewController: UIViewController {
    var onTargetChange: ((String) -> Void)?
    var onConfirm: ((String) async -> Bool)?
    /// Cancel tapped: the map can step out of its handover preview before the sheet finishes closing.
    var onCancel: (() -> Void)?
    var onClose: (() -> Void)?

    private let data: KnowledgeMapData
    private let from: String
    private var to: String
    private var busy = false
    private var progress: (done: Int, total: Int)?
    private var stack: UIStackView!
    private var confirmButton: UIButton!
    private var routeTarget: UILabel!
    private var hasAnimatedList = false
    private let actionBar = UIStackView()

    init(data: KnowledgeMapData, from: String, to: String) {
        self.data = data
        self.from = from
        self.to = to
        super.init(nibName: nil, bundle: nil)
        isModalInPresentation = false
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = ContinuityTheme.Color.canvas
        // Cancel and Hand over stay on screen at the medium detent; the list scrolls above them.
        confirmButton = MapUI.button("Hand over", symbol: "checkmark", prominent: true, action: UIAction { [weak self] _ in self?.confirm() })
        let cancel = MapUI.button("Cancel", symbol: nil, prominent: false, action: UIAction { [weak self] _ in
            guard let self, !busy else { return }
            onCancel?()
            dismiss(animated: true)
        })
        cancel.setContentHuggingPriority(.required, for: .horizontal)
        actionBar.addArrangedSubview(cancel)
        actionBar.addArrangedSubview(confirmButton)
        actionBar.spacing = 10
        actionBar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(actionBar)
        let gutter = ContinuityTheme.Metrics.gutter
        NSLayoutConstraint.activate([
            actionBar.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: gutter),
            actionBar.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -gutter),
            actionBar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8),
        ])
        stack = MapUI.scrollingStack(in: view, above: actionBar.topAnchor)
        render()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if presentingViewController == nil || isBeingDismissed {
            onClose?()
            onClose = nil
        }
    }

    func setProgress(done: Int, total: Int) {
        progress = (done, total)
        updateConfirm()
    }

    private var items: [KnowledgeMapData.Item] { data.members(of: from) }

    private func render() {
        let items = self.items
        stack.addArrangedSubview(MapUI.caption("Handover"))

        // Route: from ——→ to, drawn with the thread.
        let fromLabel = MapUI.body(data.name(of: from), color: ContinuityTheme.Color.secondaryInk, size: 16)
        fromLabel.numberOfLines = 1
        routeTarget = MapUI.title(data.name(of: to), size: 22)
        routeTarget.numberOfLines = 1
        let line = ThreadLineView()
        line.translatesAutoresizingMaskIntoConstraints = false
        line.heightAnchor.constraint(equalToConstant: 14).isActive = true
        line.widthAnchor.constraint(greaterThanOrEqualToConstant: 40).isActive = true
        fromLabel.setContentHuggingPriority(.required, for: .horizontal)
        routeTarget.setContentHuggingPriority(.required, for: .horizontal)
        fromLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let route = UIStackView(arrangedSubviews: [fromLabel, line, routeTarget])
        route.spacing = 10
        route.alignment = .center
        stack.addArrangedSubview(route)
        stack.setCustomSpacing(16, after: route)

        let others = data.people.filter { $0.id != from }
        var config = UIButton.Configuration.glass()
        config.title = "Receiving: " + data.name(of: to)
        config.image = UIImage(systemName: "chevron.up.chevron.down", withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .semibold))
        config.imagePlacement = .trailing
        config.imagePadding = 8
        config.cornerStyle = .capsule
        config.baseForegroundColor = ContinuityTheme.Color.ink
        let picker = UIButton(configuration: config)
        picker.showsMenuAsPrimaryAction = true
        picker.changesSelectionAsPrimaryAction = false
        picker.menu = UIMenu(children: others.map { person in
            UIAction(title: person.name, state: person.id == to ? .on : .off) { [weak self] _ in self?.retarget(person.id) }
        })
        stack.addArrangedSubview(UIStackView(arrangedSubviews: [picker, UIView()]))
        stack.setCustomSpacing(20, after: stack.arrangedSubviews.last!)

        stack.addArrangedSubview(MapUI.caption("\(items.count) \(items.count == 1 ? "item" : "items") move"))
        let tone = data.cluster(to)?.tone ?? .teal
        var rows: [UIView] = []
        for item in items {
            let row = MapUI.row(symbol: item.symbol, tint: tone.ink, title: item.title, detail: item.published ? "Published playbook" : (item.detail.isEmpty ? nil : item.detail), accessory: false) {}
            row.isUserInteractionEnabled = false
            stack.addArrangedSubview(row)
            rows.append(row)
        }
        if !hasAnimatedList, !UIAccessibility.isReduceMotionEnabled {
            hasAnimatedList = true
            for (i, row) in rows.enumerated() {
                row.alpha = 0
                row.transform = CGAffineTransform(translationX: -10, y: 0)
                UIView.animate(withDuration: 0.25, delay: 0.1 + Double(i) * 0.04, options: [.curveEaseOut, .allowUserInteraction]) {
                    row.alpha = 1
                    row.transform = .identity
                }
            }
        }

        let republish = items.filter(\.published).count
        if republish > 0 {
            let warning = UIStackView(arrangedSubviews: [MapUI.glowDot(), MapUI.body(MapUI.republishWarning(count: republish), color: UIColor(hex: 0x9A4B22), size: 14)])
            warning.spacing = 10
            warning.alignment = .center
            warning.isLayoutMarginsRelativeArrangement = true
            warning.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 12, leading: 14, bottom: 12, trailing: 14)
            warning.backgroundColor = UIColor(hex: 0xFCEBE1)
            warning.layer.cornerRadius = 16
            warning.layer.cornerCurve = .continuous
            stack.setCustomSpacing(16, after: stack.arrangedSubviews.last!)
            stack.addArrangedSubview(warning)
        }
        updateConfirm()
    }

    private func retarget(_ id: String) {
        guard !busy, id != to else { return }
        to = id
        UISelectionFeedbackGenerator(view: view).selectionChanged()
        onTargetChange?(id)
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        render()
    }

    private func updateConfirm() {
        guard var config = confirmButton?.configuration else { return }
        config.showsActivityIndicator = busy
        if let progress, busy {
            config.title = "Handing over \(min(progress.done + 1, progress.total)) of \(progress.total)…"
        } else {
            config.title = "Hand over to " + (data.person(to)?.firstName ?? data.name(of: to))
        }
        confirmButton.configuration = config
        confirmButton.isEnabled = !busy
        isModalInPresentation = busy
    }

    private func confirm() {
        guard !busy, let onConfirm else { return }
        busy = true
        progress = (0, items.count)
        updateConfirm()
        Task {
            let ok = await onConfirm(to)
            busy = false
            updateConfirm()
            if ok { dismiss(animated: true) }
        }
    }
}

/// A short horizontal thread (teal → iris → apricot) with an arrowhead, for "from → to".
final class ThreadLineView: UIView {
    private let gradient = CAGradientLayer()
    private let shape = CAShapeLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        gradient.colors = [ContinuityTheme.Color.teal, ContinuityTheme.Color.iris, ContinuityTheme.Color.apricot].map(\.cgColor)
        gradient.startPoint = CGPoint(x: 0, y: 0.5)
        gradient.endPoint = CGPoint(x: 1, y: 0.5)
        shape.fillColor = nil
        shape.strokeColor = UIColor.black.cgColor
        shape.lineWidth = 2
        shape.lineCap = .round
        shape.lineJoin = .round
        gradient.mask = shape
        layer.addSublayer(gradient)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func layoutSubviews() {
        super.layoutSubviews()
        gradient.frame = bounds
        shape.frame = bounds
        let path = UIBezierPath()
        let y = bounds.midY
        path.move(to: CGPoint(x: 2, y: y))
        path.addLine(to: CGPoint(x: bounds.maxX - 2, y: y))
        path.move(to: CGPoint(x: bounds.maxX - 8, y: y - 5))
        path.addLine(to: CGPoint(x: bounds.maxX - 2, y: y))
        path.addLine(to: CGPoint(x: bounds.maxX - 8, y: y + 5))
        shape.path = path.cgPath
    }
}
