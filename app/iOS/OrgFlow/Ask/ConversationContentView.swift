import UIKit

// MARK: - Conversation content view

/// Editorial conversation mode: each entry is a typeset prompt followed by a grounded answer.
final class ConversationContentView: UIView, UIScrollViewDelegate {
    var onRetry: ((UUID) -> Void)?
    var onOpenCitation: ((Citation) -> Void)?

    /// The controller sets this so content clears the composer.
    var contentInsetBottom: CGFloat = 0 {
        didSet {
            guard contentInsetBottom != oldValue else { return }
            scrollView.contentInset.bottom = contentInsetBottom
            scrollView.verticalScrollIndicatorInsets.bottom = contentInsetBottom
            if pinned {
                layoutIfNeeded()
                scrollToBottom(animated: false)
            }
        }
    }

    private let scrollView = UIScrollView()
    private let stack = UIStackView()
    private var entryViews: [UUID: ConversationEntryView] = [:]
    private var pinned = true
    private let nearBottomThreshold: CGFloat = 80

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear

        scrollView.backgroundColor = .clear
        scrollView.keyboardDismissMode = .interactive
        scrollView.alwaysBounceVertical = true
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.delegate = self
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(scrollView)

        stack.axis = .vertical
        stack.alignment = .fill
        stack.spacing = 36
        stack.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(stack)

        let gutter = ContinuityTheme.Metrics.gutter
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: topAnchor),
            scrollView.bottomAnchor.constraint(equalTo: bottomAnchor),
            scrollView.leadingAnchor.constraint(equalTo: leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: trailingAnchor),

            stack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 20),
            stack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -28),
            stack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: gutter),
            stack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -gutter),
            stack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -gutter * 2),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    // MARK: Public

    func apply(_ entries: [ConversationEntry], animated: Bool) {
        let wasPinned = pinned
        let newIDs = Set(entries.map(\.id))
        var addedNew = false

        for (id, view) in entryViews where !newIDs.contains(id) {
            stack.removeArrangedSubview(view)
            view.removeFromSuperview()
            entryViews[id] = nil
        }

        for entry in entries {
            if let view = entryViews[entry.id] {
                view.update(entry, animated: animated)
            } else {
                let view = makeEntryView()
                entryViews[entry.id] = view
                stack.addArrangedSubview(view)
                view.update(entry, animated: false)
                addedNew = true
                if animated {
                    view.alpha = 0
                    view.transform = CGAffineTransform(translationX: 0, y: 12)
                    UIView.animate(
                        withDuration: 0.45, delay: 0.05,
                        options: [.curveEaseOut, .allowUserInteraction]
                    ) {
                        view.alpha = 1
                        view.transform = .identity
                    }
                }
            }
        }

        // Keep arranged order in sync with the model.
        let desired = entries.compactMap { entryViews[$0.id] }
        if desired != stack.arrangedSubviews {
            for (index, view) in desired.enumerated() {
                stack.insertArrangedSubview(view, at: index)
            }
        }

        if addedNew || wasPinned {
            layoutIfNeeded()
            scrollToBottom(animated: animated && addedNew)
            pinned = true
        }
    }

    func scrollToBottom(animated: Bool) {
        layoutIfNeeded()
        let inset = scrollView.adjustedContentInset
        let target = scrollView.contentSize.height - scrollView.bounds.height + inset.bottom
        let y = max(-inset.top, target)
        scrollView.setContentOffset(CGPoint(x: 0, y: y), animated: animated)
    }

    // MARK: Private

    private func makeEntryView() -> ConversationEntryView {
        let view = ConversationEntryView()
        view.onRetry = { [weak self] id in self?.onRetry?(id) }
        view.onOpenCitation = { [weak self] citation in self?.onOpenCitation?(citation) }
        view.onLayoutNeeded = { [weak self] in self?.layoutIfNeeded() }
        view.onContentChanged = { [weak self] in
            guard let self, self.pinned else { return }
            self.scrollToBottom(animated: false)
        }
        return view
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        // Only user-driven movement changes whether we follow the stream.
        guard scrollView.isTracking || scrollView.isDragging || scrollView.isDecelerating else { return }
        let visibleBottom = scrollView.contentOffset.y + scrollView.bounds.height - scrollView.adjustedContentInset.bottom
        pinned = scrollView.contentSize.height - visibleBottom <= nearBottomThreshold
    }
}

