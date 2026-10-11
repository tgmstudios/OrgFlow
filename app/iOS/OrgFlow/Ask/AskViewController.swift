import UIKit

/// The primary screen. A full-bleed composition around the Continuity Knot — a touchable,
/// voice-reactive object — that condenses into a header band when the conversation begins.
/// Three modes share it: Ask (answers from approved knowledge), Capture (narrate a process into a
/// playbook draft) and Handoff (narrate a role into a handoff and onboarding guide).
final class AskViewController: UIViewController {
    private let coordinator: AskScreenCoordinator
    /// Opens the Knowledge map tab ("Who owns what" in Handoff).
    var onShowKnowledgeMap: (() -> Void)?
    /// After signing in, so the other tabs can reload.
    var onSignedIn: (() -> Void)?

    // Header
    private let wordmark = UILabel()
    private let workspaceLabel = UILabel()
    private let historyButton = UIButton(configuration: .glass())
    private let newPromptButton = UIButton(configuration: .glass())

    // Landing
    private let greetingLabel = UILabel()
    private let headlineLabel = UILabel()
    private let subtitleLabel = UILabel()
    private let heroStack = UIStackView()
    private let modeControl = UISegmentedControl(items: AskMode.allCases.map(\.title))
    private let knotView = LivingThreadView()
    private let hintLabel = UILabel()
    private let suggestions = SuggestionCapsulesView(suggestions: Suggestion.defaults, horizontalInset: ContinuityTheme.Metrics.gutter)

    // Conversation
    private let conversationView = ConversationContentView()
    private let composer = PromptComposerView()
    private let errorNotice = ErrorNoticeView()

    // Voice (Capture and Handoff). Talking with OrgFlow replaces the text field with live captions and
    // call controls; Dictate keeps the text field. A pair of glass pills chooses between them.
    private let voiceRow = UIStackView()
    private let captionLabel = UILabel()
    private let startTalkingButton = UIButton(configuration: .prominentGlass())
    private let muteButton = UIButton(configuration: .glass())
    private let doneButton = UIButton(configuration: .prominentGlass())
    private let callControls = UIStackView()
    private let stylePills = UIStackView()
    private var stylePillButtons: [VoiceStyle: UIButton] = [:]
    private var suggestionsAboveVoiceRow: NSLayoutConstraint!
    private var suggestionsAboveComposer: NSLayoutConstraint!
    private var voiceRowAboveComposer: NSLayoutConstraint!
    private var voiceRowAtBottom: NSLayoutConstraint!
    private var appliedVoiceLayout: VoiceLayout?

