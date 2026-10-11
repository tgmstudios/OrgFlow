import MetalKit
import UIKit

/// The Continuity Knot: the product's reusable, touchable, audio-reactive object.
/// One continuous thread tied into an endless knot. Transparent; place it directly on the canvas.
final class LivingThreadView: UIView {
    var mode: LivingThreadMode = .idle {
        didSet {
            renderer?.motion.mode = mode
            wake()
        }
    }

    /// 0 = full hero, 1 = condensed header band.
    var condensation: CGFloat = 0 {
        didSet {
            renderer?.motion.condensation = Double(condensation)
            wake()
        }
    }

    /// Pulled once per frame. Return `.silent` when no capture is active.
    var audioSource: (() -> AudioFeatureSnapshot)? {
        didSet { renderer?.audioSource = audioSource }
    }

    /// Press-and-hold the knot (push to talk).
    var onHoldBegan: (() -> Void)?
    var onHoldEnded: (() -> Void)?
    var onTap: (() -> Void)?

    /// When false the knot ignores touches (e.g. while condensed into the header).
    var isTouchEnabled = true {
        didSet { isUserInteractionEnabled = isTouchEnabled && renderer != nil }
    }

    private var metalView: MTKView?
    private var renderer: LivingThreadRenderer?
    private var fallback: CALayer?
    private var isSuspended = false
    private var isHolding = false
    private let pressFeedback = UIImpactFeedbackGenerator(style: .soft)

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        if setUpMetal() {
            setUpGestures()
        } else {
            setUpFallback()
            isUserInteractionEnabled = false
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func pulse() {
        renderer?.pulse()
        wake()
    }

    /// The page content behind this view, in this view's coordinate space, for refraction.
    func setBackdrop(_ image: CGImage?) {
        renderer?.setBackdrop(image)
    }

    func suspend() {
        isSuspended = true
        metalView?.isPaused = true
    }

    func resume() {
        isSuspended = false
        metalView?.isPaused = false
        wake()
    }

    private func wake() {
        guard let metalView, !isSuspended else { return }
        metalView.preferredFramesPerSecond = 60
    }

    // MARK: - Touch

    private func setUpGestures() {
        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        let hold = UILongPressGestureRecognizer(target: self, action: #selector(handleHold(_:)))
        hold.minimumPressDuration = 0.35
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        tap.require(toFail: hold)
        for recognizer in [pan, hold, tap] as [UIGestureRecognizer] {
            recognizer.cancelsTouchesInView = false
            recognizer.delegate = self
            addGestureRecognizer(recognizer)
        }
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesBegan(touches, with: event)
        renderer?.setPressed(true)
        pressFeedback.impactOccurred(intensity: 0.5)
        wake()
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesEnded(touches, with: event)
        if !isHolding { renderer?.setPressed(false) }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesCancelled(touches, with: event)
        if !isHolding { renderer?.setPressed(false) }
    }

    /// Converts points of drag into radians: a full-width swipe is roughly a half turn.
    private var dragScale: Double { .pi / max(Double(bounds.width), 1) }

    @objc private func handlePan(_ pan: UIPanGestureRecognizer) {
        guard let renderer else { return }
        switch pan.state {
        case .began:
            renderer.beginDrag()
            renderer.setPressed(false)
        case .changed:
            let t = pan.translation(in: self)
            renderer.drag(dx: Double(t.x), dy: Double(t.y), scale: dragScale)
            pan.setTranslation(.zero, in: self)
        case .ended, .cancelled, .failed:
            let v = pan.velocity(in: self)
            renderer.endDrag(velocityX: Double(v.x), velocityY: Double(v.y), scale: dragScale)
        default: break
        }
        wake()
    }

    @objc private func handleHold(_ hold: UILongPressGestureRecognizer) {
        switch hold.state {
        case .began:
            isHolding = true
            renderer?.setPressed(true)
            UIImpactFeedbackGenerator(style: .medium, view: self).impactOccurred()
            onHoldBegan?()
        case .ended, .cancelled, .failed:
            isHolding = false
            renderer?.setPressed(false)
            onHoldEnded?()
        default: break
        }
        wake()
    }

    @objc private func handleTap(_ tap: UITapGestureRecognizer) {
        renderer?.releaseLight()
        UIImpactFeedbackGenerator(style: .light, view: self).impactOccurred()
        onTap?()
        wake()
    }

    // MARK: - Setup

    private func setUpMetal() -> Bool {
        guard let device = MTLCreateSystemDefaultDevice() else { return false }
        let view = MTKView(frame: bounds, device: device)
        view.colorPixelFormat = .bgra8Unorm
        view.depthStencilPixelFormat = LivingThreadRenderer.depthFormat
        view.sampleCount = LivingThreadRenderer.sampleCount
        guard let renderer = LivingThreadRenderer(device: device, colorFormat: view.colorPixelFormat) else { return false }
        view.isOpaque = false
        view.backgroundColor = .clear
        view.layer.isOpaque = false
        view.clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
        view.clearDepth = 1
        view.framebufferOnly = true
        view.autoResizeDrawable = true
        view.preferredFramesPerSecond = 60
        view.isUserInteractionEnabled = false
        view.delegate = renderer
        renderer.onActivityChange = { [weak view] active in
            // Settled idle motion is slow enough to look identical at 30 fps.
            view?.preferredFramesPerSecond = active ? 60 : 30
        }
        addSubview(view)
        metalView = view
        self.renderer = renderer
        return true
    }

    /// Static ring drawn with Core Animation when Metal is unavailable.
    private func setUpFallback() {
        let ring = CAShapeLayer()
        ring.fillColor = nil
        ring.strokeColor = ContinuityTheme.Color.teal.withAlphaComponent(0.7).cgColor
        ring.lineWidth = 14
        ring.lineCap = .round
        layer.addSublayer(ring)
        fallback = ring
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        metalView?.frame = bounds
        if let ring = fallback as? CAShapeLayer {
            ring.frame = bounds
            let r = min(bounds.width, bounds.height) * 0.32
            ring.path = UIBezierPath(ovalIn: CGRect(x: bounds.midX - r, y: bounds.midY - r, width: 2 * r, height: 2 * r)).cgPath
        }
    }
}

extension LivingThreadView: UIGestureRecognizerDelegate {
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        false
    }

    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        // A hold that starts moving becomes a spin, not push-to-talk.
        if gestureRecognizer is UILongPressGestureRecognizer { return true }
        return super.gestureRecognizerShouldBegin(gestureRecognizer)
    }
}