// MARK: - Entry view

private final class ConversationEntryView: UIView {
    var onRetry: ((UUID) -> Void)?
    var onOpenCitation: ((Citation) -> Void)?
    var onLayoutNeeded: (() -> Void)?
    var onContentChanged: (() -> Void)?

    private var entryID: UUID?
    private var lastEntry: ConversationEntry?

    private let root = UIStackView()
    private let promptLabel = UILabel()
    private let thinkingRow = UIStackView()
    private let answerContainer = UIView()
    private let answerTextView = UITextView()
    private let citationsSection = UIStackView()
    private let youLabel = UILabel()
    private let sourcesCaption = UILabel()
    private let thinkingLabel = UILabel()
    private let flow = CitationFlowView()
    private let failedStack = UIStackView()
    private let failedLabel = UILabel()
    private let loader = DotLoaderView()

    // Streaming coalescing
    private let minRenderInterval: CFTimeInterval = 1.0 / 15.0
    private var renderedAnswer = ""
    private var pendingAnswer = ""
    private var lastRender: CFTimeInterval = 0
    private var flushTask: Task<Void, Never>?

    override init(frame: CGRect) {
        super.init(frame: frame)
        buildLayout()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    deinit { flushTask?.cancel() }

    // MARK: Build

    private func buildLayout() {
        root.axis = .vertical
        root.alignment = .fill
        root.spacing = 20
        root.translatesAutoresizingMaskIntoConstraints = false
        addSubview(root)
        NSLayoutConstraint.activate([
            root.topAnchor.constraint(equalTo: topAnchor),
            root.bottomAnchor.constraint(equalTo: bottomAnchor),
            root.leadingAnchor.constraint(equalTo: leadingAnchor),
            root.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])

        // Prompt
        let rule = UIView()
        rule.backgroundColor = ContinuityTheme.Color.teal
        rule.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            rule.widthAnchor.constraint(equalToConstant: 14),
            rule.heightAnchor.constraint(equalToConstant: 1.5),
        ])
        youLabel.attributedText = ContinuityTheme.caption("You asked")
        let header = UIStackView(arrangedSubviews: [rule, youLabel, UIView()])
        header.axis = .horizontal
        header.alignment = .center
        header.spacing = 8

        promptLabel.numberOfLines = 0
        let promptGroup = UIStackView(arrangedSubviews: [header, promptLabel])
        promptGroup.axis = .vertical
        promptGroup.spacing = 10
        root.addArrangedSubview(promptGroup)

        // Thinking
        thinkingLabel.text = "Finding the relevant knowledge\u{2026}"
        thinkingLabel.font = ContinuityTheme.Font.text(15)
        thinkingLabel.textColor = ContinuityTheme.Color.secondaryInk
        thinkingRow.axis = .horizontal
        thinkingRow.alignment = .center
        thinkingRow.spacing = 10
        thinkingRow.addArrangedSubview(loader)
        thinkingRow.addArrangedSubview(thinkingLabel)
        thinkingRow.addArrangedSubview(UIView())
        root.addArrangedSubview(thinkingRow)

        // Answer
        let hairline = UIView()
        hairline.backgroundColor = ContinuityTheme.Color.iris.withAlphaComponent(0.5)
        hairline.translatesAutoresizingMaskIntoConstraints = false

        let answerCaption = UILabel()
        answerCaption.attributedText = ContinuityTheme.caption("OrgFlow", color: ContinuityTheme.Color.teal)

        answerTextView.isEditable = false
        answerTextView.isScrollEnabled = false
        answerTextView.isSelectable = true
        answerTextView.backgroundColor = .clear
        answerTextView.textContainerInset = .zero
        answerTextView.textContainer.lineFragmentPadding = 0
        answerTextView.linkTextAttributes = [
            .foregroundColor: ContinuityTheme.Color.teal,
            .underlineStyle: NSUnderlineStyle.single.rawValue,
        ]

        sourcesCaption.attributedText = ContinuityTheme.caption("Sources")
        citationsSection.axis = .vertical
        citationsSection.spacing = 10
        citationsSection.addArrangedSubview(sourcesCaption)
        citationsSection.addArrangedSubview(flow)
        flow.onOpen = { [weak self] citation in self?.onOpenCitation?(citation) }
        flow.onLayoutChanged = { [weak self] in self?.onLayoutNeeded?() }