    private enum VoiceLayout: Equatable {
        case hidden            // Ask: text field only
        case dictation         // pills above the text field
        case talkIdle          // no text field: Start talking + pills
        case talking           // no text field: captions + Mute / Done
    }

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
    private var appliedMode: AskMode?
    /// Ask suggestions: starters until the workspace's own are written on device.
    private var askSuggestions = Suggestion.defaults
    /// Recurring workflows found in indexed email and documents, offered in Capture.
    private var candidates: [PlaybookCandidate] = []
    /// The organization's people, for Handoff's interview capsules.
    private var people: [Person] = []
    private var appliedPlanTitle: String?
    private var hasAppeared = false
    private let draftingIndicator = UIActivityIndicatorView(style: .medium)

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
              let workspace = try? await OrgFlowAPI.shared.workspace() else { return }
        setPeople(workspace.people)
        setCandidates(workspace.suggestedCandidates)
        guard let generated = await SuggestionGenerator.suggestions(for: workspace.summary) else { return }
        askSuggestions = generated
        if coordinator.mode == .ask { suggestions.setSuggestions(generated, animated: true) }
    }

    /// Refreshes only the suggested playbooks (cheap; no on-device generation).
    private func loadCandidates() async {
        guard coordinator.user != nil, let workspace = try? await OrgFlowAPI.shared.workspace() else { return }
        setPeople(workspace.people)
        setCandidates(workspace.suggestedCandidates)
    }

    private func setPeople(_ new: [Person]) {
        guard new != people else { return }
        people = new
        if coordinator.mode == .handoff { suggestions.setSuggestions(capsules(for: .handoff), animated: true) }
    }

    /// Handoff's transfer actions: the loaded interview plan, or interviews with people who are
    /// leaving, then the knowledge map.
    private func handoffCapsules() -> [Suggestion] {
        var capsules: [Suggestion] = []
        if let plan = coordinator.interviewPlan {
            capsules.append(Suggestion(symbol: "list.bullet.clipboard", text: "Interview plan · \(plan.questions.count) questions", action: .showInterviewPlan))
        } else {
            for person in people.filter({ $0.isDeparting && !$0.hasLeft }).prefix(2) {
                capsules.append(Suggestion(symbol: "waveform", text: "Plan \(person.firstName)'s handoff interview", action: .planInterview(personID: person.id)))
            }
        }
        if coordinator.user != nil {
            capsules.append(Suggestion(symbol: "point.3.connected.trianglepath.dotted", text: "Who owns what", action: .knowledgeMap))
        }
        return capsules
    }

    private func perform(_ action: SuggestionAction) {
        switch action {
        case .planInterview(let personID):
            UIImpactFeedbackGenerator(style: .light, view: view).impactOccurred()
            draftingIndicator.startAnimating()
            InterviewPlanViewController.present(personID: personID, from: presenter, onLoaded: { [weak self] in
                self?.draftingIndicator.stopAnimating()
            }, onStart: { [weak self] plan in
                self?.beginInterview(plan)
            })
        case .showInterviewPlan:
            guard let plan = coordinator.interviewPlan else { return }
            let controller = InterviewPlanViewController(plan: plan)
            controller.onStart = { [weak self] plan in self?.beginInterview(plan) }
            controller.onRemove = { [weak self] in
                self?.coordinator.clearInterviewPlan()
                self?.presenter.dismiss(animated: true)
            }
            controller.sheetPresentationController?.prefersGrabberVisible = true
            presenter.present(controller, animated: true)
        case .knowledgeMap:
            if let onShowKnowledgeMap {
                onShowKnowledgeMap()
                return
            }
            let map = KnowledgeMapViewController(workspace: nil)
            map.onStartInterview = { [weak self] plan in self?.beginInterview(plan) }
            map.onSignInRequested = { [weak self] in self?.presentSignIn() }
            presenter.present(UINavigationController(rootViewController: map), animated: true)
        }
    }

    /// Closes whatever is showing, loads the plan into Handoff and starts the call with OrgFlow.
    func beginInterview(_ plan: InterviewPlan) {
        let start = { [weak self] in
            guard let self else { return }
            coordinator.loadInterviewPlan(plan)
            guard coordinator.interviewPlan != nil, !coordinator.state.isInterviewing else { return }
            dismissHint()
            startTalking()
        }
        if presentedViewController != nil {
            dismiss(animated: true, completion: start)
        } else {
            start()
        }
    }

    private func setCandidates(_ new: [PlaybookCandidate]) {
        candidates = new
        if coordinator.mode == .capture { suggestions.setSuggestions(capsules(for: .capture), animated: true) }
    }

    private func capsules(for mode: AskMode) -> [Suggestion] {
        switch mode {
        case .ask: askSuggestions
        case .capture: candidates.prefix(3).map { Suggestion(symbol: "sparkles", text: $0.title, candidateID: $0.id) } + Self.starters(for: .capture)
        case .handoff: handoffCapsules() + Self.starters(for: .handoff)
        }
    }

    private func confirmDraft(candidateID: String) {
        guard let candidate = candidates.first(where: { $0.id == candidateID }) else { return }
        let count = candidate.evidence.count
        let noun = count == 1 ? "email or document" : "emails and documents"
        let alert = UIAlertController(
            title: "Draft a playbook from \(count) \(noun)?",
            message: "\u{201C}\(candidate.title)\u{201D} is drafted from indexed text and saved for your team to approve.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        alert.addAction(UIAlertAction(title: "Draft playbook", style: .default) { [weak self] _ in self?.draft(candidate) })
        presenter.present(alert, animated: true)
    }

    private func draft(_ candidate: PlaybookCandidate) {
        suggestions.isUserInteractionEnabled = false
        draftingIndicator.startAnimating()
        Task {
            defer {
                draftingIndicator.stopAnimating()
                suggestions.isUserInteractionEnabled = true
            }
            do {
                let result = try await OrgFlowAPI.shared.draftCandidate(id: candidate.id)
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                setCandidates(candidates.filter { $0.id != candidate.id })
                let article = ArticleViewController(article: result.draft, workspace: nil)
                article.onPublished = { [coordinator] published in coordinator.markPublished(published) }
                presenter.present(UINavigationController(rootViewController: article), animated: true)
            } catch let error as OrgFlowAPIError where error == .signInRequired {
                presentSignIn()
            } catch {
                UINotificationFeedbackGenerator().notificationOccurred(.error)
                let alert = UIAlertController(title: "Couldn't draft the playbook", message: error.localizedDescription, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "OK", style: .default))
                presenter.present(alert, animated: true)
            }
        }
    }

    /// The view controller to present from: the top of whatever sheet is showing.
    private var presenter: UIViewController {
        var top: UIViewController = self
        while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
        return top
    }

    func presentSignIn() {
        guard !(presenter is SignInViewController) else { return }
        let signIn = SignInViewController()
        signIn.onSignedIn = { [weak self] user in
            guard let self else { return }
            coordinator.didSignIn(user)
            onSignedIn?()
            Task { await self.loadSuggestions() }
        }
        signIn.sheetPresentationController?.detents = [.large()]
        signIn.sheetPresentationController?.prefersGrabberVisible = true
        presenter.present(signIn, animated: true)
    }

    private func presentArticle(id: String) {
        let article = ArticleViewController(articleID: id)
        article.onPublished = { [weak self] published in self?.coordinator.markPublished(published) }
        presenter.present(UINavigationController(rootViewController: article), animated: true)
    }

    /// Capture and Handoff starters: tapping one begins the narration with its topic and starts listening.
    private static func starters(for mode: AskMode) -> [Suggestion] {
        switch mode {
        case .ask: []
        case .capture: [
            Suggestion(symbol: "heart.text.square", text: "How we thank donors"),
            Suggestion(symbol: "calendar", text: "Our month-end close"),
            Suggestion(symbol: "person.badge.plus", text: "Onboarding a volunteer"),
        ]
        case .handoff: [
            Suggestion(symbol: "calendar", text: "What I do each week"),
            Suggestion(symbol: "person.2", text: "Who I work with"),
            Suggestion(symbol: "folder", text: "Where everything lives"),
        ]
        }
    }

    private func applyMode(_ mode: AskMode, animated: Bool) {
        modeControl.selectedSegmentIndex = mode.rawValue
        let copy: (headline: String, subtitle: String, placeholder: String) = switch mode {
        case .ask: ("Knowledge\nmoves forward.", "Ask what your organization already knows.", "Ask OneFlow anything…")
        case .capture: ("Show how the\nwork gets done.", "Talk through a process. OneFlow drafts the playbook, and your team approves it.", "Describe a process…")
        case .handoff:
            if let plan = coordinator.interviewPlan {
                ("Leave it in\ngood hands.", "\(plan.title) is ready: \(plan.questions.count) questions, gaps first. Start talking and OneFlow leads.", "Describe your role…")
            } else {
                ("Leave it in\ngood hands.", "Walk through your role. OneFlow drafts a handoff and onboarding guide for whoever's next.", "Describe your role…")
            }
        }
        let update = {
            let attributes = self.headlineLabel.attributedText?.attributes(at: 0, effectiveRange: nil) ?? [:]
            self.headlineLabel.attributedText = NSAttributedString(string: copy.headline, attributes: attributes)
            self.subtitleLabel.text = copy.subtitle
        }
        if animated {
            UIView.transition(with: heroStack, duration: 0.3, options: [.transitionCrossDissolve, .allowUserInteraction], animations: update)
        } else {
            update()
        }
        composer.placeholder = copy.placeholder
        suggestions.setSuggestions(capsules(for: mode), animated: animated)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        refreshKnotBackdrop()
        if hasAppeared { Task { await loadCandidates() } }
        hasAppeared = true
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
        wordmark.attributedText = NSAttributedString(string: "OneFlow", attributes: [
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
        let brand = UIStackView(arrangedSubviews: [names])
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

        modeControl.selectedSegmentIndex = AskMode.ask.rawValue
        modeControl.setTitleTextAttributes([.font: ContinuityTheme.Font.text(14, weight: .semibold), .foregroundColor: ContinuityTheme.Color.ink], for: .selected)
        modeControl.setTitleTextAttributes([.font: ContinuityTheme.Font.text(14, weight: .medium), .foregroundColor: ContinuityTheme.Color.secondaryInk], for: .normal)
        let modeRow = UIStackView(arrangedSubviews: [modeControl, UIView()])
        modeRow.axis = .horizontal

        heroStack.axis = .vertical
        heroStack.spacing = 12
        heroStack.addArrangedSubview(modeRow)
        heroStack.setCustomSpacing(22, after: modeRow)
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
        draftingIndicator.hidesWhenStopped = true
        draftingIndicator.color = ContinuityTheme.Color.teal
        draftingIndicator.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(draftingIndicator)
        NSLayoutConstraint.activate([
            draftingIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            draftingIndicator.bottomAnchor.constraint(equalTo: suggestions.topAnchor, constant: -12),
        ])

        let gutter = ContinuityTheme.Metrics.gutter
        knotFillsLanding = knotView.bottomAnchor.constraint(equalTo: suggestions.topAnchor, constant: -20)
        knotCondensed = knotView.heightAnchor.constraint(equalToConstant: 104)
        knotBelowHero = knotView.topAnchor.constraint(equalTo: heroStack.bottomAnchor, constant: -8)
        knotBelowHeader = knotView.topAnchor.constraint(equalTo: headerBottom, constant: 2)
        NSLayoutConstraint.activate([
            heroStack.topAnchor.constraint(equalTo: headerBottom, constant: 18),
            heroStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: gutter),
            heroStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -gutter),

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
            errorNotice.leadingAnchor.constraint(equalTo: composer.leadingAnchor),
            errorNotice.trailingAnchor.constraint(equalTo: composer.trailingAnchor),
            errorNotice.bottomAnchor.constraint(equalTo: composer.topAnchor, constant: -12),
        ])
        view.keyboardLayoutGuide.usesBottomSafeArea = true
        buildVoiceRow()
    }

    private func buildVoiceRow() {
        func capsule(_ button: UIButton, title: String, symbol: String, prominent: Bool) {
            var config = button.configuration ?? (prominent ? .prominentGlass() : .glass())
            config.cornerStyle = .capsule
            config.baseBackgroundColor = prominent ? ContinuityTheme.Color.teal : nil
            config.baseForegroundColor = prominent ? .white : ContinuityTheme.Color.ink
            config.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .semibold))
            config.imagePadding = 7
            config.attributedTitle = AttributedString(title, attributes: AttributeContainer([.font: ContinuityTheme.Font.text(16, weight: .semibold)]))
            config.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 18, bottom: 12, trailing: 20)
            button.configuration = config
        }
        capsule(startTalkingButton, title: "Start talking", symbol: "waveform", prominent: true)
        capsule(muteButton, title: "Mute", symbol: "mic.fill", prominent: false)
        capsule(doneButton, title: "Done", symbol: "checkmark", prominent: true)

        // Style pills: the selected one is prominent glass, the other plain glass.
        stylePills.axis = .horizontal
        stylePills.spacing = 8
        for style in VoiceStyle.allCases {
            let button = UIButton(configuration: .glass())
            button.addAction(UIAction { [weak self] _ in
                guard let self, coordinator.voiceStyle != style else { return }
                UISelectionFeedbackGenerator().selectionChanged()
                coordinator.voiceStyle = style
            }, for: .primaryActionTriggered)
            stylePillButtons[style] = button
            stylePills.addArrangedSubview(button)
        }
        styleStylePills()

        captionLabel.numberOfLines = 3
        captionLabel.textAlignment = .center
        captionLabel.font = ContinuityTheme.Font.display(19)
        captionLabel.textColor = ContinuityTheme.Color.ink
        captionLabel.lineBreakMode = .byTruncatingHead

        callControls.axis = .horizontal
        callControls.spacing = 10
        callControls.addArrangedSubview(muteButton)
        callControls.addArrangedSubview(doneButton)

        voiceRow.axis = .vertical
        voiceRow.alignment = .center
        voiceRow.spacing = 14
        for sub in [captionLabel, startTalkingButton, callControls, stylePills] as [UIView] {
            voiceRow.addArrangedSubview(sub)
            sub.isHidden = true
        }
        captionLabel.widthAnchor.constraint(equalTo: voiceRow.widthAnchor, constant: -24).isActive = true
        voiceRow.translatesAutoresizingMaskIntoConstraints = false
        voiceRow.alpha = 0
        voiceRow.isHidden = true
        view.addSubview(voiceRow)
        suggestionsAboveVoiceRow = suggestions.bottomAnchor.constraint(equalTo: voiceRow.topAnchor, constant: -14)
        suggestionsAboveComposer = suggestions.bottomAnchor.constraint(equalTo: composer.topAnchor, constant: -14)
        voiceRowAboveComposer = voiceRow.bottomAnchor.constraint(equalTo: composer.topAnchor, constant: -12)
        voiceRowAtBottom = voiceRow.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8)
        NSLayoutConstraint.activate([
            voiceRow.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            voiceRow.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            voiceRowAboveComposer,
            suggestionsAboveComposer,
        ])
    }

    private func styleStylePills() {
        for (style, button) in stylePillButtons {
            let selected = style == coordinator.voiceStyle
            var config: UIButton.Configuration = selected ? .prominentGlass() : .glass()
            config.cornerStyle = .capsule
            config.baseBackgroundColor = selected ? ContinuityTheme.Color.primary : nil
            config.baseForegroundColor = selected ? .white : ContinuityTheme.Color.secondaryInk
            config.image = UIImage(systemName: style == .conversation ? "bubble.left.and.text.bubble.right" : "text.cursor",
                                   withConfiguration: UIImage.SymbolConfiguration(pointSize: 12, weight: .semibold))
            config.imagePadding = 6
            config.attributedTitle = AttributedString(style.title, attributes: AttributeContainer([.font: ContinuityTheme.Font.text(13, weight: .semibold)]))
            config.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 13, bottom: 8, trailing: 14)
            button.configuration = config
        }
    }

    private func voiceLayout() -> VoiceLayout {
        if coordinator.state.isInterviewing { return .talking }
        if coordinator.state.isCapturing { return .hidden }
        return coordinator.voiceStyle == .conversation ? .talkIdle : .dictation
    }

    /// Applies the voice layout for the mode, voice style and call state.
    private func applyVoiceRow(animated: Bool) {
        let layout = voiceLayout()
        if case .interviewing(let phase) = coordinator.state {
            let muted = phase == .listening(muted: true)
            muteButton.configuration?.image = UIImage(systemName: muted ? "mic.slash.fill" : "mic.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .semibold))
            muteButton.configuration?.attributedTitle = AttributedString(muted ? "Unmute" : "Mute", attributes: AttributeContainer([.font: ContinuityTheme.Font.text(16, weight: .semibold)]))
            muteButton.isEnabled = phase != .connecting
            captionLabel.text = coordinator.interviewCaption ?? (phase == .connecting ? "Connecting to OneFlow…" : nil)
            captionLabel.textColor = coordinator.interviewCaptionFromAgent ? ContinuityTheme.Color.ink : ContinuityTheme.Color.teal
        }
        hintLabel.text = coordinator.usesInterview ? "Tap to talk with OneFlow  ·  Drag to turn" : "Hold to speak  ·  Drag to turn"
        guard layout != appliedVoiceLayout else { return }
        let first = appliedVoiceLayout == nil
        appliedVoiceLayout = layout
        styleStylePills()
        let composerShown = layout == .hidden || layout == .dictation
        let changes = {
            NSLayoutConstraint.deactivate([self.suggestionsAboveVoiceRow, self.suggestionsAboveComposer, self.voiceRowAboveComposer, self.voiceRowAtBottom])
            NSLayoutConstraint.activate([
                layout == .hidden ? self.suggestionsAboveComposer : self.suggestionsAboveVoiceRow,
                composerShown ? self.voiceRowAboveComposer : self.voiceRowAtBottom,
            ])
            self.setVisible(self.voiceRow, layout != .hidden)
            self.setVisible(self.composer, composerShown)
            self.setVisible(self.captionLabel, layout == .talking)
            self.setVisible(self.callControls, layout == .talking)
            self.setVisible(self.startTalkingButton, layout == .talkIdle)
            self.setVisible(self.stylePills, layout == .talkIdle || layout == .dictation)
            self.view.layoutIfNeeded()
        }
        if !first && animated {
            UIView.animate(springDuration: 0.5, bounce: 0.12, options: [.allowUserInteraction, .beginFromCurrentState], animations: changes)
        } else {
            changes()
        }
    }

    private func wire() {
        knotView.audioSource = { [weak coordinator] in coordinator?.currentVoiceFeatures() ?? .silent }
        knotView.onHoldBegan = { [weak self] in
            guard let self, !self.coordinator.state.isCapturing, !self.coordinator.state.isInterviewing,
                  !self.coordinator.usesInterview else { return }
            self.heldToTalk = true
            self.dismissHint()
            self.coordinator.toggleMicrophone()
        }
        knotView.onHoldEnded = { [weak self] in
            guard let self, self.heldToTalk else { return }
            self.heldToTalk = false
            if self.coordinator.state.isCapturing { self.coordinator.toggleMicrophone() }
        }
        knotView.onTap = { [weak self] in
            guard let self else { return }
            dismissHint()
            // Talking with OrgFlow needs no holding: a tap starts the call.
            if coordinator.usesInterview, !coordinator.state.isInterviewing, voiceLayout() == .talkIdle {
                startTalking()
            }
        }
        startTalkingButton.addAction(UIAction { [weak self] _ in self?.startTalking() }, for: .primaryActionTriggered)
        coordinator.onInterviewFinished = { [weak self] transcript in
            // The call's transcript goes straight to drafting (after consent, the first time).
            self?.send(transcript)
        }
        muteButton.addAction(UIAction { [weak self] _ in
            guard let self, case .interviewing(let phase) = coordinator.state else { return }
            coordinator.setInterviewMuted(phase != .listening(muted: true))
        }, for: .primaryActionTriggered)
        doneButton.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            UIImpactFeedbackGenerator(style: .medium, view: doneButton).impactOccurred()
            coordinator.toggleMicrophone()
        }, for: .primaryActionTriggered)

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
            guard let self else { return }
            if let action = suggestion.action {
                perform(action)
            } else if let candidateID = suggestion.candidateID {
                confirmDraft(candidateID: candidateID)
            } else if coordinator.mode == .ask {
                composer.text = suggestion.text
                send(suggestion.text)
            } else {
                // Begin the narration with the topic, then listen for the rest.
                composer.text = suggestion.text + ": "
                coordinator.draft = composer.text
                dismissHint()
                coordinator.toggleMicrophone()
            }
        }

        modeControl.addAction(UIAction { [weak self] _ in
            guard let self, let mode = AskMode(rawValue: modeControl.selectedSegmentIndex) else { return }
            UISelectionFeedbackGenerator().selectionChanged()
            coordinator.setMode(mode)
            // A refused switch (mid-answer) snaps back.
            modeControl.selectedSegmentIndex = coordinator.mode.rawValue
        }, for: .valueChanged)

        // Swipe down anywhere on the landing to put the keyboard away (the conversation scrolls it away
        // interactively). Recognized alongside the knot's own drag.
        let swipe = UISwipeGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        swipe.direction = .down
        swipe.cancelsTouchesInView = false
        swipe.delegate = self
        view.addGestureRecognizer(swipe)


        conversationView.onRetry = { [weak self] id in self?.coordinator.retry(id) }
        conversationView.onOpenCitation = { [weak self] citation in
            if let url = citation.url {
                UIApplication.shared.open(url)
            } else {
                self?.presentArticle(id: citation.id)
            }
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

    private func startTalking() {
        UIImpactFeedbackGenerator(style: .soft, view: view).impactOccurred()
        coordinator.toggleMicrophone()
    }

    @objc private func dismissKeyboard() {
        composer.blur()
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
        let recent = coordinator.conversations.prefix(10).map { saved in
            let symbol = switch saved.mode {
            case .ask: "text.bubble"
            case .capture: "list.bullet.rectangle"
            case .handoff: "person.2.wave.2"
            }
            let when = saved.updatedAt.formatted(.relative(presentation: .named))
            return UIAction(title: saved.title, subtitle: "\(saved.mode.title) · \(when)", image: UIImage(systemName: symbol)) { [weak self] _ in
                self?.coordinator.restore(saved.id)
            }
        }
        if !recent.isEmpty {
            let clear = UIAction(title: "Clear history", image: UIImage(systemName: "trash"), attributes: .destructive) { [weak self] _ in
                self?.coordinator.clearHistory()
            }
            elements.append(UIMenu(title: "Recent", options: .displayInline, children: recent + [clear]))
        }

        let available = PlaybookDrafter.isOnDeviceAvailable
        let onDevice = UIAction(
            title: "Draft on this iPhone",
            subtitle: available ? "Capture and Handoff use Apple Intelligence" : "Needs Apple Intelligence",
            image: UIImage(systemName: "iphone.gen3"),
            attributes: available ? [] : .disabled,
            state: PlaybookDrafter.prefersOnDevice && available ? .on : .off
        ) { _ in
            PlaybookDrafter.prefersOnDevice.toggle()
        }
        let account: UIAction = if let user = coordinator.user {
            UIAction(title: "Sign out", subtitle: user.email, image: UIImage(systemName: "rectangle.portrait.and.arrow.right")) { [weak self] _ in
                guard let self else { return }
                coordinator.signOut()
                askSuggestions = Suggestion.defaults
                candidates = []
                suggestions.setSuggestions(capsules(for: coordinator.mode), animated: true)
            }
        } else {
            UIAction(title: "Sign in to OneFlow", image: UIImage(systemName: "person.crop.circle")) { [weak self] _ in
                self?.presentSignIn()
            }
        }
        elements.append(UIMenu(options: .displayInline, children: [onDevice, account]))
        return elements
    }

    private func send(_ text: String) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        if coordinator.needsSharingConsent {
            confirmSharing { [weak self] in
                self?.coordinator.grantSharingConsent()
                self?.send(text)
            }
            return
        }
        UIImpactFeedbackGenerator(style: .light, view: composer).impactOccurred()
        coordinator.submit(text)
        composer.reset()
        knotView.pulse()
    }

    /// Matches the web: a narration is only sent to the drafting AI after the person agrees.
    private func confirmSharing(_ confirmed: @escaping () -> Void) {
        let kind = coordinator.mode == .handoff ? "handoff guide" : "playbook"
        let alert = UIAlertController(
            title: "Share with the drafting AI?",
            message: "Your narration is sent to OneFlow's drafting AI to write a \(kind) draft. Nothing is published until someone approves it.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        alert.addAction(UIAlertAction(title: "Share and draft", style: .default) { _ in confirmed() })
        alert.preferredAction = alert.actions.last
        presenter.present(alert, animated: true)
    }

    // MARK: - State

    override func updateProperties() {
        super.updateProperties()
        let state = coordinator.state
        let entries = coordinator.entries
        let conversation = coordinator.isConversationActive
        let transcript = coordinator.transcript
        workspaceLabel.text = coordinator.user?.name ?? "Demo workspace"
        if coordinator.mode != appliedMode {
            applyMode(coordinator.mode, animated: appliedMode != nil)
            appliedMode = coordinator.mode
        }
        let planTitle = coordinator.interviewPlan?.title
        if planTitle != appliedPlanTitle {
            appliedPlanTitle = planTitle
            applyMode(coordinator.mode, animated: true)
        }

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

        _ = coordinator.voiceStyle
        applyVoiceRow(animated: appliedState != nil)

        guard state != appliedState || conversation != appliedConversation else { return }
        let animated = appliedState != nil
        appliedState = state
        let conversationChanged = conversation != appliedConversation
        appliedConversation = conversation

        composer.isListening = state.isCapturing || state.isInterviewing
        composer.isSendEnabled = state != .thinking && state != .responding && state != .transcribing && !state.isInterviewing
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
        // The whole call flows like listening; both voices travel through the thread as light.
        case .interviewing(let phase): phase == .connecting ? .thinking : .listening
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
        case .interviewing(.connecting): return "Connecting to OneFlow…"
        case .interviewing(.listening(let muted)): return muted ? "Muted · tap Unmute to keep talking" : "OneFlow is listening · tap Done when finished"
        case .interviewing(.agentSpeaking): return "OneFlow is speaking"
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

        let composerTop = min(composer.isHidden ? .infinity : composer.convert(composer.bounds, to: view).minY,
                              voiceRow.isHidden ? .infinity : voiceRow.frame.minY)
        conversationView.contentInsetBottom = max(0, view.bounds.height - composerTop) + 16 - view.safeAreaInsets.bottom
    }

    /// Snapshots the page behind the knot so its glass can refract the real headline and color fields.
    /// Only the page itself is drawn: the color fields (layers) and the headline. Every other view is
    /// hidden for the snapshot, because Liquid Glass controls (the voice row, the composer, capsules)
    /// render as solid black outside the compositor and would turn the knot's glass black.
    private func refreshKnotBackdrop() {
        let frame = knotView.frame
        guard frame.width > 1, frame.height > 1, view.window != nil else { return }
        let format = UIGraphicsImageRendererFormat()
        format.scale = traitCollection.displayScale
        format.opaque = true
        let hidden = view.subviews.filter { $0 !== heroStack }
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

extension AskViewController: UIGestureRecognizerDelegate {
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        true
    }
}
