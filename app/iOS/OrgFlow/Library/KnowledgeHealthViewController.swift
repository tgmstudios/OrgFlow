import UIKit

/// Knowledge health (`GET /api/insights/health`): a score out of 100, where memory is thin or stale,
/// what to do next, and each person's risk. Mirrors `frontend/health.tsx`.
final class KnowledgeHealthViewController: UIViewController {
    var onStartInterview: ((InterviewPlan) -> Void)?
    var onWorkspaceChanged: ((Workspace) -> Void)?
    var onSignInRequested: (() -> Void)?

    private var workspace: Workspace?
    private var health: KnowledgeHealth?
    private var busyAction: String?
    private let scrollView = UIScrollView()
    private let stack = UIStackView()
    private let ring = ScoreRingView()
    private var hasAnimatedRing = false
    private var hasAppeared = false

    private static let warnInk = UIColor(hex: 0x9A4B22)
    private static let badInk = UIColor(hex: 0xB4483F)

    init(workspace: Workspace?) {
        self.workspace = workspace
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = ContinuityTheme.Color.canvas
        navigationItem.title = "Knowledge health"
        navigationItem.largeTitleDisplayMode = .never

        scrollView.alwaysBounceVertical = true
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        let refresh = UIRefreshControl()
        refresh.addAction(UIAction { [weak self] _ in self?.load() }, for: .valueChanged)
        scrollView.refreshControl = refresh
        stack.axis = .vertical
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(stack)
        view.addSubview(scrollView)
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 12),
            stack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -32),
            stack.leadingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.trailingAnchor, constant: -16),
        ])
        ring.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([ring.widthAnchor.constraint(equalToConstant: 132), ring.heightAnchor.constraint(equalToConstant: 132)])
        var loading = UIContentUnavailableConfiguration.loading()
        loading.text = "Measuring your organization's memory…"
        contentUnavailableConfiguration = loading
        load()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // A tab: refresh when it comes back, since other screens change the same knowledge.
        if hasAppeared, health != nil { load() }
        hasAppeared = true
    }

    func load() {
        Task {
            defer { scrollView.refreshControl?.endRefreshing() }
            do {
                async let health = OrgFlowAPI.shared.knowledgeHealth()
                async let workspace = OrgFlowAPI.shared.workspace()
                self.health = try await health
                if let fresh = try? await workspace {
                    self.workspace = fresh
                    onWorkspaceChanged?(fresh)
                }
                contentUnavailableConfiguration = nil
                render()
            } catch let error as OrgFlowAPIError where error == .signInRequired {
                showSignIn()
            } catch {
                if health == nil { showError(error) }
            }
        }
    }

    private func showSignIn() {
        var config = UIContentUnavailableConfiguration.empty()
        config.image = UIImage(systemName: "person.crop.circle")
        config.text = "Sign in to see knowledge health"
        config.textProperties.font = ContinuityTheme.Font.display(22, weight: .semibold)
        config.button = .prominentGlass()
        config.button.baseBackgroundColor = ContinuityTheme.Color.teal
        config.button.title = "Sign in"
        config.buttonProperties.primaryAction = UIAction { [weak self] _ in self?.onSignInRequested?() }
        contentUnavailableConfiguration = config
    }

    private func showError(_ error: Error) {
        var config = UIContentUnavailableConfiguration.empty()
        config.image = UIImage(systemName: "exclamationmark.triangle")
        config.text = "Couldn't measure knowledge health"
        config.secondaryText = error.localizedDescription
        config.button = .glass()
        config.button.title = "Retry"
        config.buttonProperties.primaryAction = UIAction { [weak self] _ in self?.load() }
        contentUnavailableConfiguration = config
    }

    // MARK: Rendering

    private enum Tone { case good, fair, poor }

    private func render() {
        guard let health else { return }
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let t = health.totals
        // Someone leaving without a handoff guide keeps the page from reading "good".
        let tone: Tone = health.score >= 75 && t.peopleAtRisk == 0 ? .good : health.score >= 45 ? .fair : .poor

        let eyebrow = MapUI.caption("Is the memory holding?")
        let intro = MapUI.body("Where your organization's know-how is thin, out of date, or concentrated in someone who is leaving.", size: 15)
        let header = UIStackView(arrangedSubviews: [eyebrow, intro])
        header.axis = .vertical
        header.spacing = 6
        header.isLayoutMarginsRelativeArrangement = true
        header.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 8)
        stack.addArrangedSubview(header)

        // Score
        let verdict: String
        if t.published + t.drafts == 0 {
            verdict = "Nothing documented yet"
        } else {
            switch tone {
            case .good: verdict = "Knowledge is in good shape"
            case .fair: verdict = "Some gaps to close"
            case .poor: verdict = "Significant risk of knowledge loss"
            }
        }
        ring.configure(score: health.score)
        let verdictLabel = MapUI.title(verdict, size: 22)
        verdictLabel.textAlignment = .center
        let scoreColumn = UIStackView(arrangedSubviews: [ring, verdictLabel])
        scoreColumn.axis = .vertical
        scoreColumn.alignment = .center
        scoreColumn.spacing = 12
        stack.addArrangedSubview(card([scoreColumn], padding: 22))
        if !hasAnimatedRing {
            hasAnimatedRing = true
            ring.animateIn()
        }

        // Counts
        let stats: [(String, Int, UIColor?)] = [
            ("Published", t.published, nil),
            ("Drafts", t.drafts, t.drafts > 0 ? Self.warnInk : nil),
            ("Overdue review", t.stale, t.stale > 0 ? Self.badInk : nil),
            ("No owner", t.unowned, t.unowned > 0 ? Self.warnInk : nil),
            ("People at risk", t.peopleAtRisk, t.peopleAtRisk > 0 ? Self.badInk : nil),
            ("Source changed", t.sourceChanged, t.sourceChanged > 0 ? Self.warnInk : nil),
        ]
        let grid = UIStackView()
        grid.axis = .vertical
        grid.spacing = 10
        for pair in stride(from: 0, to: stats.count, by: 3) {
            let row = UIStackView(arrangedSubviews: stats[pair..<min(pair + 3, stats.count)].map(statTile))
            row.distribution = .fillEqually
            row.spacing = 10
            grid.addArrangedSubview(row)
        }
        stack.addArrangedSubview(grid)

        // What to do next
        var next: [UIView] = [sectionTitle("What to do next", symbol: "waveform.path.ecg", count: nil)]
        if health.actions.isEmpty {
            next.append(emptyLine("Nothing urgent. Keep capturing and reviewing.", symbol: "checkmark.shield"))
        }
        for action in health.actions { next.append(actionRow(action)) }
        stack.addArrangedSubview(card(next))

        // People
        var people: [UIView] = [sectionTitle("People", symbol: "person.2", count: nil)]
        if health.people.isEmpty {
            people.append(emptyLine("Add people so processes have an owner and a handoff path.", symbol: nil))
        }
        for person in health.people { people.append(personRow(person)) }
        stack.addArrangedSubview(card(people))

        // Lists
        listCard("Overdue for review", empty: "Everything published has been reviewed recently.", rows: health.stale.map {
            ($0.articleId, $0.title, "Due \(Self.day($0.dueAt)) · \(Self.days($0.daysOverdue ?? 0)) overdue")
        })
        listCard("Due in the next 30 days", empty: "Nothing due soon.", rows: health.dueSoon.map {
            ($0.articleId, $0.title, "Due \(Self.day($0.dueAt))")
        })
        listCard("Sources changed since capture", empty: "No captured documents have changed.", warn: true, rows: health.sourceChanged.map {
            ($0.articleId, $0.title, $0.sources.map { $0.title ?? $0.sourceId }.joined(separator: ", "))
        })
        listCard("Processes with no owner", empty: "Every process has an owner.", rows: health.unowned.map {
            ($0.articleId, $0.title, $0.published ? "Published" : "Draft")
        })
        listCard("Drafts waiting 14+ days", empty: "No stuck drafts.", rows: health.stuckDrafts.map {
            ($0.articleId, $0.title, Self.days($0.ageDays) + " old")
        })
        listCard("Quotes that could not be verified", empty: "All AI citations were found in their sources.", warn: true, rows: health.ungrounded.map {
            ($0.articleId, $0.title, "\($0.verified) of \($0.total) verified")
        })
    }

    private func card(_ views: [UIView], padding: CGFloat = 16) -> UIView {
        let inner = UIStackView(arrangedSubviews: views)
        inner.axis = .vertical
        inner.spacing = 4
        inner.isLayoutMarginsRelativeArrangement = true
        inner.directionalLayoutMargins = NSDirectionalEdgeInsets(top: padding, leading: padding, bottom: padding - 4, trailing: padding)
        inner.backgroundColor = .white
        inner.layer.cornerRadius = 22
        inner.layer.cornerCurve = .continuous
        inner.layer.borderWidth = ContinuityTheme.Metrics.hairline * 2
        inner.layer.borderColor = ContinuityTheme.Color.hairline.cgColor
        return inner
    }

    private func statTile(_ stat: (String, Int, UIColor?)) -> UIView {
        let value = UILabel()
        value.text = "\(stat.1)"
        value.font = ContinuityTheme.Font.display(28, weight: .semibold)
        value.textColor = stat.2 ?? ContinuityTheme.Color.ink
        value.setContentHuggingPriority(.required, for: .vertical)
        let label = UILabel()
        label.attributedText = ContinuityTheme.caption(stat.0, color: stat.2 ?? ContinuityTheme.Color.secondaryInk, size: 9)
        label.numberOfLines = 2
        label.adjustsFontSizeToFitWidth = true
        label.minimumScaleFactor = 0.8
        label.setContentHuggingPriority(.required, for: .vertical)
        // Numbers line up across tiles whether the caption takes one line or two.
        let spacer = UIView()
        spacer.setContentHuggingPriority(.defaultLow, for: .vertical)
        let tile = card([value, label, spacer], padding: 12)
        (tile as? UIStackView)?.spacing = 2
        if let color = stat.2 { tile.backgroundColor = color.withAlphaComponent(0.06) }
        return tile
    }

    private func sectionTitle(_ text: String, symbol: String?, count: Int?, warn: Bool = false) -> UIView {
        var views: [UIView] = []
        if let symbol {
            let icon = UIImageView(image: UIImage(systemName: symbol))
            icon.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 14, weight: .semibold)
            icon.tintColor = warn ? ContinuityTheme.Color.apricot : ContinuityTheme.Color.teal
            icon.setContentHuggingPriority(.required, for: .horizontal)
            views.append(icon)
        }
        let label = MapUI.title(text, size: 19)
        views.append(label)
        if let count {
            let flag = UILabel()
            flag.attributedText = ContinuityTheme.caption("\(count)", color: count > 0 && warn ? Self.warnInk : ContinuityTheme.Color.secondaryInk, size: 11)
            flag.setContentHuggingPriority(.required, for: .horizontal)
            views.append(flag)
        }
        let row = UIStackView(arrangedSubviews: views)
        row.spacing = 8
        row.alignment = .center
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 0, leading: 0, bottom: 6, trailing: 0)
        return row
    }

    private func emptyLine(_ text: String, symbol: String?) -> UIView {
        let label = MapUI.body(text, size: 14)
        guard let symbol else { return label }
        let icon = UIImageView(image: UIImage(systemName: symbol))
        icon.tintColor = ContinuityTheme.Color.teal
        icon.setContentHuggingPriority(.required, for: .horizontal)
        let row = UIStackView(arrangedSubviews: [icon, label])
        row.spacing = 8
        row.alignment = .center
        return row
    }

    private func actionRow(_ action: KnowledgeHealth.Action) -> UIView {
        let color: UIColor = switch action.severity {
        case "high": UIColor(hex: 0xD9654F)
        case "medium": ContinuityTheme.Color.apricot
        default: ContinuityTheme.Color.teal
        }
        let dot = MapUI.glowDot(color: color)
        let text = MapUI.body(action.text, color: ContinuityTheme.Color.ink, size: 15)
        let title = switch action.type {
        case "interview": "Plan interview"
        case "handoff": "Create outline"
        default: "Open"
        }
        var config = UIButton.Configuration.glass()
        config.title = title
        config.buttonSize = .small
        config.cornerStyle = .capsule
        config.baseForegroundColor = ContinuityTheme.Color.teal
        config.showsActivityIndicator = busyAction == action.text
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var out = incoming
            out.font = ContinuityTheme.Font.text(13, weight: .semibold)
            return out
        }
        let button = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in self?.perform(action) })
        button.isEnabled = busyAction == nil
        button.setContentCompressionResistancePriority(.required, for: .horizontal)
        button.setContentHuggingPriority(.required, for: .horizontal)
        let row = UIStackView(arrangedSubviews: [dot, text, button])
        row.spacing = 12
        row.alignment = .center
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0)
        return row
    }

    private func personRow(_ risk: KnowledgeHealth.PersonRisk) -> UIView {
        var detail = [risk.role].compactMap { $0 }.filter { !$0.isEmpty }
        if let leave = risk.leaveDate, !leave.isEmpty { detail.append("last day " + Self.day(leave)) }
        detail.append("\(risk.published) published · \(risk.drafts) draft · \(risk.stale) overdue")
        let text = risk.reasons.isEmpty ? detail.joined(separator: " · ") : detail.joined(separator: " · ") + "\n" + risk.reasons.joined(separator: " ")
        let button = MapUI.row(symbol: risk.risk == "high" ? "exclamationmark.triangle.fill" : risk.risk == "medium" ? "exclamationmark.circle" : "checkmark.circle",
                               tint: risk.risk == "high" ? UIColor(hex: 0xD9654F) : risk.risk == "medium" ? ContinuityTheme.Color.apricot : ContinuityTheme.Color.teal,
                               title: risk.name + "  ·  " + risk.risk.capitalized + " risk", detail: text) { [weak self] in
            self?.openPerson(risk.personId)
        }
        button.configuration?.subtitleLineBreakMode = .byWordWrapping
        return button
    }

    private func listCard(_ title: String, empty: String, warn: Bool = false, rows: [(id: String, title: String, meta: String)]) {
        var views: [UIView] = [sectionTitle(title, symbol: warn && !rows.isEmpty ? "exclamationmark.triangle" : nil, count: rows.count, warn: warn)]
        if rows.isEmpty { views.append(MapUI.body(empty, size: 14)) }
        for row in rows.prefix(8) {
            views.append(MapUI.row(symbol: "book.closed", tint: ContinuityTheme.Color.secondaryInk, title: row.title, detail: row.meta) { [weak self] in
                self?.openArticle(row.id)
            })
        }
        stack.addArrangedSubview(card(views))
    }

    private static func days(_ count: Int) -> String { "\(count) \(count == 1 ? "day" : "days")" }

    private static func day(_ iso: String) -> String {
        guard let date = OrgFlowDates.parseDay(iso) else { return iso }
        return date.formatted(date: .abbreviated, time: .omitted)
    }

    // MARK: Actions

    private func perform(_ action: KnowledgeHealth.Action) {
        if let articleID = action.articleId, action.type != "interview", action.type != "handoff" {
            openArticle(articleID)
            return
        }
        guard let personID = action.personId else { return }
        if action.type == "interview" {
            InterviewPlanViewController.present(personID: personID, from: self) { [weak self] plan in self?.onStartInterview?(plan) }
            return
        }
        busyAction = action.text
        render()
        Task {
            defer {
                busyAction = nil
                render()
            }
            do {
                let result = try await OrgFlowAPI.shared.handoffOutline(personID: personID)
                UINotificationFeedbackGenerator(view: view).notificationOccurred(.success)
                navigationController?.pushViewController(ArticleViewController(article: result.draft, workspace: workspace), animated: true)
                load()
            } catch {
                let alert = UIAlertController(title: "Couldn't build the outline", message: error.localizedDescription, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "OK", style: .default))
                present(alert, animated: true)
            }
        }
    }

    private func openArticle(_ id: String) {
        let controller = workspace?.article(id).map { ArticleViewController(article: $0, workspace: workspace) } ?? ArticleViewController(articleID: id)
        controller.onPublished = { [weak self] _ in self?.load() }
        controller.onReviewed = { [weak self] _ in self?.load() }
        navigationController?.pushViewController(controller, animated: true)
    }

    private func openPerson(_ id: String) {
        guard let workspace, let person = workspace.person(id) else { return }
        let controller = PersonViewController(person: person, workspace: workspace)
        controller.onStartInterview = onStartInterview
        controller.onWorkspaceChanged = { [weak self] in
            self?.workspace = $0
            self?.onWorkspaceChanged?($0)
        }
        navigationController?.pushViewController(controller, animated: true)
    }
}