        let column = UIStackView(arrangedSubviews: [answerCaption, answerTextView, citationsSection])
        column.axis = .vertical
        column.spacing = 10
        column.setCustomSpacing(22, after: answerTextView)
        column.translatesAutoresizingMaskIntoConstraints = false

        answerContainer.addSubview(hairline)
        answerContainer.addSubview(column)
        NSLayoutConstraint.activate([
            hairline.leadingAnchor.constraint(equalTo: answerContainer.leadingAnchor),
            hairline.topAnchor.constraint(equalTo: answerContainer.topAnchor, constant: 2),
            hairline.bottomAnchor.constraint(equalTo: answerContainer.bottomAnchor, constant: -2),
            hairline.widthAnchor.constraint(equalToConstant: 1),
            column.leadingAnchor.constraint(equalTo: hairline.trailingAnchor, constant: 14),
            column.trailingAnchor.constraint(equalTo: answerContainer.trailingAnchor),
            column.topAnchor.constraint(equalTo: answerContainer.topAnchor),
            column.bottomAnchor.constraint(equalTo: answerContainer.bottomAnchor),
        ])
        root.addArrangedSubview(answerContainer)

        // Failed
        let icon = UIImageView(image: UIImage(systemName: "exclamationmark.circle"))
        icon.tintColor = ContinuityTheme.Color.apricot
        icon.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 18, weight: .regular)
        icon.setContentHuggingPriority(.required, for: .horizontal)
        icon.setContentCompressionResistancePriority(.required, for: .horizontal)

        failedLabel.numberOfLines = 0
        failedLabel.font = ContinuityTheme.Font.text(15)
        failedLabel.textColor = ContinuityTheme.Color.secondaryInk

        let messageRow = UIStackView(arrangedSubviews: [icon, failedLabel])
        messageRow.axis = .horizontal
        messageRow.alignment = .firstBaseline
        messageRow.spacing = 10

        var config = UIButton.Configuration.glass()
        config.buttonSize = .small
        config.title = "Retry"
        config.image = UIImage(systemName: "arrow.clockwise")
        config.imagePadding = 6
        config.baseForegroundColor = ContinuityTheme.Color.ink
        let retry = UIButton(configuration: config)
        retry.addAction(UIAction { [weak self] _ in
            guard let self, let id = self.entryID else { return }
            self.onRetry?(id)
        }, for: .touchUpInside)
        let retryRow = UIStackView(arrangedSubviews: [retry, UIView()])
        retryRow.axis = .horizontal

        failedStack.axis = .vertical
        failedStack.spacing = 12
        failedStack.addArrangedSubview(messageRow)
        failedStack.addArrangedSubview(retryRow)
        root.addArrangedSubview(failedStack)

        thinkingRow.isHidden = true
        answerContainer.isHidden = true
        failedStack.isHidden = true
        citationsSection.isHidden = true
    }

    // MARK: Update

    func update(_ entry: ConversationEntry, animated: Bool) {
        guard entry != lastEntry else { return }
        let isFirst = lastEntry == nil
        lastEntry = entry
        entryID = entry.id

        if isFirst {
            // Narrations are long, so they read as body text rather than a headline.
            let narrated = entry.mode != .ask
            let caption = switch entry.mode {
            case .ask: "You asked"
            case .capture: "You described"
            case .handoff: "Your handoff"
            }
            youLabel.attributedText = ContinuityTheme.caption(caption)
            thinkingLabel.text = switch entry.mode {
            case .ask: "Finding the relevant knowledge\u{2026}"
            case .capture: "Drafting the playbook\u{2026}"
            case .handoff: "Drafting the handoff guide\u{2026}"
            }
            sourcesCaption.attributedText = ContinuityTheme.caption(narrated ? "Draft" : "Sources")
            promptLabel.numberOfLines = narrated ? 8 : 0
            promptLabel.attributedText = NSAttributedString(string: entry.prompt, attributes: [
                .font: narrated ? ContinuityTheme.Font.display(18) : ContinuityTheme.Font.display(24),
                .foregroundColor: ContinuityTheme.Color.ink,
                .paragraphStyle: {
                    let style = NSMutableParagraphStyle()
                    style.lineHeightMultiple = 1.15
                    return style
                }(),
            ])
        }

        var failureMessage: String?
        if case .failed(let message) = entry.status { failureMessage = message }
        if let failureMessage { failedLabel.text = failureMessage }

        setAnswer(entry.answer, force: entry.status != .streaming)

        let showCitations = !entry.citations.isEmpty
        flow.setCitations(entry.citations)

        let thinking = entry.status == .thinking || (entry.status == .streaming && entry.answer.isEmpty)
        let showAnswer = !entry.answer.isEmpty
        let showFailed = failureMessage != nil

        setVisibility(
            [(thinkingRow, thinking), (answerContainer, showAnswer), (failedStack, showFailed), (citationsSection, showCitations)],
            animated: animated && !isFirst
        )
    }

    private func setVisibility(_ changes: [(UIView, Bool)], animated: Bool) {
        let pending = changes.filter { $0.0.isHidden == $0.1 }
        guard !pending.isEmpty else { return }
        guard animated else {
            for (view, visible) in pending {
                view.isHidden = !visible
                view.alpha = 1
            }
            return
        }
        for (view, visible) in pending where visible { view.alpha = 0 }
        UIView.animate(withDuration: 0.25, delay: 0, options: [.curveEaseInOut, .beginFromCurrentState]) {
            for (view, visible) in pending {
                view.isHidden = !visible
                view.alpha = visible ? 1 : 0
            }
            self.onLayoutNeeded?()
        } completion: { _ in
            for (view, visible) in pending where !visible { view.alpha = 1 }
        }
    }

    // MARK: Streaming render coalescing

    private func setAnswer(_ text: String, force: Bool) {
        pendingAnswer = text
        guard text != renderedAnswer else {
            flushTask?.cancel()
            flushTask = nil
            return
        }
        let now = CACurrentMediaTime()
        let elapsed = now - lastRender
        if force || renderedAnswer.isEmpty || elapsed >= minRenderInterval {
            flushAnswer()
        } else if flushTask == nil {
            let delay = max(0.001, minRenderInterval - elapsed)
            flushTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(delay))
                guard !Task.isCancelled else { return }
                self?.flushAnswer()
            }
        }
    }

    private func flushAnswer() {
        flushTask?.cancel()
        flushTask = nil
        guard pendingAnswer != renderedAnswer else { return }
        renderedAnswer = pendingAnswer
        lastRender = CACurrentMediaTime()
        answerTextView.attributedText = AnswerTypesetter.render(renderedAnswer)
        answerTextView.invalidateIntrinsicContentSize()
        setNeedsLayout()
        onContentChanged?()
    }
}

