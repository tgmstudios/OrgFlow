import UIKit

/// One person: what they own, their knowledge risk, and the Transfer actions (voice interview plan,
/// no-AI handoff outline, the knowledge map).
final class PersonViewController: UIViewController {
    var onStartInterview: ((InterviewPlan) -> Void)?
    var onWorkspaceChanged: ((Workspace) -> Void)?

    private var person: Person
    private var workspace: Workspace
    private var risk: KnowledgeHealth.PersonRisk?
    private var isOutlining = false
    private var stack: UIStackView!

    init(person: Person, workspace: Workspace) {
        self.person = person
        self.workspace = workspace
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = ContinuityTheme.Color.canvas
        navigationItem.largeTitleDisplayMode = .never
        stack = MapUI.scrollingStack(in: view)
        render()
        Task {
            risk = try? await OrgFlowAPI.shared.knowledgeHealth().risk(for: person.id)
            render()
        }
    }

    private var tone: KnowledgeMapData.Tone {
        let tones: [KnowledgeMapData.Tone] = [.teal, .iris, .apricot]
        return tones[(workspace.people.firstIndex { $0.id == person.id } ?? 0) % tones.count]
    }

    private func render() {
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }

        let avatar = MapAvatarView(diameter: 64)
        avatar.configure(initials: person.initials, tone: tone, warns: person.isDeparting)
        stack.addArrangedSubview(UIStackView(arrangedSubviews: [avatar, UIView()]))
        stack.setCustomSpacing(16, after: stack.arrangedSubviews.last!)
        stack.addArrangedSubview(MapUI.caption(person.role?.isEmpty == false ? person.role! : "Person"))
        let name = MapUI.title(person.name, size: 32)
        stack.addArrangedSubview(name)
        stack.setCustomSpacing(6, after: name)

        var status = person.hasLeft ? "Has left" : person.isDeparting ? "Leaving" : "Active"
        if person.isDeparting, !person.hasLeft, let date = person.leaveDateValue {
            status += " · last day " + date.formatted(date: .abbreviated, time: .omitted)
        }
        let successor = workspace.person(person.successorId)
        let statusLine = NSMutableAttributedString(string: status, attributes: [
            .font: ContinuityTheme.Font.text(15, weight: .semibold),
            .foregroundColor: person.isDeparting ? UIColor(hex: 0xB5603A) : ContinuityTheme.Color.teal,
        ])
        statusLine.append(NSAttributedString(string: "\n" + (successor.map { "Successor: \($0.name)" } ?? "No successor assigned"), attributes: [
            .font: ContinuityTheme.Font.text(15), .foregroundColor: ContinuityTheme.Color.secondaryInk,
        ]))
        let statusLabel = UILabel()
        statusLabel.attributedText = statusLine
        statusLabel.numberOfLines = 0
        stack.addArrangedSubview(statusLabel)
        stack.setCustomSpacing(22, after: statusLabel)

        if let risk, risk.risk != "low" || !risk.reasons.isEmpty {
            stack.addArrangedSubview(riskCard(risk))
            stack.setCustomSpacing(22, after: stack.arrangedSubviews.last!)
        }

        // What they own (recorded owners only).
        let articles = workspace.articles.filter { $0.ownerId == person.id }
        let sources = workspace.sources.filter { $0.ownerId == person.id }
        stack.addArrangedSubview(MapUI.caption("What they own · \(articles.count + sources.count)"))
        if articles.isEmpty && sources.isEmpty {
            stack.addArrangedSubview(MapUI.body("Nothing is recorded as theirs yet. Assign owners on the knowledge map.", size: 14))
        }
        for article in articles {
            stack.addArrangedSubview(MapUI.row(symbol: "book.closed.fill", tint: tone.ink, title: article.title, detail: article.statusBadge) { [weak self] in
                self?.openArticle(article)
            })
        }
        for source in sources {
            let url = source.url.flatMap { URL(string: $0) }.flatMap { $0.scheme == "https" ? $0 : nil }
            let symbol = (source.provider ?? "").localizedCaseInsensitiveContains("gmail") ? "envelope.fill" : "doc.text.fill"
            stack.addArrangedSubview(MapUI.row(symbol: symbol, tint: tone.ink, title: source.title, detail: source.provider, external: url != nil) {
                if let url { UIApplication.shared.open(url) }
            })
        }
        stack.setCustomSpacing(26, after: stack.arrangedSubviews.last!)

