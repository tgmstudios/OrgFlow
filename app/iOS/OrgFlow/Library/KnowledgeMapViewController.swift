import UIKit

/// Knowledge map: who owns what, as clusters around the organization. A port of the web's
/// interactive cluster view (`frontend/cluster-view.tsx`). Every change goes through the API.
final class KnowledgeMapViewController: UIViewController, UIScrollViewDelegate, UIAdaptivePresentationControllerDelegate {
    var onWorkspaceChanged: ((Workspace) -> Void)?
    var onStartInterview: ((InterviewPlan) -> Void)?
    var onSignInRequested: (() -> Void)?

    private var workspace: Workspace?
    private var data: KnowledgeMapData?
    /// A person to highlight once the map has formed.
    private var focusPersonID: String?

    private let scrollView = UIScrollView()
    private let canvas = KnowledgeMapCanvasView()
    private let bannerStack = UIStackView()
    /// Fades the map out behind the departure banners so scrolled content doesn't peek between
    /// the navigation bar and the banners.
    private let topScrim = CAGradientLayer()
    private let legend = UILabel()
    private let legendBackground = UIVisualEffectView(effect: ContinuityTheme.glassEffect(interactive: false))
    private let toast = MapToastView()
    private var fitScale: CGFloat = 1
    private var hasFitted = false
    private var isBusy = false
    private var hasAppeared = false
    private weak var inspector: MapInspectorViewController?
    private weak var handoverSheet: HandoverViewController?