// MARK: - Dot loader

private final class DotLoaderView: UIView {
    private let dots: [CALayer] = (0..<3).map { _ in
        let layer = CALayer()
        layer.backgroundColor = ContinuityTheme.Color.teal.cgColor
        layer.cornerRadius = 2
        layer.bounds = CGRect(x: 0, y: 0, width: 4, height: 4)
        return layer
    }

    override var isHidden: Bool {
        didSet {
            if isHidden { stop() } else if window != nil { start() }
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        dots.forEach { layer.addSublayer($0) }
        NotificationCenter.default.addObserver(
            self, selector: #selector(restart),
            name: UIApplication.didBecomeActiveNotification, object: nil
        )
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override var intrinsicContentSize: CGSize { CGSize(width: 20, height: 8) }

    override func layoutSubviews() {
        super.layoutSubviews()
        for (index, dot) in dots.enumerated() {
            dot.position = CGPoint(x: 2 + CGFloat(index) * 8, y: bounds.midY)
        }
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil, !isHidden { start() } else { stop() }
    }

    @objc private func restart() {
        if window != nil, !isHidden { start() }
    }

    private func start() {
        let base = layer.convertTime(CACurrentMediaTime(), from: nil)
        for (index, dot) in dots.enumerated() {
            dot.removeAllAnimations()

            let opacity = CAKeyframeAnimation(keyPath: "opacity")
            opacity.values = [0.25, 1.0, 0.25, 0.25]
            opacity.keyTimes = [0, 0.25, 0.6, 1]

            let scale = CAKeyframeAnimation(keyPath: "transform.scale")
            scale.values = [0.8, 1.2, 0.8, 0.8]
            scale.keyTimes = [0, 0.25, 0.6, 1]

            let group = CAAnimationGroup()
            group.animations = [opacity, scale]
            group.duration = 1.2
            group.repeatCount = .infinity
            group.beginTime = base + Double(index) * 0.16
            group.fillMode = .backwards
            group.isRemovedOnCompletion = false
            dot.add(group, forKey: "pulse")
        }
    }

    private func stop() {
        dots.forEach { $0.removeAllAnimations() }
    }
}

// MARK: - Citation flow

private final class CitationFlowView: UIView {
    var onOpen: ((Citation) -> Void)?
    /// Called inside an animation block after a chip toggles, so ancestors can lay out.
    var onLayoutChanged: (() -> Void)?

    private var citations: [Citation] = []
    private var chips: [CitationChipView] = []
    private var computedHeight: CGFloat = 0
    private var laidOutWidth: CGFloat = 0
    private let spacing: CGFloat = 8

    override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: computedHeight)
    }

