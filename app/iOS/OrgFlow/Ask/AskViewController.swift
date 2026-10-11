import UIKit

/// The primary Ask screen. A full-bleed composition around the Continuity Knot — a touchable,
/// voice-reactive object — that condenses into a header band when the conversation begins.
final class AskViewController: UIViewController {
    private let coordinator: AskScreenCoordinator

    // Header
    private let markView = ContinuityMarkView()
    private let wordmark = UILabel()
    private let workspaceLabel = UILabel()
    private let historyButton = UIButton(configuration: .glass())
    private let newPromptButton = UIButton(configuration: .glass())

    // Landing
    private let greetingLabel = UILabel()
    private let headlineLabel = UILabel()
    private let subtitleLabel = UILabel()
    private let heroStack = UIStackView()
    private let knotView = LivingThreadView()
    private let hintLabel = UILabel()
    private let suggestions = SuggestionCapsulesView(suggestions: Suggestion.defaults, horizontalInset: ContinuityTheme.Metrics.gutter)

    // Conversation
    private let conversationView = ConversationContentView()
    private let composer = PromptComposerView()
    private let errorNotice = ErrorNoticeView()

    // Atmosphere: soft color fields that the glass controls refract.
    private let tealField = CAGradientLayer()
    private let lavenderField = CAGradientLayer()
    private let apricotField = CAGradientLayer()
    private let floorWash = CAGradientLayer()

    private var knotFillsLanding: NSLayoutConstraint!
    private var knotCondensed: NSLayoutConstraint!
    private var knotBelowHero: NSLayoutConstraint!
    private var knotBelowHeader: NSLayoutConstraint!

    private var appliedState: AskViewState?
    private var appliedConversation: Bool?
    private var appliedEntries: [ConversationEntry] = []
    private var lastTranscript: TranscriptUpdate?
    private var heldToTalk = false
    private var backdropFrame: CGRect = .zero

    init(coordinator: AskScreenCoordinator) {
        self.coordinator = coordinator
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = ContinuityTheme.Color.canvas
        buildAtmosphere()
        buildHeader()
        buildLanding()
        buildConversation()
        buildComposer()
        wire()
        Task {
            await coordinator.refreshUser()
            await loadSuggestions()
        }
    }

    /// Replaces the starter capsules with questions written on device from this workspace's content.
    private func loadSuggestions() async {
        guard coordinator.user != nil,
              let workspace = try? await OrgFlowAPI.shared.workspaceSummary(),
              let generated = await SuggestionGenerator.suggestions(for: workspace) else { return }
        suggestions.setSuggestions(generated, animated: true)
    }

    private func presentSignIn() {
        guard presentedViewController == nil else { return }
        let signIn = SignInViewController()
        signIn.onSignedIn = { [weak self] user in
            guard let self else { return }
            coordinator.didSignIn(user)
            Task { await self.loadSuggestions() }
        }
        signIn.sheetPresentationController?.detents = [.large()]
        signIn.sheetPresentationController?.prefersGrabberVisible = true
        present(signIn, animated: true)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        markView.animateDraw()
        refreshKnotBackdrop()
    }

    func sceneDidEnterBackground() {
        knotView.suspend()
        coordinator.enterBackground()
    }

    func sceneWillEnterForeground() {
        knotView.resume()
    }

    // MARK: - Construction

    private func buildAtmosphere() {
        let fields: [(CAGradientLayer, UIColor, Float)] = [
            (tealField, ContinuityTheme.Color.paleTeal, 1),
            (lavenderField, ContinuityTheme.Color.paleLavender, 1),
            (apricotField, ContinuityTheme.Color.apricot, 0.16),
        ]
        for (field, color, opacity) in fields {
            field.type = .radial
            field.colors = [color.cgColor, color.withAlphaComponent(0).cgColor]
            field.startPoint = CGPoint(x: 0.5, y: 0.5)
            field.endPoint = CGPoint(x: 1, y: 1)
            field.opacity = opacity
            view.layer.addSublayer(field)
        }
        // A faint wash under the composer so its glass always has color to bend.
        floorWash.colors = [
            ContinuityTheme.Color.paleTeal.withAlphaComponent(0).cgColor,
            ContinuityTheme.Color.paleTeal.withAlphaComponent(0.55).cgColor,
            ContinuityTheme.Color.paleLavender.withAlphaComponent(0.8).cgColor,
        ]
        floorWash.locations = [0, 0.55, 1]
        view.layer.addSublayer(floorWash)
    }