    init(workspace: Workspace?, focusPersonID: String? = nil) {
        self.workspace = workspace
        self.focusPersonID = focusPersonID
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = ContinuityTheme.Color.canvas
        navigationItem.title = "Knowledge map"
        navigationItem.largeTitleDisplayMode = .never
        if let nav = navigationController, nav.viewControllers.first === self, nav.presentingViewController != nil {
            navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .close, primaryAction: UIAction { [weak self] _ in
                self?.dismiss(animated: true)
            })
        }
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Re-form", image: UIImage(systemName: "sparkles"), primaryAction: UIAction { [weak self] _ in
            self?.reform()
        })

        scrollView.delegate = self
        scrollView.contentInsetAdjustmentBehavior = .never
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.showsVerticalScrollIndicator = false
        scrollView.delaysContentTouches = false
        scrollView.decelerationRate = .normal
        scrollView.maximumZoomScale = 2.2
        scrollView.frame = view.bounds
        scrollView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(scrollView)
        scrollView.addSubview(canvas)
        scrollView.panGestureRecognizer.require(toFail: canvas.dragGesture)
        let doubleTap = UITapGestureRecognizer(target: self, action: #selector(toggleZoom(_:)))
        doubleTap.numberOfTapsRequired = 2
        scrollView.addGestureRecognizer(doubleTap)

        canvas.onContentSizeChange = { [weak self] in self?.contentSizeChanged() }
        canvas.onSelect = { [weak self] selection in self?.select(selection) }
        canvas.onMoveItem = { [weak self] key, cluster in
            guard let self else { return }
            Task { await self.assign([key], to: cluster, optimistic: true) }
        }
        canvas.onHandover = { [weak self] from, to in self?.beginHandover(from: from, to: to) }

        topScrim.colors = [ContinuityTheme.Color.canvas, ContinuityTheme.Color.canvas, ContinuityTheme.Color.canvas.withAlphaComponent(0)].map(\.cgColor)
        topScrim.locations = [0, 0.8, 1]
        view.layer.addSublayer(topScrim)
        bannerStack.axis = .vertical
        bannerStack.spacing = 8
        bannerStack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bannerStack)

        legend.numberOfLines = 2
        legend.textAlignment = .center
        legend.font = ContinuityTheme.Font.text(12)
        legend.textColor = ContinuityTheme.Color.secondaryInk
        legend.translatesAutoresizingMaskIntoConstraints = false
        legendBackground.layer.cornerRadius = 18
        legendBackground.layer.cornerCurve = .continuous
        legendBackground.clipsToBounds = true
        legendBackground.isUserInteractionEnabled = false
        legendBackground.translatesAutoresizingMaskIntoConstraints = false
        legendBackground.contentView.addSubview(legend)
        view.addSubview(legendBackground)

        toast.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(toast)

        let gutter = ContinuityTheme.Metrics.gutter
        NSLayoutConstraint.activate([
            bannerStack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            bannerStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            bannerStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            legend.topAnchor.constraint(equalTo: legendBackground.contentView.topAnchor, constant: 7),
            legend.bottomAnchor.constraint(equalTo: legendBackground.contentView.bottomAnchor, constant: -7),
            legend.leadingAnchor.constraint(equalTo: legendBackground.contentView.leadingAnchor, constant: 14),
            legend.trailingAnchor.constraint(equalTo: legendBackground.contentView.trailingAnchor, constant: -14),
            legendBackground.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            legendBackground.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: gutter - 8),
            legendBackground.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -4),
            toast.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            toast.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 16),
            toast.bottomAnchor.constraint(equalTo: legendBackground.topAnchor, constant: -10),
        ])

        if let workspace {
            show(workspace)
        } else {
            contentUnavailableConfiguration = UIContentUnavailableConfiguration.loading()
            Task { await refresh() }
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // A tab: refresh when it comes back, since other screens change owners and people.
        if hasAppeared, workspace != nil, !isBusy { Task { await refresh() } }
        hasAppeared = true
        introduceIfReady()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        topScrim.frame = bannerStack.arrangedSubviews.isEmpty ? .zero : CGRect(x: 0, y: 0, width: view.bounds.width, height: bannerStack.frame.maxY + 18)
        CATransaction.commit()
        updateZoomLimits()
        centerContent()
    }

    // MARK: Data

    private func show(_ workspace: Workspace) {
        self.workspace = workspace
        let data = KnowledgeMapData(workspace: workspace)
        self.data = data
        contentUnavailableConfiguration = nil
        canvas.apply(data, animated: true)
        updateChrome()
        if let inspector, presentedViewController === inspector {
            if exists(inspector.selection) {
                inspector.update(data: data, selection: inspector.selection, busy: isBusy)
            } else {
                select(nil)
            }
        } else if let selection = canvas.selection, !exists(selection) {
            canvas.selection = nil
        }
        introduceIfReady()
    }

    private func exists(_ selection: KnowledgeMapCanvasView.Selection) -> Bool {
        switch selection {
        case .cluster(let id): data?.cluster(id) != nil
        case .item(let key): data?.item(key) != nil
        }
    }

    private func introduceIfReady() {
        guard hasAppeared, data != nil, !canvas.hasIntroduced else { return }
        updateZoomLimits()
        centerContent()
        canvas.introduce()
        if let focus = focusPersonID, data?.cluster(focus) != nil {
            focusPersonID = nil
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { [weak self] in
                self?.canvas.selection = .cluster(focus)
            }
        }
    }

    func refresh() async {
        do {
            let workspace = try await OrgFlowAPI.shared.workspace()
            show(workspace)
            onWorkspaceChanged?(workspace)
        } catch let error as OrgFlowAPIError where error == .signInRequired {
            var config = UIContentUnavailableConfiguration.empty()
            config.image = UIImage(systemName: "person.crop.circle")
            config.text = "Sign in to see your knowledge map"
            config.textProperties.font = ContinuityTheme.Font.display(22, weight: .semibold)
            config.button = .prominentGlass()
            config.button.baseBackgroundColor = ContinuityTheme.Color.teal
            config.button.title = "Sign in"
            config.buttonProperties.primaryAction = UIAction { [weak self] _ in self?.onSignInRequested?() }
            contentUnavailableConfiguration = config
        } catch {
            if workspace == nil {
                var config = UIContentUnavailableConfiguration.empty()
                config.image = UIImage(systemName: "exclamationmark.triangle")
                config.text = "Couldn't load the map"
                config.secondaryText = error.localizedDescription
                config.button = .glass()
                config.button.title = "Retry"
                config.buttonProperties.primaryAction = UIAction { [weak self] _ in
                    self?.contentUnavailableConfiguration = UIContentUnavailableConfiguration.loading()
                    Task { await self?.refresh() }
                }
                contentUnavailableConfiguration = config
            } else {
                toast.show(ok: false, text: error.localizedDescription)
            }
        }
    }

    /// Reassigns items through the API. A single dragged item moves at once (optimistic); a handover
    /// moves items one by one as each save lands, so they visibly travel to the receiving person.
    @discardableResult
    private func assign(_ keys: [String], to target: String, optimistic: Bool, progress: ((Int, Int) -> Void)? = nil) async -> Bool {
        guard var data, !isBusy else { return false }
        let moving = keys.compactMap { data.item($0) }.filter { $0.ownerID != target }
        guard !moving.isEmpty else { return true }
        isBusy = true
        defer { isBusy = false }
        if optimistic {
            for item in moving { data.setOwner(item.key, to: target) }
            self.data = data
            canvas.apply(data, animated: true)
        }
        canvas.saving = Set(moving.map(\.key))
        let ownerID = target == KnowledgeMapData.unassigned ? nil : target
        var done = 0
        do {
            for item in moving {
                progress?(done, moving.count)
                switch item.kind {
                case .article:
                    let article = try await OrgFlowAPI.shared.setArticleOwner(id: item.id, ownerID: ownerID)
                    data.setOwner(item.key, to: target, published: article.status == "published")
                    if let index = workspace?.articles.firstIndex(where: { $0.id == article.id }) { workspace?.articles[index] = article }
                case .source:
                    _ = try await OrgFlowAPI.shared.setSourceOwner(id: item.id, ownerID: ownerID)
                    data.setOwner(item.key, to: target)
                }
                done += 1
                canvas.saving.remove(item.key)
                self.data = data
                canvas.apply(data, animated: true)
                if !optimistic { UIImpactFeedbackGenerator(style: .light, view: view).impactOccurred(intensity: 0.6) }
            }
            UINotificationFeedbackGenerator(view: view).notificationOccurred(.success)
            let name = data.name(of: target)
            toast.show(ok: true, text: moving.count == 1 ? "Moved \u{201C}\(moving[0].title)\u{201D} to \(name)." : "Handed \(moving.count) items to \(name).")
            canvas.saving = []
            isBusy = false
            await refresh()
            return true
        } catch {
            UINotificationFeedbackGenerator(view: view).notificationOccurred(.error)
            canvas.saving = []
            toast.show(ok: false, text: error.localizedDescription)
            isBusy = false
            await refresh()
            return false
        }
    }

    // MARK: Chrome

    private func updateChrome() {
        guard let data else { return }
        let articles = data.items.filter { $0.kind == .article }.count
        let sources = data.items.count - articles
        let unowned = data.members(of: KnowledgeMapData.unassigned).count
        navigationItem.subtitle = "\(articles) \(articles == 1 ? "playbook" : "playbooks") · \(sources) \(sources == 1 ? "source" : "sources") · \(unowned) unowned"
        legend.text = data.items.isEmpty
            ? "Add a playbook or index a source to start the map."
            : "Drag an item onto a person to reassign it · drop a person on another to hand everything over"

        bannerStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for (cluster, count) in data.departing {
            guard let person = cluster.person else { continue }
            let successor = data.person(person.successorId)
            let banner = DepartureBanner(person: person, count: count, successor: successor)
            banner.onHandover = { [weak self] in
                guard let successor else { return }
                self?.beginHandover(from: cluster.id, to: successor.id)
            }
            banner.onChooseSuccessor = { [weak self] in self?.openPerson(person.id) }
            bannerStack.addArrangedSubview(banner)
        }
        view.layoutIfNeeded()
        centerContent()
    }

    private func reform() {
        UIImpactFeedbackGenerator(style: .light, view: view).impactOccurred()
        select(nil)
        canvas.reform()
        if abs(scrollView.zoomScale - fitScale) > 0.01 {
            scrollView.setZoomScale(fitScale, animated: true)
        } else {
            centerContent(settle: true)
        }
    }

    // MARK: Zoom and centering

    /// The part of the screen the map can use: below the banners, above the legend and (when
    /// `includingSheet`) above a presented sheet.
    private func visibleRect(includingSheet: Bool = true) -> CGRect {
        let top = max(view.safeAreaInsets.top, bannerStack.frame.maxY) + 10
        var bottom = min(view.bounds.height - view.safeAreaInsets.bottom - 44, legendBackground.frame.minY - 8)
        if includingSheet, let sheet = presentedViewController, !sheet.isBeingDismissed, sheet.view.window != nil {
            bottom = min(bottom, sheet.view.convert(sheet.view.bounds, to: view).minY - 8)
        }
        return CGRect(x: 8, y: top, width: view.bounds.width - 16, height: max(120, bottom - top))
    }

    private func updateZoomLimits() {
        guard canvas.bounds.width > 0 else { return }
        let rect = visibleRect(includingSheet: false)
        let fit = min(1, rect.width / canvas.bounds.width, rect.height / canvas.bounds.height)
        let wasFitted = !hasFitted || abs(scrollView.zoomScale - fitScale) < 0.01
        fitScale = fit
        scrollView.minimumZoomScale = min(fit, 1)
        if wasFitted {
            scrollView.zoomScale = fit
            hasFitted = true
        }
    }

    private func contentSizeChanged() {
        scrollView.contentSize = canvas.frame.size
        updateZoomLimits()
        centerContent()
    }

    private func centerContent(settle: Bool = false) {
        let rect = visibleRect()
        let size = canvas.frame.size
        let horizontal = max(0, (rect.width - size.width) / 2)
        let vertical = max(0, (rect.height - size.height) / 2)
        scrollView.contentInset = UIEdgeInsets(
            top: rect.minY + vertical,
            left: rect.minX + horizontal,
            bottom: view.bounds.height - rect.maxY + vertical,
            right: view.bounds.width - rect.maxX + horizontal
        )
        scrollView.contentSize = size
        guard !scrollView.isZooming, !scrollView.isZoomBouncing, !scrollView.isDragging, !scrollView.isDecelerating else { return }
        let offset = clampedOffset(scrollView.contentOffset)
        if offset != scrollView.contentOffset {
            scrollView.setContentOffset(offset, animated: settle && !UIAccessibility.isReduceMotionEnabled)
        }
    }

    private func clampedOffset(_ offset: CGPoint) -> CGPoint {
        let inset = scrollView.contentInset
        let size = scrollView.contentSize
        let minX = -inset.left, maxX = max(minX, size.width - scrollView.bounds.width + inset.right)
        let minY = -inset.top, maxY = max(minY, size.height - scrollView.bounds.height + inset.bottom)
        return CGPoint(x: min(maxX, max(minX, offset.x)), y: min(maxY, max(minY, offset.y)))
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { canvas }

    func scrollViewDidZoom(_ scrollView: UIScrollView) { centerContent() }

    @objc private func toggleZoom(_ recognizer: UITapGestureRecognizer) {
        if scrollView.zoomScale > fitScale * 1.15 {
            scrollView.setZoomScale(fitScale, animated: true)
        } else {
            let point = recognizer.location(in: canvas)
            let scale = min(scrollView.maximumZoomScale, max(1, fitScale * 1.9))
            let size = CGSize(width: scrollView.bounds.width / scale, height: scrollView.bounds.height / scale)
            scrollView.zoom(to: CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2, width: size.width, height: size.height), animated: true)
        }
    }

    /// Scrolls a node clear of the inspector sheet when it would be hidden.
    private func reveal(_ selection: KnowledgeMapCanvasView.Selection) {
        guard let frame = canvas.frameOfNode(selection) else { return }
        reveal(canvasRect: frame)
    }

    /// Scrolls so `canvasRect` sits in the visible part of the screen (above any sheet).
    private func reveal(canvasRect: CGRect) {
        let inView = canvas.convert(canvasRect, to: view)
        let rect = visibleRect()
        guard !rect.insetBy(dx: 0, dy: 8).contains(inView) else { return }
        var offset = scrollView.contentOffset
        offset.y += inView.midY - (inView.height < rect.height * 0.8 ? rect.minY + rect.height * 0.45 : rect.midY)
        offset.x += inView.midX - rect.midX
        scrollView.setContentOffset(clampedOffset(offset), animated: !UIAccessibility.isReduceMotionEnabled)
    }

    // MARK: Selection and sheets

    private func select(_ selection: KnowledgeMapCanvasView.Selection?) {
        canvas.selection = selection
        guard let selection, let data else {
            if let inspector, presentedViewController === inspector { inspector.dismiss(animated: true) }
            return
        }
        if let inspector, presentedViewController === inspector {
            inspector.update(data: data, selection: selection, busy: isBusy)
        } else if presentedViewController == nil {
            let controller = MapInspectorViewController(data: data, selection: selection)
            controller.onSelect = { [weak self] in self?.select($0) }
            controller.onAssign = { [weak self] key, cluster in
                guard let self else { return }
                Task { await self.assign([key], to: cluster, optimistic: true) }
            }
            controller.onHandover = { [weak self] from, to in
                guard let self else { return }
                inspector?.dismiss(animated: true) { self.beginHandover(from: from, to: to) }
            }
            controller.onOpenArticle = { [weak self] id in
                guard let self else { return }
                inspector?.dismiss(animated: true) { self.openArticle(id) }
            }
            controller.onOpenPerson = { [weak self] id in
                guard let self else { return }
                inspector?.dismiss(animated: true) { self.openPerson(id) }
            }
            controller.onClose = { [weak self] in
                self?.canvas.selection = nil
                self?.centerContent(settle: true)
            }
            if let sheet = controller.sheetPresentationController {
                let compact = UISheetPresentationController.Detent.custom(identifier: .init("inspector")) { context in
                    context.maximumDetentValue * 0.42
                }
                sheet.detents = [compact, .large()]
                sheet.largestUndimmedDetentIdentifier = compact.identifier
                sheet.prefersGrabberVisible = true
                sheet.prefersScrollingExpandsWhenScrolledToEdge = false
            }
            inspector = controller
            present(controller, animated: true) { [weak self] in
                self?.centerContent()
                self?.reveal(selection)
            }
            return
        }
        reveal(selection)
    }

    private func beginHandover(from: String, to: String) {
        guard let data, !data.members(of: from).isEmpty, data.person(to) != nil, !isBusy else { return }
        if let presented = presentedViewController {
            presented.dismiss(animated: true) { [weak self] in self?.beginHandover(from: from, to: to) }
            return
        }
        canvas.selection = nil
        canvas.handover = (from, to)
        let sheet = HandoverViewController(data: data, from: from, to: to)
        sheet.onTargetChange = { [weak self] to in self?.canvas.handover = (from, to) }
        sheet.onConfirm = { [weak self, weak sheet] to in
            guard let self, let keys = self.data?.members(of: from).map(\.key) else { return false }
            let ok = await assign(keys, to: to, optimistic: false) { done, total in sheet?.setProgress(done: done, total: total) }
            if ok { canvas.selection = .cluster(to) }
            return ok
        }
        sheet.onCancel = { [weak self] in self?.canvas.handover = nil }
        sheet.onClose = { [weak self] in
            self?.canvas.handover = nil
            self?.centerContent(settle: true)
        }
        if let presentation = sheet.sheetPresentationController {
            presentation.detents = [.medium(), .large()]
            presentation.largestUndimmedDetentIdentifier = .medium
            presentation.prefersGrabberVisible = true
        }
        UIImpactFeedbackGenerator(style: .medium, view: view).impactOccurred()
        handoverSheet = sheet
        present(sheet, animated: true) { [weak self] in
            guard let self else { return }
            centerContent()
            if let a = canvas.frameOfNode(.cluster(from)), let b = canvas.frameOfNode(.cluster(to)) {
                reveal(canvasRect: a.union(b))
            }
        }
    }

    private func openArticle(_ id: String) {
        let controller = workspace?.article(id).map { ArticleViewController(article: $0, workspace: workspace) } ?? ArticleViewController(articleID: id)
        controller.onPublished = { [weak self] _ in Task { await self?.refresh() } }
        navigationController?.pushViewController(controller, animated: true)
    }

    private func openPerson(_ id: String) {
        guard let workspace, let person = workspace.person(id) else { return }
        let controller = PersonViewController(person: person, workspace: workspace)
        controller.onStartInterview = onStartInterview
        controller.onWorkspaceChanged = { [weak self] workspace in
            self?.show(workspace)
            self?.onWorkspaceChanged?(workspace)
        }
        navigationController?.pushViewController(controller, animated: true)
    }
}