    func setCitations(_ new: [Citation]) {
        guard new != citations else { return }
        let expandedIDs = Set(chips.filter(\.isExpanded).map { $0.citation.id })
        chips.forEach { $0.removeFromSuperview() }
        citations = new
        chips = new.map { citation in
            let chip = CitationChipView(citation: citation)
            chip.setExpanded(expandedIDs.contains(citation.id))
            chip.onToggle = { [weak self, weak chip] in
                guard let self, let chip else { return }
                self.toggle(chip)
            }
            chip.onOpen = { [weak self] in self?.onOpen?(citation) }
            addSubview(chip)
            return chip
        }
        setNeedsLayout()
        if laidOutWidth > 0 {
            performLayout(width: laidOutWidth)
            invalidateIntrinsicContentSize()
        }
    }

    private func toggle(_ chip: CitationChipView) {
        UIView.animate(
            withDuration: 0.32, delay: 0,
            usingSpringWithDamping: 0.9, initialSpringVelocity: 0,
            options: [.beginFromCurrentState, .allowUserInteraction]
        ) {
            chip.setExpanded(!chip.isExpanded)
            self.performLayout(width: self.bounds.width)
            self.invalidateIntrinsicContentSize()
            self.onLayoutChanged?()
            chip.layoutIfNeeded()
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0 else { return }
        laidOutWidth = bounds.width
        let before = computedHeight
        performLayout(width: bounds.width)
        if before != computedHeight { invalidateIntrinsicContentSize() }
    }

    private func performLayout(width: CGFloat) {
        guard width > 0 else { return }
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for chip in chips {
            let size = chip.size(fittingWidth: width)
            if x > 0, x + size.width > width + 0.5 || chip.isExpanded {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            chip.frame = CGRect(x: x, y: y, width: size.width, height: size.height)
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            if chip.isExpanded {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
        }
        computedHeight = ceil(chips.isEmpty ? 0 : max(0, y + rowHeight - (rowHeight == 0 ? spacing : 0)))
    }
}

private final class CitationChipView: UIView {
    let citation: Citation
    var onToggle: (() -> Void)?
    var onOpen: (() -> Void)?
    private(set) var isExpanded = false

    private let iconView = UIImageView()
    private let titleLabel = UILabel()
    private let snippetLabel = UILabel()
    private let openButton = UIButton(type: .system)

    private let hPad: CGFloat = 12
    private let vPad: CGFloat = 8
    private let iconSize: CGFloat = 14
    private let iconGap: CGFloat = 6
    private let maxCollapsedWidth: CGFloat = 240
    private let buttonHeight: CGFloat = 28

    private var hasSnippet: Bool { !(citation.snippet ?? "").isEmpty }
    private var hasURL: Bool { citation.url != nil }

    init(citation: Citation) {
        self.citation = citation
        super.init(frame: .zero)
        backgroundColor = ContinuityTheme.Color.canvas
        clipsToBounds = true
        layer.borderColor = ContinuityTheme.Color.hairline.cgColor

        iconView.image = UIImage(systemName: "doc.text")
        iconView.tintColor = ContinuityTheme.Color.teal
        iconView.contentMode = .scaleAspectFit
        iconView.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 11, weight: .regular)
        addSubview(iconView)

        titleLabel.text = citation.title
        titleLabel.font = ContinuityTheme.Font.text(13)
        titleLabel.textColor = ContinuityTheme.Color.ink
        titleLabel.numberOfLines = 1
        titleLabel.lineBreakMode = .byTruncatingTail
        addSubview(titleLabel)

        snippetLabel.text = citation.snippet
        snippetLabel.font = ContinuityTheme.Font.text(14)
        snippetLabel.textColor = ContinuityTheme.Color.secondaryInk
        snippetLabel.numberOfLines = 0
        addSubview(snippetLabel)

        var config = UIButton.Configuration.plain()
        config.title = "Open"
        config.baseForegroundColor = ContinuityTheme.Color.teal
        config.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 8)
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var outgoing = incoming
            outgoing.font = ContinuityTheme.Font.text(14, weight: .medium)
            return outgoing
        }
        openButton.configuration = config
        openButton.addAction(UIAction { [weak self] _ in self?.onOpen?() }, for: .touchUpInside)
        addSubview(openButton)

        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped)))
        applyExpansion()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    @objc private func tapped() { onToggle?() }

    func setExpanded(_ expanded: Bool) {
        isExpanded = expanded
        applyExpansion()
        setNeedsLayout()
    }

    private func applyExpansion() {
        titleLabel.numberOfLines = isExpanded ? 0 : 1
        let showDetail = isExpanded
        snippetLabel.alpha = showDetail && hasSnippet ? 1 : 0
        openButton.alpha = showDetail && hasURL ? 1 : 0
        openButton.isUserInteractionEnabled = showDetail && hasURL
    }

    func size(fittingWidth maxWidth: CGFloat) -> CGSize {
        let headerLine = ceil(max(iconSize, titleLabel.font.lineHeight))
        if !isExpanded {
            titleLabel.numberOfLines = 1
            let natural = ceil(titleLabel.sizeThatFits(CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)).width)
            let width = min(maxWidth, maxCollapsedWidth, hPad * 2 + iconSize + iconGap + natural)
            return CGSize(width: width, height: vPad * 2 + headerLine)
        }
        let contentWidth = maxWidth - hPad * 2
        let titleWidth = contentWidth - iconSize - iconGap
        let titleHeight = ceil(max(headerLine, titleLabel.sizeThatFits(CGSize(width: titleWidth, height: .greatestFiniteMagnitude)).height))
        var height = vPad + titleHeight
        if hasSnippet {
            height += 8 + ceil(snippetLabel.sizeThatFits(CGSize(width: contentWidth, height: .greatestFiniteMagnitude)).height)
        }
        if hasURL {
            height += 6 + buttonHeight
        }
        height += vPad
        return CGSize(width: maxWidth, height: height)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let scale = max(traitCollection.displayScale, 1)
        layer.borderWidth = 1 / scale
        layer.cornerRadius = isExpanded ? 16 : bounds.height / 2

        let headerLine = ceil(max(iconSize, titleLabel.font.lineHeight))
        let titleX = hPad + iconSize + iconGap
        let titleWidth = max(0, bounds.width - titleX - hPad)
        iconView.frame = CGRect(x: hPad, y: vPad + (headerLine - iconSize) / 2, width: iconSize, height: iconSize)

        if isExpanded {
            let contentWidth = bounds.width - hPad * 2
            let titleHeight = ceil(max(headerLine, titleLabel.sizeThatFits(CGSize(width: titleWidth, height: .greatestFiniteMagnitude)).height))
            titleLabel.frame = CGRect(x: titleX, y: vPad, width: titleWidth, height: titleHeight)
            var y = vPad + titleHeight
            if hasSnippet {
                y += 8
                let h = ceil(snippetLabel.sizeThatFits(CGSize(width: contentWidth, height: .greatestFiniteMagnitude)).height)
                snippetLabel.frame = CGRect(x: hPad, y: y, width: contentWidth, height: h)
                y += h
            } else {
                snippetLabel.frame = .zero
            }
            if hasURL {
                y += 6
                let w = openButton.intrinsicContentSize.width
                openButton.frame = CGRect(x: hPad, y: y, width: w, height: buttonHeight)
            } else {
                openButton.frame = .zero
            }
        } else {
            titleLabel.frame = CGRect(x: titleX, y: vPad, width: titleWidth, height: headerLine)
            // Keep detail parked below the header so it fades rather than slides in from nowhere.
            let contentWidth = bounds.width - hPad * 2
            snippetLabel.frame = CGRect(x: hPad, y: vPad + headerLine + 8, width: max(0, contentWidth), height: 0)
            openButton.frame = CGRect(x: hPad, y: vPad + headerLine, width: 0, height: 0)
        }
    }
}