    private func buildHeader() {
        wordmark.attributedText = NSAttributedString(string: "Continuity", attributes: [
            .font: ContinuityTheme.Font.display(19, weight: .semibold),
            .foregroundColor: ContinuityTheme.Color.ink,
            .kern: -0.2,
        ])
        workspaceLabel.font = ContinuityTheme.Font.text(12, weight: .medium)
        workspaceLabel.textColor = ContinuityTheme.Color.secondaryInk
        workspaceLabel.text = "Demo workspace"

        configureCircleButton(historyButton, symbol: "clock.arrow.circlepath")
        historyButton.showsMenuAsPrimaryAction = true
        configureCircleButton(newPromptButton, symbol: "square.and.pencil")
        newPromptButton.alpha = 0
        newPromptButton.isHidden = true

        let names = UIStackView(arrangedSubviews: [wordmark, workspaceLabel])
        names.axis = .vertical
        names.spacing = 0
        let brand = UIStackView(arrangedSubviews: [markView, names])
        brand.spacing = 10
        brand.alignment = .center
        let trailing = UIStackView(arrangedSubviews: [newPromptButton, historyButton])
        trailing.spacing = 10

        for sub in [brand, trailing] {
            sub.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(sub)
        }
        let gutter = ContinuityTheme.Metrics.gutter
        NSLayoutConstraint.activate([
            brand.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: gutter),
            brand.centerYAnchor.constraint(equalTo: trailing.centerYAnchor),
            trailing.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 6),
            trailing.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -gutter + 4),
        ])
        headerBottom = trailing.bottomAnchor
    }

    private var headerBottom: NSLayoutYAxisAnchor!

    private func configureCircleButton(_ button: UIButton, symbol: String) {
        var config = button.configuration ?? .glass()
        config.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 15, weight: .medium))
        config.baseForegroundColor = ContinuityTheme.Color.ink
        config.cornerStyle = .capsule
        button.configuration = config
        button.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            button.widthAnchor.constraint(equalToConstant: ContinuityTheme.Metrics.controlSize),
            button.heightAnchor.constraint(equalToConstant: ContinuityTheme.Metrics.controlSize),
        ])
    }

    private func buildLanding() {
        let returning = AskScreenCoordinator.isReturningUser
        greetingLabel.font = ContinuityTheme.Font.text(15, weight: .medium)
        greetingLabel.textColor = ContinuityTheme.Color.teal
        greetingLabel.text = returning ? "\(Self.greeting()). Welcome back." : nil
        greetingLabel.isHidden = !returning

        let paragraph = NSMutableParagraphStyle()
        paragraph.lineHeightMultiple = 0.9
        headlineLabel.numberOfLines = 0
        headlineLabel.attributedText = NSAttributedString(string: "Knowledge\nmoves forward.", attributes: [
            .font: ContinuityTheme.Font.display(returning ? 38 : 46, weight: .regular),
            .foregroundColor: ContinuityTheme.Color.ink,
            .kern: -1.0,
            .paragraphStyle: paragraph,
        ])
        subtitleLabel.numberOfLines = 0
        subtitleLabel.font = ContinuityTheme.Font.text(17)
        subtitleLabel.textColor = ContinuityTheme.Color.secondaryInk
        subtitleLabel.text = "Ask what your organization already knows."

        heroStack.axis = .vertical
        heroStack.spacing = 12
        heroStack.addArrangedSubview(greetingLabel)
        heroStack.addArrangedSubview(headlineLabel)
        heroStack.addArrangedSubview(subtitleLabel)
        heroStack.setCustomSpacing(8, after: greetingLabel)
        heroStack.translatesAutoresizingMaskIntoConstraints = false

        hintLabel.font = ContinuityTheme.Font.text(13, weight: .medium)
        hintLabel.textColor = ContinuityTheme.Color.secondaryInk.withAlphaComponent(0.85)
        hintLabel.textAlignment = .center
        hintLabel.text = "Hold to speak  ·  Drag to turn"
        hintLabel.translatesAutoresizingMaskIntoConstraints = false

        knotView.translatesAutoresizingMaskIntoConstraints = false
        suggestions.translatesAutoresizingMaskIntoConstraints = false

        // The knot sits behind the headline so the composition overlaps, full-bleed.
        view.addSubview(knotView)
        view.addSubview(heroStack)
        view.addSubview(hintLabel)
        view.addSubview(suggestions)

        let gutter = ContinuityTheme.Metrics.gutter
        knotFillsLanding = knotView.bottomAnchor.constraint(equalTo: suggestions.topAnchor, constant: -20)
        knotCondensed = knotView.heightAnchor.constraint(equalToConstant: 104)
        knotBelowHero = knotView.topAnchor.constraint(equalTo: heroStack.bottomAnchor, constant: -8)
        knotBelowHeader = knotView.topAnchor.constraint(equalTo: headerBottom, constant: 2)
        NSLayoutConstraint.activate([
            heroStack.topAnchor.constraint(equalTo: headerBottom, constant: 26),
            heroStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: gutter),
            heroStack.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -gutter),

            knotView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            knotView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            knotBelowHero,
            knotFillsLanding,

            hintLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            hintLabel.bottomAnchor.constraint(equalTo: knotView.bottomAnchor, constant: 4),

            suggestions.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            suggestions.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
    }

    private func buildConversation() {
        conversationView.translatesAutoresizingMaskIntoConstraints = false
        conversationView.alpha = 0
        conversationView.isHidden = true
        view.insertSubview(conversationView, belowSubview: knotView)
        NSLayoutConstraint.activate([
            conversationView.topAnchor.constraint(equalTo: knotView.bottomAnchor),
            conversationView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            conversationView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            conversationView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    private func buildComposer() {
        composer.translatesAutoresizingMaskIntoConstraints = false
        errorNotice.translatesAutoresizingMaskIntoConstraints = false
        errorNotice.alpha = 0
        errorNotice.isHidden = true
        view.addSubview(errorNotice)
        view.addSubview(composer)
        NSLayoutConstraint.activate([
            composer.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            composer.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            composer.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -10),
            suggestions.bottomAnchor.constraint(equalTo: composer.topAnchor, constant: -14),
            errorNotice.leadingAnchor.constraint(equalTo: composer.leadingAnchor),
            errorNotice.trailingAnchor.constraint(equalTo: composer.trailingAnchor),
            errorNotice.bottomAnchor.constraint(equalTo: composer.topAnchor, constant: -12),
        ])
        view.keyboardLayoutGuide.usesBottomSafeArea = true
    }

    private func wire() {
        knotView.audioSource = { [capture = coordinator.capture] in capture.currentFeatures() }
        knotView.onHoldBegan = { [weak self] in
            guard let self, !self.coordinator.state.isCapturing else { return }
            self.heldToTalk = true
            self.dismissHint()
            self.coordinator.toggleMicrophone()
        }
        knotView.onHoldEnded = { [weak self] in
            guard let self, self.heldToTalk else { return }
            self.heldToTalk = false
            if self.coordinator.state.isCapturing { self.coordinator.toggleMicrophone() }
        }
        knotView.onTap = { [weak self] in self?.dismissHint() }

        composer.onSend = { [weak self] text in self?.send(text) }
        composer.onMicTap = { [weak self] in
            guard let self else { return }
            if !self.coordinator.state.isCapturing {
                UIImpactFeedbackGenerator(style: .soft, view: self.composer).impactOccurred()
            }
            self.coordinator.toggleMicrophone()
        }
        composer.onFocusChange = { [weak self] focused in self?.coordinator.setEditing(focused) }
        composer.onTextChange = { [weak self] text in self?.coordinator.draft = text }

        suggestions.onSelect = { [weak self] suggestion in
            self?.composer.text = suggestion.text
            self?.send(suggestion.text)
        }

        conversationView.onRetry = { [weak self] id in self?.coordinator.retry(id) }
        conversationView.onOpenCitation = { citation in
            if let url = citation.url { UIApplication.shared.open(url) }
        }

        newPromptButton.addAction(UIAction { [weak self] _ in
            self?.coordinator.newConversation()
        }, for: .primaryActionTriggered)

        errorNotice.onAction = { [weak self] in self?.coordinator.recover() }
        coordinator.onSignInRequested = { [weak self] in self?.presentSignIn() }
        errorNotice.onDismiss = { [weak self] in self?.coordinator.dismissError() }

        historyButton.menu = UIMenu(children: [UIDeferredMenuElement.uncached { [weak self] completion in
            completion(self?.historyMenuElements() ?? [])
        }])
    }

    private func dismissHint() {
        guard hintLabel.alpha > 0 else { return }
        UIView.animate(withDuration: 0.4) { self.hintLabel.alpha = 0 }
    }

    private func historyMenuElements() -> [UIMenuElement] {
        var elements: [UIMenuElement] = [
            UIAction(title: "New conversation", image: UIImage(systemName: "square.and.pencil")) { [weak self] _ in
                self?.coordinator.newConversation()
            },
        ]
        let recent = coordinator.recentPrompts.prefix(8).map { prompt in
            UIAction(title: prompt, image: UIImage(systemName: "text.bubble")) { [weak self] _ in
                self?.coordinator.newConversation()
                self?.send(prompt)
            }
        }
        if !recent.isEmpty {
            elements.append(UIMenu(title: "Asked this session", options: .displayInline, children: recent))
        }
        let account: UIAction = if let user = coordinator.user {
            UIAction(title: "Sign out", subtitle: user.email, image: UIImage(systemName: "rectangle.portrait.and.arrow.right")) { [weak self] _ in
                guard let self else { return }
                coordinator.signOut()
                suggestions.setSuggestions(Suggestion.defaults, animated: true)
            }
        } else {
            UIAction(title: "Sign in to OrgFlow", image: UIImage(systemName: "person.crop.circle")) { [weak self] _ in
                self?.presentSignIn()
            }
        }
        elements.append(UIMenu(options: .displayInline, children: [account]))
        return elements
    }

    private func send(_ text: String) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        UIImpactFeedbackGenerator(style: .light, view: composer).impactOccurred()
        coordinator.submit(text)
        composer.reset()
        knotView.pulse()
    }

    // MARK: - State

    override func updateProperties() {
        super.updateProperties()
        let state = coordinator.state
        let entries = coordinator.entries
        let conversation = coordinator.isConversationActive
        let transcript = coordinator.transcript
        workspaceLabel.text = coordinator.user?.name ?? "Demo workspace"

        // Transcript is shown live while capturing; once finalized it becomes editable draft text.
        if transcript != lastTranscript {
            if let transcript {
                composer.setTranscript(transcript)
            } else if lastTranscript != nil {
                composer.setTranscript(nil)
                composer.text = coordinator.draft
            }
            lastTranscript = transcript
        }

        if entries != appliedEntries {
            conversationView.apply(entries, animated: appliedConversation == true)
            appliedEntries = entries
        }

        guard state != appliedState || conversation != appliedConversation else { return }
        let animated = appliedState != nil
        appliedState = state
        let conversationChanged = conversation != appliedConversation
        appliedConversation = conversation

        composer.isListening = state.isCapturing
        composer.isSendEnabled = state != .thinking && state != .responding && state != .transcribing
        composer.statusText = statusText(for: state)
        knotView.mode = knotMode(for: state, conversation: conversation)
        knotView.condensation = conversation ? 1 : 0
        knotView.isTouchEnabled = !conversation

        let changes = { self.applyLayout(state: state, conversation: conversation) }
        if animated {
            UIView.animate(springDuration: conversationChanged ? 0.7 : 0.45, bounce: 0.1, options: [.allowUserInteraction, .beginFromCurrentState], animations: changes) { [weak self] _ in
                self?.refreshKnotBackdrop()
            }
        } else {
            changes()
        }
        if conversationChanged {
            suggestions.setRevealed(!conversation, animated: animated)
        }
    }

    private func applyLayout(state: AskViewState, conversation: Bool) {
        let typing = state == .typing && !conversation

        let landing: [NSLayoutConstraint] = [knotFillsLanding, knotBelowHero]
        let condensed: [NSLayoutConstraint] = [knotCondensed, knotBelowHeader]
        NSLayoutConstraint.deactivate(conversation ? landing : condensed)
        NSLayoutConstraint.activate(conversation ? condensed : landing)

        setVisible(heroStack, !conversation)
        setVisible(subtitleLabel, !typing)
        hintLabel.isHidden = conversation || typing
        setVisible(conversationView, conversation)
        setVisible(newPromptButton, conversation)
        workspaceLabel.alpha = conversation ? 0 : 1

        // Typing: the headline steps back so the keyboard and the knot share the space.
        headlineLabel.transform = typing ? CGAffineTransform(scaleX: 0.78, y: 0.78).translatedBy(x: -headlineLabel.bounds.width * 0.14, y: -headlineLabel.bounds.height * 0.14) : .identity
        heroStack.alpha = conversation ? 0 : (typing ? 0.9 : 1)

        floorWash.opacity = conversation ? 0.6 : 1

        if case .error(let error) = state, !isAgentError(error) {
            errorNotice.configure(with: error)
            setVisible(errorNotice, true)
        } else {
            setVisible(errorNotice, false)
        }
        view.layoutIfNeeded()
    }

    private func isAgentError(_ error: AskError) -> Bool {
        if case .agentUnavailable = error { true } else { false }
    }

    /// Only write `isHidden` on change: repeated writes inside animations desynchronize UIStackView.
    private func setVisible(_ view: UIView, _ visible: Bool) {
        if view.isHidden == visible { view.isHidden = !visible }
        view.alpha = visible ? 1 : 0
    }

    private func knotMode(for state: AskViewState, conversation: Bool) -> LivingThreadMode {
        return switch state {
        case .idle, .error: conversation ? .responding : .idle
        case .typing: .quiet
        case .listening: .listening
        case .transcribing: .quiet
        case .thinking: .thinking
        case .responding: .responding
        }
    }

    private func statusText(for state: AskViewState) -> String? {
        switch state {
        case .listening(let speech):
            if !coordinator.transcriptionAvailable { return "Listening · transcription unavailable" }
            if heldToTalk { return speech ? "Listening · release to finish" : "Listening · keep holding" }
            return speech ? "Listening · hearing you" : "Listening"
        case .transcribing: return "Finishing transcript"
        default: return nil
        }
    }

    // MARK: - Layout

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let knot = knotView.frame
        let w = view.bounds.width
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let size = w * 1.25
        tealField.frame = CGRect(x: -size * 0.45, y: knot.midY - size * 0.55, width: size, height: size)
        lavenderField.frame = CGRect(x: w - size * 0.55, y: knot.midY - size * 0.4, width: size, height: size)
        apricotField.frame = CGRect(x: w * 0.5 - size * 0.35, y: knot.midY - size * 0.2, width: size * 0.7, height: size * 0.7)
        let floorTop = suggestions.frame.minY - 60
        floorWash.frame = CGRect(x: 0, y: floorTop, width: w, height: view.bounds.height - floorTop)
        CATransaction.commit()

        if knotView.frame != backdropFrame {
            backdropFrame = knotView.frame
            DispatchQueue.main.async { [weak self] in self?.refreshKnotBackdrop() }
        }

        let composerTop = composer.convert(composer.bounds, to: view).minY
        conversationView.contentInsetBottom = max(0, view.bounds.height - composerTop) + 16 - view.safeAreaInsets.bottom
    }

    /// Snapshots the page behind the knot so its glass can refract the real headline and color fields.
    private func refreshKnotBackdrop() {
        let frame = knotView.frame
        guard frame.width > 1, frame.height > 1, view.window != nil else { return }
        let format = UIGraphicsImageRendererFormat()
        format.scale = traitCollection.displayScale
        format.opaque = true
        let hidden = [knotView, hintLabel, composer, suggestions, errorNotice]
        let wasHidden = hidden.map(\.isHidden)
        hidden.forEach { $0.isHidden = true }
        let image = UIGraphicsImageRenderer(bounds: frame, format: format).image { context in
            ContinuityTheme.Color.canvas.setFill()
            context.fill(frame)
            view.layer.render(in: context.cgContext)
        }
        zip(hidden, wasHidden).forEach { $0.isHidden = $1 }
        knotView.setBackdrop(image.cgImage)
    }

    private static func greeting() -> String {
        switch Calendar.current.component(.hour, from: .now) {
        case 5..<12: "Good morning"
        case 12..<17: "Good afternoon"
        default: "Good evening"
        }
    }
}