// MARK: - Banner and toast

/// "Jane is leaving Oct 30 — 5 items still owned by them — Hand over to Sam →".
private final class DepartureBanner: UIVisualEffectView {
    var onHandover: (() -> Void)?
    var onChooseSuccessor: (() -> Void)?

    init(person: Person, count: Int, successor: Person?) {
        super.init(effect: ContinuityTheme.glassEffect(tint: UIColor(hex: 0xFCEBE1, alpha: 0.5), interactive: false))
        layer.cornerRadius = 22
        layer.cornerCurve = .continuous
        clipsToBounds = true

        var headline = person.name + (person.hasLeft ? " has left" : " is leaving")
        if !person.hasLeft, let date = person.leaveDateValue { headline += " " + date.formatted(.dateTime.month(.abbreviated).day()) }
        let title = UILabel()
        title.text = headline
        title.font = ContinuityTheme.Font.text(14, weight: .semibold)
        title.textColor = ContinuityTheme.Color.ink
        title.numberOfLines = 2
        let detail = UILabel()
        detail.text = "\(count) \(count == 1 ? "item" : "items") still owned by them"
        detail.font = ContinuityTheme.Font.text(12)
        detail.textColor = ContinuityTheme.Color.secondaryInk
        let labels = UIStackView(arrangedSubviews: [title, detail])
        labels.axis = .vertical
        labels.spacing = 1

        var config: UIButton.Configuration = successor == nil ? .glass() : .prominentGlass()
        config.title = successor.map { "Hand over to \($0.firstName)" } ?? "Choose a successor"
        config.image = successor == nil ? nil : UIImage(systemName: "arrow.right", withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .bold))
        config.imagePlacement = .trailing
        config.imagePadding = 6
        config.cornerStyle = .capsule
        config.buttonSize = .small
        config.baseBackgroundColor = successor == nil ? nil : ContinuityTheme.Color.teal
        config.baseForegroundColor = successor == nil ? ContinuityTheme.Color.ink : .white
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var out = incoming
            out.font = ContinuityTheme.Font.text(13, weight: .semibold)
            return out
        }
        let button = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in
            if successor == nil { self?.onChooseSuccessor?() } else { self?.onHandover?() }
        })
        button.setContentCompressionResistancePriority(.required, for: .horizontal)
        button.setContentHuggingPriority(.required, for: .horizontal)

        let row = UIStackView(arrangedSubviews: [MapUI.glowDot(), labels, button])
        row.spacing = 12
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(row)
        NSLayoutConstraint.activate([
            row.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 10),
            row.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -10),
            row.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            row.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -10),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
}