// MARK: - Answer typesetter

/// Lightweight markdown block renderer, tolerant of partial (streaming) input.
enum AnswerTypesetter {
    private enum Block {
        case heading(level: Int, text: String)
        case paragraph(String)
        case numbered(number: Int, text: String)
        case bullet(String)
        case quote(String)
        case code(String)
    }

    static func render(_ markdown: String) -> NSAttributedString {
        let blocks = parse(markdown)
        let result = NSMutableAttributedString()
        for (index, block) in blocks.enumerated() {
            let piece = attributed(block, isFirst: index == 0)
            if index < blocks.count - 1 {
                piece.append(NSAttributedString(string: "\n"))
            }
            result.append(piece)
        }
        return result
    }

    // MARK: Parsing

    private static func parse(_ markdown: String) -> [Block] {
        let normalized = markdown.replacingOccurrences(of: "\r\n", with: "\n")
        var blocks: [Block] = []
        var paragraph: [String] = []
        var codeLines: [String] = []
        var inCode = false

        func flushParagraph() {
            guard !paragraph.isEmpty else { return }
            blocks.append(.paragraph(paragraph.joined(separator: " ")))
            paragraph.removeAll()
        }

        for rawLine in normalized.components(separatedBy: "\n") {
            let line = rawLine.trimmingCharacters(in: .whitespaces)

            if line.hasPrefix("```") {
                if inCode {
                    blocks.append(.code(codeLines.joined(separator: "\n")))
                    codeLines.removeAll()
                    inCode = false
                } else {
                    flushParagraph()
                    inCode = true
                }
                continue
            }
            if inCode {
                codeLines.append(rawLine)
                continue
            }
            if line.isEmpty {
                flushParagraph()
                continue
            }
            if line.first == "#" {
                let hashes = line.prefix { $0 == "#" }.count
                let rest = line.dropFirst(hashes)
                if rest.isEmpty {
                    // A bare "##" mid-stream: wait for the heading text.
                    flushParagraph()
                    continue
                }
                if rest.first == " " {
                    flushParagraph()
                    blocks.append(.heading(level: min(hashes, 3), text: rest.trimmingCharacters(in: .whitespaces)))
                    continue
                }
            }
            if line.hasPrefix(">") {
                flushParagraph()
                var body = line.dropFirst()
                if body.first == " " { body = body.dropFirst() }
                if case .quote(let previous)? = blocks.last, paragraph.isEmpty {
                    blocks[blocks.count - 1] = .quote(previous + " " + String(body))
                } else {
                    blocks.append(.quote(String(body)))
                }
                continue
            }
            if let (number, body) = numberedItem(line) {
                flushParagraph()
                blocks.append(.numbered(number: number, text: body))
                continue
            }
            if let body = bulletItem(line) {
                flushParagraph()
                blocks.append(.bullet(body))
                continue
            }
            paragraph.append(line)
        }
        if inCode, !codeLines.isEmpty {
            blocks.append(.code(codeLines.joined(separator: "\n")))
        }
        flushParagraph()
        return blocks
    }