        // Transfer
        stack.addArrangedSubview(MapUI.caption("Handoff"))
        stack.addArrangedSubview(MapUI.body("Before \(person.firstName) moves on, capture what only they know: a voice interview that targets what's undocumented, or an outline built only from OrgFlow's records."))
        stack.setCustomSpacing(16, after: stack.arrangedSubviews.last!)

        stack.addArrangedSubview(MapUI.button("Plan a voice interview", symbol: "waveform", prominent: true, action: UIAction { [weak self] _ in
            self?.planInterview()
        }))
        var outlineConfig = UIButton.Configuration.glass()
        outlineConfig.title = isOutlining ? "Building outline…" : "Outline without AI"
        outlineConfig.image = UIImage(systemName: "doc.text", withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .semibold))
        outlineConfig.imagePadding = 8
        outlineConfig.cornerStyle = .capsule
        outlineConfig.buttonSize = .large
        outlineConfig.baseForegroundColor = ContinuityTheme.Color.ink
        outlineConfig.showsActivityIndicator = isOutlining
        let outline = UIButton(configuration: outlineConfig, primaryAction: UIAction { [weak self] _ in self?.buildOutline() })
        outline.isEnabled = !isOutlining
        stack.addArrangedSubview(outline)
        let footnote = person.isDeparting
            ? "The outline is a draft for review. Building it again replaces the previous outline."
            : "The outline is a draft for review, and marks \(person.firstName) as leaving."
        stack.addArrangedSubview(MapUI.body(footnote, size: 12))
        stack.setCustomSpacing(16, after: stack.arrangedSubviews.last!)

        if let guideID = person.handoffArticleId, let guide = workspace.article(guideID) {
            stack.addArrangedSubview(MapUI.row(symbol: "person.2.wave.2", tint: ContinuityTheme.Color.teal, title: guide.title, detail: "Handoff guide · " + guide.statusBadge) { [weak self] in
                self?.openArticle(guide)
            })
        }
        stack.addArrangedSubview(MapUI.row(symbol: "point.3.connected.trianglepath.dotted", tint: ContinuityTheme.Color.teal, title: "Show on the knowledge map", detail: "Reassign or hand over what they own") { [weak self] in
            self?.openMap()
        })
    }

    private func riskCard(_ risk: KnowledgeHealth.PersonRisk) -> UIView {
        let high = risk.risk == "high"
        let ink = high ? UIColor(hex: 0x9A4B22) : risk.risk == "medium" ? UIColor(hex: 0x9A4B22) : UIColor(hex: 0x2B7672)
        let card = UIStackView()
        card.axis = .vertical
        card.spacing = 6
        card.isLayoutMarginsRelativeArrangement = true
        card.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16)
        card.backgroundColor = high ? UIColor(hex: 0xFCEBE1) : risk.risk == "medium" ? UIColor(hex: 0xFDF3EC) : ContinuityTheme.Color.paleTeal
        card.layer.cornerRadius = 18
        card.layer.cornerCurve = .continuous
        let header = UIStackView(arrangedSubviews: [MapUI.glowDot(color: high ? ContinuityTheme.Color.apricot : ContinuityTheme.Color.iris), MapUI.caption("\(risk.risk) risk", color: ink)])
        header.spacing = 8
        header.alignment = .center
        card.addArrangedSubview(header)
        let counts = "\(risk.published) published · \(risk.drafts) draft · \(risk.stale) overdue"
        card.addArrangedSubview(MapUI.body(counts, color: ContinuityTheme.Color.ink, size: 14))
        for reason in risk.reasons {
            card.addArrangedSubview(MapUI.body("•  " + reason, color: ContinuityTheme.Color.ink, size: 14))
        }
        return card
    }

    // MARK: Actions

    private func planInterview() {
        InterviewPlanViewController.present(personID: person.id, from: self) { [weak self] plan in
            self?.onStartInterview?(plan)
        }
    }

    private func buildOutline() {
        guard !isOutlining else { return }
        isOutlining = true
        render()
        Task {
            defer {
                isOutlining = false
                render()
            }
            do {
                let result = try await OrgFlowAPI.shared.handoffOutline(personID: person.id)
                UINotificationFeedbackGenerator(view: view).notificationOccurred(.success)
                person = result.person
                if let fresh = try? await OrgFlowAPI.shared.workspace() {
                    workspace = fresh
                    onWorkspaceChanged?(fresh)
                }
                openArticle(result.draft)
            } catch {
                UINotificationFeedbackGenerator(view: view).notificationOccurred(.error)
                let alert = UIAlertController(title: "Couldn't build the outline", message: error.localizedDescription, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "OK", style: .default))
                present(alert, animated: true)
            }
        }
    }

    private func openArticle(_ article: Article) {
        let controller = ArticleViewController(article: article, workspace: workspace)
        navigationController?.pushViewController(controller, animated: true)
    }

    private func openMap() {
        // Reuse a map already in the stack rather than stacking another.
        if let map = navigationController?.viewControllers.last(where: { $0 is KnowledgeMapViewController }) {
            navigationController?.popToViewController(map, animated: true)
            return
        }
        let map = KnowledgeMapViewController(workspace: workspace, focusPersonID: person.id)
        map.onStartInterview = onStartInterview
        map.onWorkspaceChanged = onWorkspaceChanged
        navigationController?.pushViewController(map, animated: true)
    }
}