/// Compact recovery notice for voice errors, suspended above the composer.
private final class ErrorNoticeView: UIView {
    var onAction: (() -> Void)?
    var onDismiss: (() -> Void)?

    private let glass = UIVisualEffectView(effect: ContinuityTheme.glassEffect(interactive: false))
    private let titleLabel = UILabel()
    private let messageLabel = UILabel()
    private let actionButton = UIButton(configuration: .prominentGlass())
    private let dismissButton = UIButton(configuration: .plain())

    override init(frame: CGRect) {
        super.init(frame: frame)
        glass.translatesAutoresizingMaskIntoConstraints = false
        glass.layer.cornerRadius = 22
        glass.layer.cornerCurve = .continuous
        glass.clipsToBounds = true
        addSubview(glass)

        titleLabel.font = ContinuityTheme.Font.text(15, weight: .semibold)
        titleLabel.textColor = ContinuityTheme.Color.ink
        messageLabel.font = ContinuityTheme.Font.text(14)
        messageLabel.textColor = ContinuityTheme.Color.secondaryInk
        messageLabel.numberOfLines = 0

        actionButton.configuration?.baseBackgroundColor = ContinuityTheme.Color.teal
        actionButton.configuration?.cornerStyle = .capsule
        actionButton.addAction(UIAction { [weak self] _ in self?.onAction?() }, for: .primaryActionTriggered)
        dismissButton.configuration?.image = UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 12, weight: .semibold))
        dismissButton.configuration?.baseForegroundColor = ContinuityTheme.Color.secondaryInk
        dismissButton.addAction(UIAction { [weak self] _ in self?.onDismiss?() }, for: .primaryActionTriggered)

        let text = UIStackView(arrangedSubviews: [titleLabel, messageLabel])
        text.axis = .vertical
        text.spacing = 2
        let row = UIStackView(arrangedSubviews: [text, actionButton, dismissButton])
        row.spacing = 10
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        actionButton.setContentCompressionResistancePriority(.required, for: .horizontal)
        glass.contentView.addSubview(row)

        NSLayoutConstraint.activate([
            glass.topAnchor.constraint(equalTo: topAnchor),
            glass.bottomAnchor.constraint(equalTo: bottomAnchor),
            glass.leadingAnchor.constraint(equalTo: leadingAnchor),
            glass.trailingAnchor.constraint(equalTo: trailingAnchor),
            row.topAnchor.constraint(equalTo: glass.contentView.topAnchor, constant: 12),
            row.bottomAnchor.constraint(equalTo: glass.contentView.bottomAnchor, constant: -12),
            row.leadingAnchor.constraint(equalTo: glass.contentView.leadingAnchor, constant: 16),
            row.trailingAnchor.constraint(equalTo: glass.contentView.trailingAnchor, constant: -8),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func configure(with error: AskError) {
        titleLabel.text = error.title
        messageLabel.text = error.message
        actionButton.configuration?.title = error.recoveryTitle
    }
}