    private static func numberedItem(_ line: String) -> (Int, String)? {
        let digits = line.prefix { $0.isASCII && $0.isNumber }
        guard !digits.isEmpty, digits.count <= 3, let number = Int(digits) else { return nil }
        let rest = line.dropFirst(digits.count)
        guard let marker = rest.first, marker == "." || marker == ")" else { return nil }
        let afterMarker = rest.dropFirst()
        guard afterMarker.first == " " else { return nil }
        return (number, afterMarker.trimmingCharacters(in: .whitespaces))
    }

    private static func bulletItem(_ line: String) -> String? {
        for marker in ["- ", "* ", "\u{2022} "] where line.hasPrefix(marker) {
            return String(line.dropFirst(marker.count)).trimmingCharacters(in: .whitespaces)
        }
        return nil
    }

    // MARK: Attribution

    private static let ink = ContinuityTheme.Color.ink
    private static let teal = ContinuityTheme.Color.teal

    private static func attributed(_ block: Block, isFirst: Bool) -> NSMutableAttributedString {
        let style = NSMutableParagraphStyle()
        let piece: NSMutableAttributedString

        switch block {
        case .heading(let level, let text):
            let font = ContinuityTheme.Font.display(level == 1 ? 20 : 18, weight: .semibold)
            piece = inline(text, font: font, color: ink)
            style.lineHeightMultiple = 1.1
            style.paragraphSpacingBefore = isFirst ? 0 : 14
            style.paragraphSpacing = 6

        case .paragraph(let text):
            piece = inline(text, font: ContinuityTheme.Font.text(17), color: ink)
            style.lineHeightMultiple = 1.3
            style.paragraphSpacing = 10

        case .numbered(let number, let text):
            let prefix = NSAttributedString(string: "\(number).\t", attributes: [
                .font: UIFont.monospacedDigitSystemFont(ofSize: 15, weight: .medium),
                .foregroundColor: teal,
            ])
            piece = NSMutableAttributedString(attributedString: prefix)
            piece.append(inline(text, font: ContinuityTheme.Font.text(17), color: ink))
            applyListStyle(style)

        case .bullet(let text):
            let prefix = NSAttributedString(string: "\u{2022}\t", attributes: [
                .font: ContinuityTheme.Font.text(17, weight: .bold),
                .foregroundColor: teal,
            ])
            piece = NSMutableAttributedString(attributedString: prefix)
            piece.append(inline(text, font: ContinuityTheme.Font.text(17), color: ink))
            applyListStyle(style)

        case .quote(let text):
            piece = inline(text, font: ContinuityTheme.Font.text(17), color: ContinuityTheme.Color.secondaryInk, italic: true)
            style.lineHeightMultiple = 1.3
            style.paragraphSpacing = 10
            style.firstLineHeadIndent = 14
            style.headIndent = 14

        case .code(let text):
            piece = NSMutableAttributedString(string: text, attributes: [
                .font: UIFont.monospacedSystemFont(ofSize: 14, weight: .regular),
                .foregroundColor: ink,
                .backgroundColor: ContinuityTheme.Color.paleTeal,
            ])
            style.lineHeightMultiple = 1.2
            style.paragraphSpacing = 10
        }

        piece.addAttribute(.paragraphStyle, value: style, range: NSRange(location: 0, length: piece.length))
        return piece
    }