/// Everyone in the organization, leaving people first, with their knowledge risk.
final class PeopleViewController: UIViewController, UICollectionViewDelegate {
    var onStartInterview: ((InterviewPlan) -> Void)?
    var onWorkspaceChanged: ((Workspace) -> Void)?

    private nonisolated struct Row: Hashable, Sendable {
        let person: Person
        let owned: Int
        let risk: String?
        let toneIndex: Int
    }

    var onSignInRequested: (() -> Void)?

    private var workspace: Workspace?
    private var health: KnowledgeHealth?
    private var collectionView: UICollectionView!
    private var dataSource: UICollectionViewDiffableDataSource<String, Row>!
    private var hasAppeared = false

    init(workspace: Workspace?) {
        self.workspace = workspace
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = ContinuityTheme.Color.canvas
        title = "People"
        navigationItem.largeTitleDisplayMode = .never
        var config = UICollectionLayoutListConfiguration(appearance: .insetGrouped)
        config.backgroundColor = .clear
        config.headerMode = .supplementary
        config.separatorConfiguration.color = ContinuityTheme.Color.hairline
        collectionView = UICollectionView(frame: view.bounds, collectionViewLayout: UICollectionViewCompositionalLayout.list(using: config))
        collectionView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        collectionView.backgroundColor = .clear
        collectionView.delegate = self
        let refresh = UIRefreshControl()
        refresh.addAction(UIAction { [weak self] _ in self?.reload() }, for: .valueChanged)
        collectionView.refreshControl = refresh
        view.addSubview(collectionView)

        let cell = UICollectionView.CellRegistration<UICollectionViewListCell, Row> { cell, _, row in
            var content = UIListContentConfiguration.subtitleCell()
            content.text = row.person.name
            content.textProperties.font = ContinuityTheme.Font.text(16, weight: .semibold)
            content.textProperties.color = ContinuityTheme.Color.ink
            content.image = Self.avatarImage(row.person, toneIndex: row.toneIndex)
            content.imageProperties.reservedLayoutSize = CGSize(width: 40, height: 40)
            var parts = [row.person.role, "\(row.owned) \(row.owned == 1 ? "item" : "items")"].compactMap { $0 }.filter { !$0.isEmpty }
            if row.person.isDeparting { parts.insert(row.person.hasLeft ? "Left" : "Leaving", at: 0) }
            content.secondaryText = parts.joined(separator: "  ·  ")
            content.secondaryTextProperties.font = ContinuityTheme.Font.text(13)
            content.secondaryTextProperties.numberOfLines = 1
            content.secondaryTextProperties.color = ContinuityTheme.Color.secondaryInk
            cell.contentConfiguration = content
            var accessories: [UICellAccessory] = [.disclosureIndicator()]
            if let risk = row.risk, risk != "low" {
                let label = UILabel()
                label.attributedText = ContinuityTheme.caption(risk, color: risk == "high" ? UIColor(hex: 0x9A4B22) : ContinuityTheme.Color.secondaryInk, size: 9.5)
                accessories.insert(.customView(configuration: .init(customView: label, placement: .trailing())), at: 0)
            }
            cell.accessories = accessories
            var background = UIBackgroundConfiguration.listCell()
            background.backgroundColor = .white
            cell.backgroundConfiguration = background
        }
        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) { collectionView, indexPath, row in
            collectionView.dequeueConfiguredReusableCell(using: cell, for: indexPath, item: row)
        }
        let header = UICollectionView.SupplementaryRegistration<UICollectionViewListCell>(elementKind: UICollectionView.elementKindSectionHeader) { [weak self] view, _, indexPath in
            var content = UIListContentConfiguration.header()
            content.attributedText = ContinuityTheme.caption(self?.dataSource.snapshot().sectionIdentifiers[indexPath.section] ?? "")
            view.contentConfiguration = content
        }
        dataSource.supplementaryViewProvider = { collectionView, _, indexPath in
            collectionView.dequeueConfiguredReusableSupplementary(using: header, for: indexPath)
        }
        rebuild()
        if workspace == nil { contentUnavailableConfiguration = UIContentUnavailableConfiguration.loading() }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        reload()
    }

    private func update(_ workspace: Workspace) {
        self.workspace = workspace
        rebuild()
        onWorkspaceChanged?(workspace)
    }

    func reload() {
        Task {
            defer { collectionView.refreshControl?.endRefreshing() }
            do {
                let fresh = try await OrgFlowAPI.shared.workspace()
                workspace = fresh
                onWorkspaceChanged?(fresh)
            } catch let error as OrgFlowAPIError where error == .signInRequired {
                showSignIn()
                return
            } catch {}
            health = try? await OrgFlowAPI.shared.knowledgeHealth()
            rebuild()
        }
    }

    private func showSignIn() {
        workspace = nil
        var config = UIContentUnavailableConfiguration.empty()
        config.image = UIImage(systemName: "person.crop.circle")
        config.text = "Sign in to see your people"
        config.textProperties.font = ContinuityTheme.Font.display(22, weight: .semibold)
        config.button = .prominentGlass()
        config.button.baseBackgroundColor = ContinuityTheme.Color.teal
        config.button.title = "Sign in"
        config.buttonProperties.primaryAction = UIAction { [weak self] _ in self?.onSignInRequested?() }
        dataSource.apply(NSDiffableDataSourceSnapshot<String, Row>(), animatingDifferences: false)
        contentUnavailableConfiguration = config
    }

    private func rebuild() {
        guard let workspace else { return }
        func row(_ person: Person) -> Row {
            let owned = workspace.articles.filter { $0.ownerId == person.id }.count + workspace.sources.filter { $0.ownerId == person.id }.count
            return Row(person: person, owned: owned, risk: health?.risk(for: person.id)?.risk, toneIndex: workspace.people.firstIndex { $0.id == person.id } ?? 0)
        }
        var snapshot = NSDiffableDataSourceSnapshot<String, Row>()
        let leaving = workspace.people.filter(\.isDeparting)
        let staying = workspace.people.filter { !$0.isDeparting }
        for (title, people) in [("Leaving", leaving), ("Team", staying)] where !people.isEmpty {
            snapshot.appendSections([title])
            snapshot.appendItems(people.map(row), toSection: title)
        }
        dataSource.apply(snapshot, animatingDifferences: false)
        if workspace.people.isEmpty {
            var config = UIContentUnavailableConfiguration.empty()
            config.image = UIImage(systemName: "person.2")
            config.text = "No people yet"
            config.textProperties.font = ContinuityTheme.Font.display(22, weight: .semibold)
            config.secondaryText = "Add people on orgflow.dev so knowledge has an owner and a handoff path."
            contentUnavailableConfiguration = config
        } else {
            contentUnavailableConfiguration = nil
        }
    }

    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        collectionView.deselectItem(at: indexPath, animated: true)
        guard let row = dataSource.itemIdentifier(for: indexPath), let workspace else { return }
        let controller = PersonViewController(person: row.person, workspace: workspace)
        controller.onStartInterview = onStartInterview
        controller.onWorkspaceChanged = { [weak self] in self?.update($0) }
        navigationController?.pushViewController(controller, animated: true)
    }

    /// Initials on the person's tone, as an image for list cells.
    static func avatarImage(_ person: Person, toneIndex: Int) -> UIImage {
        let tones: [KnowledgeMapData.Tone] = [.teal, .iris, .apricot]
        let tone = tones[toneIndex % tones.count]
        let size = CGSize(width: 40, height: 40)
        return UIGraphicsImageRenderer(size: size).image { _ in
            let rect = CGRect(origin: .zero, size: size).insetBy(dx: 1, dy: 1)
            tone.pale.setFill()
            UIBezierPath(ovalIn: rect).fill()
            (person.isDeparting ? ContinuityTheme.Color.apricot : tone.color).setStroke()
            let ring = UIBezierPath(ovalIn: rect)
            ring.lineWidth = 2
            ring.stroke()
            let text = person.initials as NSString
            let attributes: [NSAttributedString.Key: Any] = [.font: ContinuityTheme.Font.text(14, weight: .semibold), .foregroundColor: tone.ink]
            let textSize = text.size(withAttributes: attributes)
            text.draw(at: CGPoint(x: (size.width - textSize.width) / 2, y: (size.height - textSize.height) / 2), withAttributes: attributes)
        }.withRenderingMode(.alwaysOriginal)
    }
}
