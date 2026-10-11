import UIKit

final class PromptComposerView: UIView, UITextViewDelegate {
    // MARK: Public API

    var onSend: ((String) -> Void)?
    var onMicTap: (() -> Void)?
    var onFocusChange: ((Bool) -> Void)?
    var onTextChange: ((String) -> Void)?

    var text: String {
        get { textView.text ?? "" }
        set {
            isShowingTranscript = false
            textView.attributedText = nil
            textView.text = newValue
            applyPlainAttributes()
            refreshState(animated: false)
        }
    }

    var placeholder: String {
        get { placeholderLabel.text ?? "" }
        set { placeholderLabel.text = newValue }
    }

    var isListening: Bool = false {
        didSet {
            guard isListening != oldValue else { return }
            updateListening()
        }
    }

    var isSendEnabled: Bool = true {
        didSet { updateSendState(animated: true) }
    }

    var statusText: String? {
        didSet { updateStatus() }
    }

    var isEditing: Bool { textView.isFirstResponder }

    // MARK: Views

    private let statusRow = UIStackView()
    private let statusDot = UIView()
    private let statusLabel = UILabel()
    private var statusHeight: NSLayoutConstraint!

    private let container = UIVisualEffectView(effect: {
        let effect = UIGlassContainerEffect()
        effect.spacing = 10
        return effect
    }())
    private let fieldGlass = UIVisualEffectView(effect: nil)
    private let borderView = UIView()
    private let textView = UITextView()
    private let placeholderLabel = UILabel()
    private let sendButton = UIButton(type: .system)
    private let micGlass = UIVisualEffectView(effect: nil)
    private let micControl = UIControl()
    private let micIcon = UIImageView()

    private var textHeight: NSLayoutConstraint!
    private var isShowingTranscript = false
    private var isFieldFocused = false
    private var statusVisible = false
    private var lastLayoutWidth: CGFloat = 0

    private let minFieldHeight: CGFloat = 52
    private let maxLines: CGFloat = 5
    private let verticalInset: CGFloat = 16

    private var plainAttributes: [NSAttributedString.Key: Any] {
        [.font: ContinuityTheme.Font.text(17), .foregroundColor: ContinuityTheme.Color.ink]
    }

    // MARK: Init

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        buildStatusRow()
        buildComposition()
        fieldGlass.effect = fieldEffect(focused: false)
        micGlass.effect = micEffect(listening: false)
        refreshState(animated: false)
        updateStatus(animated: false)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    // MARK: Build