/// A glass capsule that springs up with the result of a change, then fades.
final class MapToastView: UIVisualEffectView {
    private let icon = UIImageView()
    private let label = UILabel()
    private var hideTask: Task<Void, Never>?

    init() {
        super.init(effect: ContinuityTheme.glassEffect(interactive: false))
        layer.cornerRadius = 20
        layer.cornerCurve = .continuous
        clipsToBounds = true
        alpha = 0
        isUserInteractionEnabled = false
        icon.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 13, weight: .bold)
        icon.setContentHuggingPriority(.required, for: .horizontal)
        label.font = ContinuityTheme.Font.text(14, weight: .medium)
        label.textColor = ContinuityTheme.Color.ink
        label.numberOfLines = 2
        let row = UIStackView(arrangedSubviews: [icon, label])
        row.spacing = 8
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(row)
        NSLayoutConstraint.activate([
            row.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 10),
            row.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -10),
            row.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            row.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -18),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func show(ok: Bool, text: String) {
        icon.image = UIImage(systemName: ok ? "checkmark" : "xmark")
        icon.tintColor = ok ? ContinuityTheme.Color.teal : UIColor(hex: 0xB4483F)
        label.text = text
        superview?.bringSubviewToFront(self)
        let reduce = UIAccessibility.isReduceMotionEnabled
        if !reduce, alpha == 0 { transform = CGAffineTransform(translationX: 0, y: 14).scaledBy(x: 0.96, y: 0.96) }
        UIView.animate(springDuration: reduce ? 0.2 : 0.4, bounce: reduce ? 0 : 0.25) {
            self.alpha = 1
            self.transform = .identity
        }
        hideTask?.cancel()
        hideTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4.2))
            guard !Task.isCancelled, let self else { return }
            UIView.animate(withDuration: 0.2) {
                self.alpha = 0
                self.transform = reduce ? .identity : CGAffineTransform(translationX: 0, y: 8)
            }
        }
    }
}
