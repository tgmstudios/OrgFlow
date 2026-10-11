import UIKit

/// The interactive cluster view. Nodes are UIViews moved with spring animations; the curved links are
/// CAShapeLayers redrawn from the nodes' presentation layers every frame while anything moves, so the
/// threads stay attached through springs and drags.
///
/// Gestures: drag an item onto another cluster to reassign it; drag a person onto another person to
/// hand everything over; drag a cluster onto empty space to move it; tap to select.
final class KnowledgeMapCanvasView: UIView, UIGestureRecognizerDelegate {
    enum Selection: Equatable {
        case cluster(String)
        case item(String)
    }

    var onSelect: ((Selection?) -> Void)?
    /// An item was dropped on another cluster: (item key, cluster id).
    var onMoveItem: ((String, String) -> Void)?
    /// A cluster was dropped on a person: (from cluster id, to person id).
    var onHandover: ((String, String) -> Void)?
    /// The canvas grew or shrank to fit its content.
    var onContentSizeChange: (() -> Void)?

    var selection: Selection? { didSet { if selection != oldValue { updateStyles(animated: true) } } }
    /// While a handover is pending, everything else steps back.
    var handover: (from: String, to: String)? {
        didSet {
            updateStyles(animated: true)
            if hasIntroduced, !isGathering { relayout(animated: true, staggered: false) }
        }
    }
    /// Items with an API call in flight: their links flow and their icon spins.
    var saving: Set<String> = [] { didSet { if saving != oldValue { updateStyles(animated: false) } } }

    private(set) var data: KnowledgeMapData?
    private var pinned: [String: CGPoint] = [:]
    private var center0: CGPoint { CGPoint(x: bounds.midX, y: bounds.midY) }

    private let cloudLayerView = UIView()
    private let edgeView = UIView()
    private let trunkGradient = CAGradientLayer()
    private let trunkMask = CALayer()
    private var trunks: [String: CAShapeLayer] = [:]
    private var twigs: [String: CAShapeLayer] = [:]
    private let rootNode = MapRootNode()
    private var clusterNodes: [String: MapClusterNode] = [:]
    private var itemNodes: [String: MapItemNode] = [:]
    private var clouds: [String: MapCloudView] = [:]

    private var displayLink: CADisplayLink?
    private var linkUntil: CFTimeInterval = 0
    private(set) var hasIntroduced = false
    private(set) var isGathering = false

    private struct Drag {
        enum Kind { case item, cluster }
        let kind: Kind
        let key: String
        let offset: CGPoint
        var at: CGPoint
    }

    private var drag: Drag?
    private var hot: String?
    private var touchDown: (point: CGPoint, node: UIView)?
    private let pan = UIPanGestureRecognizer()
    private let tap = UITapGestureRecognizer()
    private var hoverFeedback: UISelectionFeedbackGenerator?

    private static var reduceMotion: Bool { UIAccessibility.isReduceMotionEnabled }

    /// The drag recognizer; the scroll view's pan waits for it to fail so empty space still scrolls.
    var dragGesture: UIGestureRecognizer { pan }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        cloudLayerView.isUserInteractionEnabled = false
        edgeView.isUserInteractionEnabled = false
        addSubview(cloudLayerView)
        addSubview(edgeView)

        trunkGradient.colors = [ContinuityTheme.Color.teal, ContinuityTheme.Color.iris, ContinuityTheme.Color.apricot].map(\.cgColor)
        trunkGradient.locations = [0, 0.55, 1]
        trunkGradient.startPoint = CGPoint(x: 0, y: 0.5)
        trunkGradient.endPoint = CGPoint(x: 1, y: 0.5)
        trunkGradient.mask = trunkMask
        trunkGradient.opacity = 0.85
        edgeView.layer.addSublayer(trunkGradient)

        rootNode.isUserInteractionEnabled = false
        addSubview(rootNode)