    private static func applyListStyle(_ style: NSMutableParagraphStyle) {
        let indent: CGFloat = 26
        style.lineHeightMultiple = 1.3
        style.paragraphSpacing = 6
        style.firstLineHeadIndent = 0
        style.headIndent = indent
        style.tabStops = [NSTextTab(textAlignment: .left, location: indent)]
        style.defaultTabInterval = indent
    }

    // MARK: Inline

    private static func inline(
        _ text: String, font: UIFont, color: UIColor, italic: Bool = false
    ) -> NSMutableAttributedString {
        let plain = {
            NSMutableAttributedString(string: text, attributes: [
                .font: italic ? styled(font, bold: false, italic: true) : font,
                .foregroundColor: color,
            ])
        }
        guard let parsed = try? AttributedString(
            markdown: text,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        ) else {
            return plain()
        }

        let result = NSMutableAttributedString()
        for run in parsed.runs {
            let substring = String(parsed[run.range].characters)
            guard !substring.isEmpty else { continue }
            let intent = run.inlinePresentationIntent ?? []
            var attributes: [NSAttributedString.Key: Any] = [.foregroundColor: color]

            if intent.contains(.code) {
                attributes[.font] = UIFont.monospacedSystemFont(ofSize: 15, weight: .regular)
                attributes[.backgroundColor] = ContinuityTheme.Color.paleTeal
            } else {
                attributes[.font] = styled(
                    font,
                    bold: intent.contains(.stronglyEmphasized),
                    italic: italic || intent.contains(.emphasized)
                )
            }
            if let link = run.link {
                attributes[.link] = link
            }
            result.append(NSAttributedString(string: substring, attributes: attributes))
        }
        return result.length == 0 && !text.isEmpty ? plain() : result
    }

    private static func styled(_ base: UIFont, bold: Bool, italic: Bool) -> UIFont {
        guard bold || italic else { return base }
        var descriptor = base.fontDescriptor
        if bold {
            descriptor = descriptor.addingAttributes([
                .traits: [UIFontDescriptor.TraitKey.weight: UIFont.Weight.semibold.rawValue],
            ])
        }
        if italic, let withItalic = descriptor.withSymbolicTraits(descriptor.symbolicTraits.union(.traitItalic)) {
            descriptor = withItalic
        }
        return UIFont(descriptor: descriptor, size: base.pointSize)
    }
}