    private func buildStatusRow() {
        statusDot.layer.cornerRadius = 3
        statusDot.backgroundColor = ContinuityTheme.Color.teal
        statusDot.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            statusDot.widthAnchor.constraint(equalToConstant: 6),
            // Yields while the status row is collapsed to zero height.
            { let c = statusDot.heightAnchor.constraint(equalToConstant: 6); c.priority = .defaultHigh; return c }(),
        ])

        statusRow.axis = .horizontal
        statusRow.alignment = .center
        statusRow.spacing = 8
        statusRow.addArrangedSubview(statusDot)
        statusRow.addArrangedSubview(statusLabel)
        statusRow.alpha = 0
        statusRow.translatesAutoresizingMaskIntoConstraints = false
        statusRow.clipsToBounds = true
        addSubview(statusRow)

        statusHeight = statusRow.heightAnchor.constraint(equalToConstant: 0)
        NSLayoutConstraint.activate([
            statusRow.topAnchor.constraint(equalTo: topAnchor),
            statusRow.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            statusRow.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor),
            statusHeight,
        ])
    }

    private func buildComposition() {
        container.translatesAutoresizingMaskIntoConstraints = false
        addSubview(container)

        fieldGlass.translatesAutoresizingMaskIntoConstraints = false
        fieldGlass.cornerConfiguration = .corners(radius: .fixed(26))
        micGlass.translatesAutoresizingMaskIntoConstraints = false
        micGlass.cornerConfiguration = .capsule()
        container.contentView.addSubview(fieldGlass)
        container.contentView.addSubview(micGlass)

        // Focus border
        borderView.isUserInteractionEnabled = false
        borderView.layer.cornerRadius = 26
        borderView.layer.cornerCurve = .continuous
        borderView.layer.borderWidth = 0
        borderView.layer.borderColor = ContinuityTheme.Color.teal.withAlphaComponent(0).cgColor
        borderView.translatesAutoresizingMaskIntoConstraints = false
        fieldGlass.contentView.addSubview(borderView)

        // Text view
        textView.backgroundColor = .clear
        textView.font = ContinuityTheme.Font.text(17)
        textView.textColor = ContinuityTheme.Color.ink
        textView.tintColor = ContinuityTheme.Color.teal
        textView.textContainerInset = UIEdgeInsets(top: verticalInset, left: 0, bottom: verticalInset, right: 0)
        textView.textContainer.lineFragmentPadding = 0
        textView.isScrollEnabled = false
        textView.showsVerticalScrollIndicator = false
        textView.returnKeyType = .default
        textView.delegate = self
        textView.translatesAutoresizingMaskIntoConstraints = false
        fieldGlass.contentView.addSubview(textView)

        placeholderLabel.text = "Ask OrgFlow anything…"
        placeholderLabel.font = ContinuityTheme.Font.text(17)
        placeholderLabel.textColor = ContinuityTheme.Color.secondaryInk
        placeholderLabel.isUserInteractionEnabled = false
        placeholderLabel.translatesAutoresizingMaskIntoConstraints = false
        fieldGlass.contentView.addSubview(placeholderLabel)

        // Send button
        var config = UIButton.Configuration.prominentGlass()
        config.image = UIImage(
            systemName: "arrow.up",
            withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .semibold)
        )
        config.baseForegroundColor = .white
        config.baseBackgroundColor = ContinuityTheme.Color.teal
        config.cornerStyle = .capsule
        config.contentInsets = .zero
        sendButton.configuration = config
        sendButton.addAction(UIAction { [weak self] _ in self?.sendTapped() }, for: .touchUpInside)
        sendButton.translatesAutoresizingMaskIntoConstraints = false
        fieldGlass.contentView.addSubview(sendButton)

        // Mic
        micIcon.contentMode = .center
        micIcon.tintColor = .white
        micIcon.isUserInteractionEnabled = false
        micIcon.image = micImage(listening: false)
        micIcon.translatesAutoresizingMaskIntoConstraints = false
        micControl.translatesAutoresizingMaskIntoConstraints = false
        micGlass.contentView.addSubview(micControl)
        micControl.addSubview(micIcon)
        micControl.addAction(UIAction { [weak self] _ in self?.onMicTap?() }, for: .touchUpInside)

        textHeight = textView.heightAnchor.constraint(equalToConstant: minFieldHeight)

        NSLayoutConstraint.activate([
            container.topAnchor.constraint(equalTo: statusRow.bottomAnchor, constant: 0),
            container.leadingAnchor.constraint(equalTo: leadingAnchor),
            container.trailingAnchor.constraint(equalTo: trailingAnchor),
            container.bottomAnchor.constraint(equalTo: bottomAnchor),

            micGlass.trailingAnchor.constraint(equalTo: container.contentView.trailingAnchor),
            micGlass.bottomAnchor.constraint(equalTo: container.contentView.bottomAnchor),
            micGlass.widthAnchor.constraint(equalToConstant: 52),
            micGlass.heightAnchor.constraint(equalToConstant: 52),

            fieldGlass.leadingAnchor.constraint(equalTo: container.contentView.leadingAnchor),
            fieldGlass.topAnchor.constraint(equalTo: container.contentView.topAnchor),
            fieldGlass.bottomAnchor.constraint(equalTo: container.contentView.bottomAnchor),
            fieldGlass.trailingAnchor.constraint(equalTo: micGlass.leadingAnchor, constant: -10),
            fieldGlass.heightAnchor.constraint(greaterThanOrEqualToConstant: minFieldHeight),

            borderView.leadingAnchor.constraint(equalTo: fieldGlass.contentView.leadingAnchor),
            borderView.trailingAnchor.constraint(equalTo: fieldGlass.contentView.trailingAnchor),
            borderView.topAnchor.constraint(equalTo: fieldGlass.contentView.topAnchor),
            borderView.bottomAnchor.constraint(equalTo: fieldGlass.contentView.bottomAnchor),

            textView.leadingAnchor.constraint(equalTo: fieldGlass.contentView.leadingAnchor, constant: 20),
            textView.trailingAnchor.constraint(equalTo: sendButton.leadingAnchor, constant: -8),
            textView.topAnchor.constraint(equalTo: fieldGlass.contentView.topAnchor),
            textView.bottomAnchor.constraint(equalTo: fieldGlass.contentView.bottomAnchor),
            textHeight,

            placeholderLabel.leadingAnchor.constraint(equalTo: textView.leadingAnchor),
            placeholderLabel.trailingAnchor.constraint(lessThanOrEqualTo: textView.trailingAnchor),
            placeholderLabel.topAnchor.constraint(equalTo: textView.topAnchor, constant: verticalInset),

            sendButton.trailingAnchor.constraint(equalTo: fieldGlass.contentView.trailingAnchor, constant: -9),
            sendButton.bottomAnchor.constraint(equalTo: fieldGlass.contentView.bottomAnchor, constant: -9),
            sendButton.widthAnchor.constraint(equalToConstant: 34),
            sendButton.heightAnchor.constraint(equalToConstant: 34),

            micControl.leadingAnchor.constraint(equalTo: micGlass.contentView.leadingAnchor),
            micControl.trailingAnchor.constraint(equalTo: micGlass.contentView.trailingAnchor),
            micControl.topAnchor.constraint(equalTo: micGlass.contentView.topAnchor),
            micControl.bottomAnchor.constraint(equalTo: micGlass.contentView.bottomAnchor),

            micIcon.centerXAnchor.constraint(equalTo: micControl.centerXAnchor),
            micIcon.centerYAnchor.constraint(equalTo: micControl.centerYAnchor),
        ])
    }

    // MARK: Effects and images

    private func fieldEffect(focused: Bool) -> UIGlassEffect {
        let effect = UIGlassEffect(style: .regular)
        effect.isInteractive = true
        effect.tintColor = nil
        return effect
    }

    private func micEffect(listening: Bool) -> UIGlassEffect {
        let effect = UIGlassEffect(style: .regular)
        effect.isInteractive = true
        // The mic is the primary voice control: confident teal, warm apricot while listening.
        effect.tintColor = listening ? ContinuityTheme.Color.apricot : ContinuityTheme.Color.teal
        return effect
    }

    private func micImage(listening: Bool) -> UIImage? {
        UIImage(
            systemName: listening ? "stop.fill" : "mic",
            withConfiguration: UIImage.SymbolConfiguration(pointSize: 20, weight: .medium)
        )
    }

    // MARK: State updates

    private func updateListening() {
        micIcon.setSymbolImage(micImage(listening: isListening)!, contentTransition: .replace)
        UIView.animate(withDuration: 0.3) {
            self.micGlass.effect = self.micEffect(listening: self.isListening)
        }
        updateStatusColor()
    }

    private func updateStatusColor() {
        statusDot.backgroundColor = isListening ? ContinuityTheme.Color.apricot : ContinuityTheme.Color.teal
    }

    private func updateStatus(animated: Bool = true) {
        let shouldShow = statusText != nil
        if let statusText {
            statusLabel.attributedText = ContinuityTheme.caption(statusText)
        }
        updateStatusColor()
        guard shouldShow != statusVisible else { return }
        statusVisible = shouldShow

        statusHeight.constant = shouldShow ? 22 : 0
        let apply = {
            self.statusRow.alpha = shouldShow ? 1 : 0
            self.statusRow.transform = shouldShow ? .identity : CGAffineTransform(translationX: 0, y: 6)
            self.superview?.layoutIfNeeded()
            self.layoutIfNeeded()
        }
        if animated, window != nil {
            UIView.animate(springDuration: 0.4, bounce: 0.1, animations: apply)
        } else {
            apply()
        }
        invalidateIntrinsicContentSize()
    }

    private func setFocused(_ focused: Bool) {
        isFieldFocused = focused
        UIView.animate(withDuration: 0.25) {
            self.fieldGlass.effect = self.fieldEffect(focused: focused)
        }
    }

    private func refreshState(animated: Bool) {
        placeholderLabel.isHidden = !textView.text.isEmpty
        updateSendState(animated: animated)
        updateHeight(animated: animated)
    }

    private var canSend: Bool {
        isSendEnabled && !trimmedText.isEmpty
    }

    private var trimmedText: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func updateSendState(animated: Bool) {
        let enabled = canSend
        sendButton.isEnabled = enabled
        let apply = {
            self.sendButton.alpha = enabled ? 1 : 0.35
            self.sendButton.transform = enabled ? .identity : CGAffineTransform(scaleX: 0.85, y: 0.85)
        }
        if animated, window != nil {
            UIView.animate(springDuration: 0.3, bounce: 0.15, initialSpringVelocity: 0, delay: 0,
                           options: [.allowUserInteraction, .beginFromCurrentState], animations: apply)
        } else {
            apply()
        }
    }

    private func updateHeight(animated: Bool) {
        let width = textView.bounds.width
        guard width > 0 else { return }
        let lineHeight = ContinuityTheme.Font.text(17).lineHeight
        let maxHeight = ceil(lineHeight * maxLines + verticalInset * 2)
        let fitting = ceil(textView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height)
        let target = min(max(fitting, minFieldHeight), maxHeight)
        let needsScroll = fitting > maxHeight
        if textView.isScrollEnabled != needsScroll { textView.isScrollEnabled = needsScroll }
        guard abs(textHeight.constant - target) > 0.5 else { return }
        textHeight.constant = target
        invalidateIntrinsicContentSize()
        let apply = {
            self.layoutIfNeeded()
            self.superview?.layoutIfNeeded()
        }
        if animated, window != nil {
            UIView.animate(springDuration: 0.4, bounce: 0.15, animations: apply)
        } else {
            apply()
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if abs(textView.bounds.width - lastLayoutWidth) > 0.5 {
            lastLayoutWidth = textView.bounds.width
            updateHeight(animated: false)
        }
    }

    private func applyPlainAttributes() {
        textView.font = ContinuityTheme.Font.text(17)
        textView.textColor = ContinuityTheme.Color.ink
        textView.typingAttributes = plainAttributes
    }

    // MARK: Actions

    private func sendTapped() {
        guard canSend else { return }
        onSend?(trimmedText)
    }

    // MARK: Transcript and control

    func setTranscript(_ update: TranscriptUpdate?) {
        guard let update else {
            guard isShowingTranscript else { return }
            let current = textView.text ?? ""
            let selected = textView.selectedRange
            isShowingTranscript = false
            textView.attributedText = nil
            textView.text = current
            applyPlainAttributes()
            if textView.isFirstResponder, selected.location + selected.length <= (current as NSString).length {
                textView.selectedRange = selected
            }
            refreshState(animated: true)
            return
        }

        isShowingTranscript = true
        let italic: UIFont = {
            let base = ContinuityTheme.Font.text(17)
            guard let descriptor = base.fontDescriptor.withSymbolicTraits(.traitItalic) else { return base }
            return UIFont(descriptor: descriptor, size: 17)
        }()
        let attributed = NSMutableAttributedString(string: update.finalized, attributes: plainAttributes)
        attributed.append(NSAttributedString(string: update.volatile, attributes: [
            .font: italic,
            .foregroundColor: ContinuityTheme.Color.secondaryInk,
        ]))
        textView.attributedText = attributed
        textView.typingAttributes = plainAttributes
        refreshState(animated: true)
    }

    func reset() {
        isShowingTranscript = false
        textView.attributedText = nil
        textView.text = ""
        applyPlainAttributes()
        statusText = nil
        refreshState(animated: true)
    }

    func focus() { textView.becomeFirstResponder() }

    func blur() { textView.resignFirstResponder() }

    // MARK: UITextViewDelegate

    func textViewDidBeginEditing(_ textView: UITextView) {
        setFocused(true)
        onFocusChange?(true)
    }

    func textViewDidEndEditing(_ textView: UITextView) {
        setFocused(false)
        onFocusChange?(false)
    }

    func textViewDidChange(_ textView: UITextView) {
        if isShowingTranscript { setTranscript(nil) }
        refreshState(animated: true)
        onTextChange?(text)
    }
}