        pan.addTarget(self, action: #selector(handlePan(_:)))
        pan.delegate = self
        pan.maximumNumberOfTouches = 1
        addGestureRecognizer(pan)
        tap.addTarget(self, action: #selector(handleTap(_:)))
        tap.delegate = self
        addGestureRecognizer(tap)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func layoutSubviews() {
        super.layoutSubviews()
        cloudLayerView.frame = bounds
        edgeView.frame = bounds
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        trunkGradient.frame = bounds
        trunkMask.frame = bounds
        CATransaction.commit()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil {
            displayLink?.invalidate()
            displayLink = nil
        } else {
            startThreadShimmer()
        }
    }

    // MARK: - Data

    /// Applies new data. Before `introduce()`, nodes wait collapsed at the center.
    func apply(_ data: KnowledgeMapData, animated: Bool) {
        self.data = data
        let collapsed = !hasIntroduced
        rootNode.configure(items: data.items.count, people: data.people.count)
        var created: Set<String> = []

        // Clusters and clouds
        let clusterIDs = Set(data.clusters.map(\.id))
        for (id, node) in clusterNodes where !clusterIDs.contains(id) {
            clusterNodes[id] = nil
            retire(node)
            if let cloud = clouds.removeValue(forKey: id) { retire(cloud) }
            trunks.removeValue(forKey: id)?.removeFromSuperlayer()
        }
        for cluster in data.clusters {
            let count = data.members(of: cluster.id).count
            let node = clusterNodes[cluster.id] ?? {
                let node = MapClusterNode()
                insertSubview(node, aboveSubview: rootNode)
                node.transform = CGAffineTransform(scaleX: 0.4, y: 0.4)
                node.alpha = 0
                clusterNodes[cluster.id] = node
                let cloud = MapCloudView()
                cloud.alpha = 0
                cloudLayerView.addSubview(cloud)
                clouds[cluster.id] = cloud
                let trunk = Self.edgeLayer(width: 2.2)
                trunk.strokeColor = UIColor.black.cgColor
                trunkMask.addSublayer(trunk)
                trunks[cluster.id] = trunk
                created.insert(cluster.id)
                return node
            }()
            node.configure(cluster, count: count)
            clouds[cluster.id]?.setTone(cluster.tone)
        }

        // Items
        let itemKeys = Set(data.items.map(\.key))
        for (key, node) in itemNodes where !itemKeys.contains(key) {
            itemNodes[key] = nil
            retire(node)
            twigs.removeValue(forKey: key)?.removeFromSuperlayer()
        }
        for item in data.items {
            let tone = data.cluster(item.ownerID)?.tone ?? .muted
            let node = itemNodes[item.key] ?? {
                let node = MapItemNode()
                addSubview(node)
                node.transform = CGAffineTransform(scaleX: 0.3, y: 0.3)
                node.alpha = 0
                itemNodes[item.key] = node
                let twig = Self.edgeLayer(width: 1.4)
                edgeView.layer.addSublayer(twig)
                twigs[item.key] = twig
                created.insert(item.key)
                return node
            }()
            node.configure(item, tone: tone)
            twigs[item.key]?.strokeColor = tone.color.withAlphaComponent(tone == .muted ? 0.45 : 0.62).cgColor
        }

        // Size the canvas to the content, then spawn new nodes: at the center before the intro,
        // otherwise where they belong (items from their person).
        resizeIfNeeded()
        rootNode.center = center0
        let positions = currentPositions()
        for key in created {
            if let node = clusterNodes[key] {
                node.center = collapsed ? center0 : (positions[key] ?? center0)
                clouds[key]?.center = node.center
            } else if let node = itemNodes[key], let item = data.item(key) {
                node.center = collapsed ? center0 : (clusterNodes[item.ownerID].flatMap { created.contains(item.ownerID) ? nil : $0.center } ?? positions[item.ownerID] ?? center0)
            }
        }
        updateStyles(animated: false)
        if collapsed {
            updateEdges()
        } else {
            relayout(animated: animated, staggered: false)
        }
    }

    private func nodeSizes() -> [String: CGSize] {
        var sizes: [String: CGSize] = [KnowledgeMapLayout.rootKey: rootNode.bounds.size]
        for (id, node) in clusterNodes { sizes[id] = node.bounds.size }
        for (key, node) in itemNodes { sizes[key] = node.bounds.size }
        return sizes
    }

    /// The opening flourish: everything springs out of the organization, one after another.
    func introduce() {
        guard !hasIntroduced, data != nil else { return }
        hasIntroduced = true
        if !Self.reduceMotion { animateTrunksIn() }
        relayout(animated: true, staggered: true)
    }

    /// "Re-form": everything collapses into the center, then springs back out to its natural place.
    func reform() {
        guard hasIntroduced, !isGathering, drag == nil else { return }
        if Self.reduceMotion {
            pinned = [:]
            relayout(animated: false, staggered: false)
            return
        }
        isGathering = true
        let center = center0
        UIView.animate(springDuration: 0.38, bounce: 0, options: [.beginFromCurrentState]) {
            for node in self.clusterNodes.values {
                node.center = center
                node.transform = CGAffineTransform(scaleX: 0.4, y: 0.4)
                node.alpha = 0
            }
            for node in self.itemNodes.values {
                node.center = center
                node.transform = CGAffineTransform(scaleX: 0.3, y: 0.3)
                node.alpha = 0
            }
            for cloud in self.clouds.values {
                cloud.center = center
                cloud.transform = CGAffineTransform(scaleX: 0.2, y: 0.2)
                cloud.alpha = 0
            }
            self.rootNode.transform = CGAffineTransform(scaleX: 1.12, y: 1.12)
        } completion: { _ in
            self.pinned = [:]
            self.isGathering = false
            UIImpactFeedbackGenerator(style: .soft, view: self).impactOccurred()
            UIView.animate(springDuration: 0.6, bounce: 0.45) { self.rootNode.transform = .identity }
            self.animateTrunksIn()
            self.relayout(animated: true, staggered: true)
        }
        runLink(for: 0.5)
    }

    /// A node's frame in canvas coordinates (for scrolling it into view).
    func frameOfNode(_ selection: Selection) -> CGRect? {
        switch selection {
        case .cluster(let id): clusterNodes[id]?.frame
        case .item(let key): itemNodes[key]?.frame
        }
    }

    // MARK: - Layout

    private func currentPositions() -> [String: CGPoint] {
        guard let data else { return [:] }
        var pins = pinned
        if let drag, drag.kind == .cluster { pins[drag.key] = drag.at }
        return KnowledgeMapLayout.positions(for: data, center: center0, pinned: pins, bounds: bounds, sizes: nodeSizes())
    }

    /// Fits the canvas around the natural (unpinned) layout, with room for the largest nodes.
    private func resizeIfNeeded() {
        guard let data else { return }
        let sizes = nodeSizes()
        let natural = KnowledgeMapLayout.positions(for: data, center: .zero, pinned: [:], bounds: nil, sizes: sizes)
        var box = CGRect(x: -110, y: -40, width: 220, height: 80)
        for (key, p) in natural {
            let size = sizes[key] ?? CGSize(width: 200, height: 50)
            box = box.union(CGRect(x: p.x - size.width / 2, y: p.y - size.height / 2, width: size.width, height: size.height))
        }
        // Symmetric around the organization so it stays in the middle.
        let halfWidth = max(abs(box.minX), abs(box.maxX)) + 16
        let halfHeight = max(abs(box.minY), abs(box.maxY)) + 16
        let size = CGSize(width: ceil(max(halfWidth * 2, 360)), height: ceil(max(halfHeight * 2, 520)))
        guard abs(size.width - bounds.width) > 30 || abs(size.height - bounds.height) > 30 else { return }
        let shift = CGPoint(x: size.width / 2 - bounds.midX, y: size.height / 2 - bounds.midY)
        bounds = CGRect(origin: .zero, size: size)
        center = CGPoint(x: size.width * transform.a / 2, y: size.height * transform.d / 2)
        layoutIfNeeded()
        for view in Array(clusterNodes.values) as [UIView] + Array(itemNodes.values) + Array(clouds.values) {
            view.center = CGPoint(x: view.center.x + shift.x, y: view.center.y + shift.y)
        }
        pinned = pinned.mapValues { CGPoint(x: $0.x + shift.x, y: $0.y + shift.y) }
        onContentSizeChange?()
    }

    private func relayout(animated: Bool, staggered: Bool) {
        guard let data else { return }
        let positions = currentPositions()
        let following = followingKeys()
        var index = 0
        func place(_ view: UIView, at point: CGPoint, alpha: CGFloat, transform: CGAffineTransform = .identity, extra: (() -> Void)? = nil) {
            let delay = staggered ? min(Double(index) * 0.035, 0.5) : 0
            index += 1
            let changes = {
                view.center = point
                view.transform = transform
                view.alpha = alpha
                extra?()
            }
            if animated, !Self.reduceMotion {
                UIView.animate(springDuration: 0.7, bounce: 0.22, initialSpringVelocity: 0, delay: delay, options: [.allowUserInteraction, .beginFromCurrentState], animations: changes)
            } else {
                changes()
            }
        }
        for cluster in data.clusters {
            guard let node = clusterNodes[cluster.id], let point = positions[cluster.id] else { continue }
            let count = data.members(of: cluster.id).count
            if !following.contains(cluster.id) {
                place(node, at: point, alpha: dimmedAlpha(cluster: cluster.id))
            }
            if let cloud = clouds[cluster.id] {
                let r = KnowledgeMapLayout.fanRadius(count: count)
                let size = CGSize(width: r * 1.2 + 230, height: r * 2 + 100)
                index -= 1
                place(cloud, at: point, alpha: count == 0 ? 0 : (handover.map { [$0.from, $0.to].contains(cluster.id) } ?? true ? 1 : 0.3)) {
                    cloud.bounds = CGRect(origin: .zero, size: size)
                }
            }
        }
        for item in data.items {
            guard let node = itemNodes[item.key], let point = positions[item.key], !following.contains(item.key) else { continue }
            place(node, at: point, alpha: dimmedAlpha(cluster: item.ownerID))
        }
        runLink(for: animated && !Self.reduceMotion ? (staggered ? 1.4 : 0.9) : 0.05)
        if !animated || Self.reduceMotion { updateEdges() }
    }

    private func dimmedAlpha(cluster: String) -> CGFloat {
        guard let handover else { return 1 }
        return [handover.from, handover.to].contains(cluster) ? 1 : 0.28
    }

    /// Nodes that track the finger rather than springing.
    private func followingKeys() -> Set<String> {
        guard let drag else { return [] }
        return [drag.key]
    }

    private func retire(_ view: UIView) {
        UIView.animate(withDuration: Self.reduceMotion ? 0 : 0.25, animations: {
            view.alpha = 0
            view.transform = CGAffineTransform(scaleX: 0.5, y: 0.5)
        }, completion: { _ in view.removeFromSuperview() })
    }

    // MARK: - Links

    private static func edgeLayer(width: CGFloat) -> CAShapeLayer {
        let layer = CAShapeLayer()
        layer.fillColor = nil
        layer.lineWidth = width
        layer.lineCap = .round
        layer.actions = ["path": NSNull(), "strokeColor": NSNull(), "opacity": NSNull()]
        return layer
    }

    private static func live(_ view: UIView) -> CGPoint {
        view.layer.presentation()?.position ?? view.center
    }

    private func updateEdges() {
        guard let data else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let root = rootNode.center
        for cluster in data.clusters {
            guard let node = clusterNodes[cluster.id], let trunk = trunks[cluster.id] else { continue }
            trunk.path = KnowledgeMapLayout.curve(from: root, to: Self.live(node), bend: 0.12).cgPath
            let visible = node.layer.presentation()?.opacity ?? Float(node.alpha)
            trunk.opacity = dimmedAlpha(cluster: cluster.id) < 1 ? min(visible, 0.25) : visible
        }
        for item in data.items {
            guard let node = itemNodes[item.key], let twig = twigs[item.key], let owner = clusterNodes[item.ownerID] else { continue }
            twig.path = KnowledgeMapLayout.curve(from: Self.live(owner), to: Self.live(node), bend: 0.1).cgPath
            let visible = node.layer.presentation()?.opacity ?? Float(node.alpha)
            twig.opacity = dimmedAlpha(cluster: item.ownerID) < 1 ? min(visible, 0.25) : visible
        }
        CATransaction.commit()
    }

    private func animateTrunksIn() {
        for (index, trunk) in trunks.values.enumerated() {
            let grow = CABasicAnimation(keyPath: "strokeEnd")
            grow.fromValue = 0
            grow.toValue = 1
            grow.duration = 0.7
            grow.beginTime = CACurrentMediaTime() + Double(index) * 0.035
            grow.fillMode = .backwards
            grow.timingFunction = CAMediaTimingFunction(name: .easeOut)
            trunk.add(grow, forKey: "grow")
        }
    }

    /// The thread's colors drift slowly along the links.
    private func startThreadShimmer() {
        trunkGradient.removeAnimation(forKey: "shimmer")
        guard !Self.reduceMotion else { return }
        let shimmer = CABasicAnimation(keyPath: "locations")
        shimmer.fromValue = [0, 0.55, 1]
        shimmer.toValue = [0, 0.25, 0.7]
        shimmer.duration = 5
        shimmer.autoreverses = true
        shimmer.repeatCount = .infinity
        shimmer.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        trunkGradient.add(shimmer, forKey: "shimmer")
    }

    private func runLink(for duration: TimeInterval) {
        linkUntil = max(linkUntil, CACurrentMediaTime() + duration)
        guard displayLink == nil, window != nil else {
            if window == nil { updateEdges() }
            return
        }
        let link = CADisplayLink(target: DisplayLinkProxy(self), selector: #selector(DisplayLinkProxy.tick))
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    fileprivate func tick() {
        updateEdges()
        if drag == nil, CACurrentMediaTime() > linkUntil {
            displayLink?.invalidate()
            displayLink = nil
            updateEdges()
        }
    }

    // MARK: - Styles

    private func updateStyles(animated: Bool) {
        guard let data else { return }
        let traveling = saving.union(handover.map { h in Set(data.members(of: h.from).map(\.key)) } ?? [])
        for cluster in data.clusters {
            guard let node = clusterNodes[cluster.id] else { continue }
            let isHot = hot == cluster.id || handover?.to == cluster.id
            let isSelected = selection == .cluster(cluster.id)
            let isDragged = drag?.key == cluster.id
            let isLeaving = handover?.from == cluster.id
            let outline: UIColor? = isHot ? cluster.tone.color : isLeaving ? ContinuityTheme.Color.apricot : isSelected ? cluster.tone.color : nil
            node.applyState(
                emphasis: isHot ? 1.1 : isDragged ? 1.06 : 1,
                outline: outline,
                glow: isHot ? cluster.tone.color : nil,
                animated: animated
            )
        }
        for item in data.items {
            guard let node = itemNodes[item.key] else { continue }
            let tone = data.cluster(item.ownerID)?.tone ?? .muted
            let lifted = drag?.key == item.key
            node.applyState(
                emphasis: lifted ? 1.12 : 1,
                outline: selection == .item(item.key) ? tone.color : nil,
                glow: nil,
                rotation: lifted ? -0.035 : 0,
                animated: animated
            )
            node.isSaving = saving.contains(item.key)
            if let twig = twigs[item.key] { setFlowing(twig, traveling.contains(item.key)) }
        }
        updateEdges()
    }

    private func setFlowing(_ layer: CAShapeLayer, _ flowing: Bool) {
        guard flowing != (layer.lineDashPattern != nil) else { return }
        if flowing {
            layer.lineDashPattern = [5, 6]
            layer.lineWidth = 2
            if !Self.reduceMotion {
                let flow = CABasicAnimation(keyPath: "lineDashPhase")
                flow.fromValue = 0
                flow.toValue = -22
                flow.duration = 0.6
                flow.repeatCount = .infinity
                layer.add(flow, forKey: "flow")
            }
        } else {
            layer.removeAnimation(forKey: "flow")
            layer.lineDashPattern = nil
            layer.lineWidth = 1.4
        }
    }

    // MARK: - Gestures

    private func node(at point: CGPoint) -> UIView? {
        let candidates: [UIView] = subviews.reversed().filter { $0 is MapItemNode || $0 is MapClusterNode }
        return candidates.first { $0.alpha > 0.05 && $0.frame.insetBy(dx: -6, dy: -6).contains(point) }
    }

    private func key(of node: UIView) -> (Drag.Kind, String)? {
        if let item = itemNodes.first(where: { $0.value === node }) { return (.item, item.key) }
        if let cluster = clusterNodes.first(where: { $0.value === node }) { return (.cluster, cluster.key) }
        return nil
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        if gestureRecognizer === pan {
            let point = touch.location(in: self)
            touchDown = node(at: point).map { (point, $0) }
        }
        return true
    }

    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === pan else { return super.gestureRecognizerShouldBegin(gestureRecognizer) }
        return touchDown != nil && saving.isEmpty && !isGathering && hasIntroduced && handover == nil
    }

    @objc private func handleTap(_ recognizer: UITapGestureRecognizer) {
        guard hasIntroduced, !isGathering else { return }
        let point = recognizer.location(in: self)
        guard let node = node(at: point), case let (kind, key)? = key(of: node) else {
            onSelect?(nil)
            return
        }
        UISelectionFeedbackGenerator(view: self).selectionChanged()
        onSelect?(kind == .item ? .item(key) : .cluster(key))
    }

    @objc private func handlePan(_ recognizer: UIPanGestureRecognizer) {
        let point = recognizer.location(in: self)
        switch recognizer.state {
        case .began:
            guard case let (start, node)? = touchDown, case let (kind, key)? = key(of: node) else { return }
            drag = Drag(kind: kind, key: key, offset: CGPoint(x: start.x - node.center.x, y: start.y - node.center.y), at: node.center)
            bringSubviewToFront(node)
            UIImpactFeedbackGenerator(style: .medium, view: self).impactOccurred(intensity: 0.8)
            hoverFeedback = UISelectionFeedbackGenerator(view: self)
            updateStyles(animated: true)
            runLink(for: 0)
            dragMoved(to: point)
        case .changed:
            dragMoved(to: point)
        case .ended:
            dragEnded()
        default:
            cancelDrag()
        }
    }

    private func dragMoved(to point: CGPoint) {
        guard var drag, let data else { return }
        let size = (drag.kind == .item ? itemNodes[drag.key]?.bounds.size : clusterNodes[drag.key]?.bounds.size) ?? .zero
        let at = KnowledgeMapLayout.clamp(CGPoint(x: point.x - drag.offset.x, y: point.y - drag.offset.y), to: bounds, size: size)
        drag.at = at
        self.drag = drag
        switch drag.kind {
        case .item:
            itemNodes[drag.key]?.center = at
        case .cluster:
            clusterNodes[drag.key]?.center = at
            let positions = currentPositions()
            let follow = {
                self.clouds[drag.key]?.center = at
                for item in data.members(of: drag.key) {
                    if let p = positions[item.key] { self.itemNodes[item.key]?.center = p }
                }
            }
            if Self.reduceMotion {
                follow()
            } else {
                // Items trail the person on a soft spring.
                UIView.animate(springDuration: 0.45, bounce: 0.2, options: [.beginFromCurrentState, .allowUserInteraction], animations: follow)
            }
        }
        let own = drag.kind == .item ? data.item(drag.key)?.ownerID : drag.key
        var target = nearestCluster(to: at, except: own)
        // Only a person can receive a whole cluster.
        if drag.kind == .cluster, target == KnowledgeMapData.unassigned { target = nil }
        if target != hot {
            hot = target
            if target != nil { hoverFeedback?.selectionChanged() }
            updateStyles(animated: true)
        }
    }

    private func nearestCluster(to point: CGPoint, except: String?) -> String? {
        var best: String?
        var distance: CGFloat = 96
        for (id, node) in clusterNodes where id != except && data?.cluster(id) != nil {
            let d = hypot(node.center.x - point.x, node.center.y - point.y)
            if d < distance {
                best = id
                distance = d
            }
        }
        return best
    }

    private func dragEnded() {
        guard let drag, let data else { return }
        let target = hot
        self.drag = nil
        hot = nil
        hoverFeedback = nil
        switch drag.kind {
        case .item:
            if let target {
                UIImpactFeedbackGenerator(style: .rigid, view: self).impactOccurred()
                updateStyles(animated: true)
                onMoveItem?(drag.key, target)
                relayout(animated: true, staggered: false)
                return
            }
        case .cluster:
            for item in data.members(of: drag.key) {
                if let node = itemNodes[item.key] { bringSubviewToFront(node) }
            }
            if let target {
                UIImpactFeedbackGenerator(style: .rigid, view: self).impactOccurred()
                if !data.members(of: drag.key).isEmpty { onHandover?(drag.key, target) }
            } else {
                pinned[drag.key] = drag.at
            }
        }
        updateStyles(animated: true)
        relayout(animated: true, staggered: false)
    }

    private func cancelDrag() {
        guard drag != nil else { return }
        drag = nil
        hot = nil
        hoverFeedback = nil
        updateStyles(animated: true)
        relayout(animated: true, staggered: false)
    }
}

/// Breaks the CADisplayLink → target retain cycle.
private final class DisplayLinkProxy: NSObject {
    weak var canvas: KnowledgeMapCanvasView?
    init(_ canvas: KnowledgeMapCanvasView) { self.canvas = canvas }
    @objc func tick() { canvas?.tick() }
}