/// The score as an arc of the thread around a serif number.
final class ScoreRingView: UIView {
    private let track = CAShapeLayer()
    private let gradient = CAGradientLayer()
    private let arc = CAShapeLayer()
    private let number = UILabel()
    private let outOf = UILabel()
    private var score = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        track.fillColor = nil
        track.strokeColor = ContinuityTheme.Color.hairline.cgColor
        track.lineWidth = 9
        layer.addSublayer(track)
        gradient.type = .conic
        gradient.startPoint = CGPoint(x: 0.5, y: 0.5)
        gradient.endPoint = CGPoint(x: 0.5, y: 0)
        gradient.colors = [ContinuityTheme.Color.teal, ContinuityTheme.Color.iris, ContinuityTheme.Color.apricot, ContinuityTheme.Color.teal].map(\.cgColor)
        arc.fillColor = nil
        arc.strokeColor = UIColor.black.cgColor
        arc.lineWidth = 9
        arc.lineCap = .round
        gradient.mask = arc
        layer.addSublayer(gradient)
        number.font = ContinuityTheme.Font.display(46, weight: .semibold)
        number.textColor = ContinuityTheme.Color.ink
        number.textAlignment = .center
        outOf.attributedText = ContinuityTheme.caption("/ 100", size: 10)
        outOf.textAlignment = .center
        let column = UIStackView(arrangedSubviews: [number, outOf])
        column.axis = .vertical
        column.alignment = .center
        column.spacing = -4
        column.translatesAutoresizingMaskIntoConstraints = false
        addSubview(column)
        NSLayoutConstraint.activate([
            column.centerXAnchor.constraint(equalTo: centerXAnchor),
            column.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func configure(score: Int) {
        self.score = max(0, min(100, score))
        number.text = "\(self.score)"
        arc.strokeEnd = CGFloat(self.score) / 100
    }

    func animateIn() {
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        let grow = CABasicAnimation(keyPath: "strokeEnd")
        grow.fromValue = 0
        grow.toValue = CGFloat(score) / 100
        grow.duration = 1.1
        grow.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.9, 0.25, 1)
        arc.add(grow, forKey: "grow")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let inset = track.lineWidth / 2 + 1
        let rect = bounds.insetBy(dx: inset, dy: inset)
        let path = UIBezierPath(arcCenter: CGPoint(x: bounds.midX, y: bounds.midY), radius: rect.width / 2, startAngle: -.pi / 2, endAngle: .pi * 1.5, clockwise: true)
        track.frame = bounds
        track.path = path.cgPath
        gradient.frame = bounds
        arc.frame = bounds
        arc.path = path.cgPath
    }
}
