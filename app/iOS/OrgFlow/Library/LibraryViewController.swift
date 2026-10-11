import UIKit

final class LibraryViewController: UIViewController {
    var onSignInRequested: (() -> Void)?
    var onAsk: ((String) -> Void)?

    private enum Segment: Int { case knowledge, files, upcoming, checklists }

    private nonisolated struct Section: Hashable, Sendable {
        let id: String
        let title: String
    }

    private nonisolated enum Item: Hashable, Sendable {
        case article(Article, awaiting: Bool)
        case file(WorkspaceFile)
        case event(WorkspaceEvent)
        case candidate(PlaybookCandidate)
        case run(ChecklistRun, assignee: String?)
    }

    private enum Phase {
        case loading
        case loaded
        case failed(message: String, signInRequired: Bool)
    }

    private var workspace: Workspace?
    private var phase: Phase = .loading
    private var isFetching = false
    private var isDrafting = false
    private var segment: Segment = .knowledge
    private var sectionCount = 0

    private let segmentedControl = UISegmentedControl(items: ["Knowledge", "Files", "Upcoming", "Checklists"])
    private var collectionView: UICollectionView!
    private var dataSource: UICollectionViewDiffableDataSource<Section, Item>!

    init(workspace: Workspace?) {
        self.workspace = workspace
        self.phase = workspace == nil ? .loading : .loaded
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = ContinuityTheme.Color.canvas
        title = "Library"
        navigationItem.largeTitleDisplayMode = .never

        segmentedControl.selectedSegmentIndex = 0
        segmentedControl.setTitleTextAttributes([.font: ContinuityTheme.Font.text(13, weight: .medium)], for: .normal)
        segmentedControl.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            segment = Segment(rawValue: segmentedControl.selectedSegmentIndex) ?? .knowledge
            rebuild()
            collectionView.setContentOffset(CGPoint(x: 0, y: -collectionView.adjustedContentInset.top), animated: false)
        }, for: .valueChanged)
        navigationItem.titleView = segmentedControl
        navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .close, primaryAction: UIAction { [weak self] _ in
            self?.dismiss(animated: true)
        })

        configureCollectionView()
        rebuild()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if workspace == nil, !isFetching { reload() }
    }

    // MARK: Collection view

    private func configureCollectionView() {
        let layout = UICollectionViewCompositionalLayout { [weak self] index, environment in
            var config = UICollectionLayoutListConfiguration(appearance: .insetGrouped)
            config.backgroundColor = .clear
            config.headerMode = .supplementary
            config.footerMode = (self?.segment == .files && index == (self?.sectionCount ?? 0) - 1) ? .supplementary : .none
            config.separatorConfiguration.color = ContinuityTheme.Color.hairline
            return NSCollectionLayoutSection.list(using: config, layoutEnvironment: environment)
        }
        collectionView = UICollectionView(frame: view.bounds, collectionViewLayout: layout)
        collectionView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        collectionView.backgroundColor = .clear
        collectionView.delegate = self
        let refresh = UIRefreshControl()
        refresh.addAction(UIAction { [weak self] _ in self?.reload() }, for: .valueChanged)
        collectionView.refreshControl = refresh
        view.addSubview(collectionView)

        let articleCell = UICollectionView.CellRegistration<UICollectionViewListCell, Item> { [weak self] cell, _, item in
            self?.configure(cell, item: item)
        }
        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) { collectionView, indexPath, item in
            collectionView.dequeueConfiguredReusableCell(using: articleCell, for: indexPath, item: item)
        }

        let header = UICollectionView.SupplementaryRegistration<UICollectionViewListCell>(elementKind: UICollectionView.elementKindSectionHeader) { [weak self] view, _, indexPath in
            var content = UIListContentConfiguration.header()
            let title = self?.dataSource.snapshot().sectionIdentifiers[indexPath.section].title ?? ""
            content.attributedText = ContinuityTheme.caption(title)
            view.contentConfiguration = content
        }
        let footer = UICollectionView.SupplementaryRegistration<UICollectionViewListCell>(elementKind: UICollectionView.elementKindSectionFooter) { view, _, _ in
            var content = UIListContentConfiguration.footer()
            content.text = "Originals stay in your file stores. Connect sources on orgflow.dev."
            content.textProperties.font = ContinuityTheme.Font.text(12)
            content.textProperties.color = ContinuityTheme.Color.secondaryInk
            view.contentConfiguration = content
        }
        dataSource.supplementaryViewProvider = { collectionView, kind, indexPath in
            if kind == UICollectionView.elementKindSectionFooter {
                return collectionView.dequeueConfiguredReusableSupplementary(using: footer, for: indexPath)
            }
            return collectionView.dequeueConfiguredReusableSupplementary(using: header, for: indexPath)
        }
    }

    private func configure(_ cell: UICollectionViewListCell, item: Item) {
        var content = UIListContentConfiguration.subtitleCell()
        content.textProperties.color = ContinuityTheme.Color.ink
        content.secondaryTextProperties.color = ContinuityTheme.Color.secondaryInk
        content.secondaryTextProperties.font = ContinuityTheme.Font.text(13)
        content.imageProperties.tintColor = ContinuityTheme.Color.teal
        content.textToSecondaryTextVerticalPadding = 3
        var accessories: [UICellAccessory] = []

        switch item {
        case .article(let article, let awaiting):
            content.text = awaiting ? article.title : article.visibleTitle
            content.textProperties.font = ContinuityTheme.Font.display(18, weight: .medium)
            let line = NSMutableAttributedString(string: article.statusBadge, attributes: [
                .font: ContinuityTheme.Font.text(13, weight: .semibold),
                .foregroundColor: article.isDraft || article.isSample ? article.statusColor : ContinuityTheme.Color.teal,
            ])
            if article.isDueForReview {
                line.append(NSAttributedString(string: "  ·  Review due", attributes: [
                    .font: ContinuityTheme.Font.text(13, weight: .semibold), .foregroundColor: UIColor(hex: 0xB5603A),
                ]))
            }
            if let date = article.updatedDate {
                line.append(NSAttributedString(string: "  ·  " + Self.relative(date), attributes: [
                    .font: ContinuityTheme.Font.text(13), .foregroundColor: ContinuityTheme.Color.secondaryInk,
                ]))
            }
            content.secondaryAttributedText = line
            accessories = [.disclosureIndicator()]
        case .candidate(let candidate):
            content.text = candidate.title
            content.textProperties.font = ContinuityTheme.Font.display(18, weight: .medium)
            content.image = UIImage(systemName: "sparkles")
            let detail = NSMutableAttributedString()
            var lead = [candidate.frequency, candidate.evidence.isEmpty ? nil : "\(candidate.evidence.count) emails and documents"].compactMap { $0 }
            lead = lead.filter { !$0.isEmpty }
            if !lead.isEmpty {
                detail.append(NSAttributedString(string: lead.joined(separator: "  ·  "), attributes: [
                    .font: ContinuityTheme.Font.text(13, weight: .semibold), .foregroundColor: ContinuityTheme.Color.teal,
                ]))
            }
            if let summary = candidate.summary, !summary.isEmpty {
                if detail.length > 0 { detail.append(NSAttributedString(string: "\n")) }
                detail.append(NSAttributedString(string: summary, attributes: [
                    .font: ContinuityTheme.Font.text(13), .foregroundColor: ContinuityTheme.Color.secondaryInk,
                ]))
            }
            content.secondaryAttributedText = detail
            content.secondaryTextProperties.numberOfLines = 3
            accessories = [.disclosureIndicator()]
        case .run(let run, let assignee):
            content.text = run.title
            content.textProperties.font = ContinuityTheme.Font.text(16, weight: .medium)
            content.image = UIImage(systemName: run.isCompleted ? "checkmark.circle.fill" : "checklist")
            content.imageProperties.tintColor = run.isCompleted ? ContinuityTheme.Color.teal : ContinuityTheme.Color.secondaryInk
            var parts = ["\(run.completedCount) of \(run.steps.count)"]
            if let assignee { parts.append(assignee) }
            if let started = run.startedDate { parts.append("Started " + started.formatted(.dateTime.month(.abbreviated).day())) }
            content.secondaryText = parts.joined(separator: "  ·  ")
            accessories = [.disclosureIndicator()]
        case .file(let file):
            content.text = file.name
            content.textProperties.font = ContinuityTheme.Font.text(16, weight: .medium)
            content.image = UIImage(systemName: Self.symbol(forProvider: file.provider))
            let path = file.orgflowPath ?? ""
            let tag = file.synthetic == true ? "Sample" : nil
            content.secondaryText = [tag, path.isEmpty ? nil : path].compactMap { $0 }.joined(separator: "  ·  ")
            content.secondaryTextProperties.numberOfLines = 2
            let arrow = UIImageView(image: UIImage(systemName: "arrow.up.right"))
            arrow.tintColor = ContinuityTheme.Color.secondaryInk
            arrow.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 12, weight: .medium)
            accessories = [.customView(configuration: .init(customView: arrow, placement: .trailing()))]
        case .event(let event):
            content.text = event.title
            content.textProperties.font = ContinuityTheme.Font.text(16, weight: .medium)
            content.image = UIImage(systemName: event.kind == "deadline" ? "flag" : "person.2")
            if let date = event.startDate {
                content.secondaryText = Self.eventDate(date) + (event.synthetic == true ? "  ·  Sample" : "")
            }
        }
        cell.contentConfiguration = content
        cell.accessories = accessories
        var background = UIBackgroundConfiguration.listCell()
        background.backgroundColor = .white
        cell.backgroundConfiguration = background
    }

    // MARK: Data

    func reload() {
        guard !isFetching else { return }
        isFetching = true
        if workspace == nil { phase = .loading; updateBackground() }
        Task {
            defer {
                isFetching = false
                collectionView?.refreshControl?.endRefreshing()
            }
            do {
                workspace = try await OrgFlowAPI.shared.workspace()
                phase = .loaded
            } catch let error as OrgFlowAPIError where error == .signInRequired {
                workspace = nil
                phase = .failed(message: error.localizedDescription, signInRequired: true)
            } catch {
                if workspace == nil { phase = .failed(message: error.localizedDescription, signInRequired: false) }
            }
            rebuild()
        }
    }

    private func rebuild() {
        var snapshot = NSDiffableDataSourceSnapshot<Section, Item>()
        if let workspace, case .loaded = phase {
            switch segment {
            case .knowledge: buildKnowledge(workspace, into: &snapshot)
            case .files: buildFiles(workspace, into: &snapshot)
            case .upcoming: buildUpcoming(workspace, into: &snapshot)
            case .checklists: buildChecklists(workspace, into: &snapshot)
            }
        }
        sectionCount = snapshot.numberOfSections
        dataSource.applySnapshotUsingReloadData(snapshot)
        updateBackground()
    }

    private func buildKnowledge(_ workspace: Workspace, into snapshot: inout NSDiffableDataSourceSnapshot<Section, Item>) {
        let suggested = workspace.suggestedCandidates
        if !suggested.isEmpty {
            let section = Section(id: "suggested", title: "Suggested playbooks")
            snapshot.appendSections([section])
            snapshot.appendItems(suggested.map { .candidate($0) }, toSection: section)
        }
        let drafts = workspace.articles.filter(\.isDraft)
        if !drafts.isEmpty {
            let section = Section(id: "awaiting", title: "Awaiting review")
            snapshot.appendSections([section])
            snapshot.appendItems(drafts.map { .article($0, awaiting: true) }, toSection: section)
        }
        for category in workspace.categories {
            let articles = workspace.articles.filter { $0.categoryId == category.id && (!$0.isDraft || $0.hasPublishedVersion) }
            guard !articles.isEmpty else { continue }
            let section = Section(id: "category-" + category.id, title: category.name)
            snapshot.appendSections([section])
            snapshot.appendItems(articles.map { .article($0, awaiting: false) }, toSection: section)
        }
    }

    private func buildChecklists(_ workspace: Workspace, into snapshot: inout NSDiffableDataSourceSnapshot<Section, Item>) {
        func newestFirst(_ runs: [ChecklistRun]) -> [ChecklistRun] {
            runs.sorted { ($0.startedDate ?? .distantPast) > ($1.startedDate ?? .distantPast) }
        }
        let active = newestFirst(workspace.runs.filter { !$0.isCompleted })
        let completed = newestFirst(workspace.runs.filter(\.isCompleted))
        for (id, title, runs) in [("active", "In progress", active), ("completed", "Completed", completed)] where !runs.isEmpty {
            let section = Section(id: id, title: title)
            snapshot.appendSections([section])
            snapshot.appendItems(runs.map { .run($0, assignee: workspace.person($0.assigneeId)?.name) }, toSection: section)
        }
    }

    private func buildFiles(_ workspace: Workspace, into snapshot: inout NSDiffableDataSourceSnapshot<Section, Item>) {
        var order: [String] = []
        var groups: [String: [WorkspaceFile]] = [:]
        for file in workspace.files {
            let provider = file.provider ?? "Other"
            if groups[provider] == nil { order.append(provider) }
            groups[provider, default: []].append(file)
        }
        for provider in order {
            let section = Section(id: "provider-" + provider, title: provider)
            snapshot.appendSections([section])
            snapshot.appendItems((groups[provider] ?? []).map { .file($0) }, toSection: section)
        }
    }

    private func buildUpcoming(_ workspace: Workspace, into snapshot: inout NSDiffableDataSourceSnapshot<Section, Item>) {
        let now = Date()
        let dated = workspace.events.compactMap { event in event.startDate.map { (event, $0) } }
        let upcoming = dated.filter { $0.1 >= now }.sorted { $0.1 < $1.1 }.map(\.0)
        let earlier = dated.filter { $0.1 < now }.sorted { $0.1 > $1.1 }.map(\.0) + workspace.events.filter { $0.startDate == nil }
        if !upcoming.isEmpty {
            let section = Section(id: "upcoming", title: "Upcoming")
            snapshot.appendSections([section])
            snapshot.appendItems(upcoming.map { .event($0) }, toSection: section)
        }
        if !earlier.isEmpty {
            let section = Section(id: "earlier", title: "Earlier")
            snapshot.appendSections([section])
            snapshot.appendItems(earlier.map { .event($0) }, toSection: section)
        }
    }

    private func updateBackground() {
        switch phase {
        case .loading:
            contentUnavailableConfiguration = UIContentUnavailableConfiguration.loading()
        case .failed(let message, let signInRequired):
            var config = UIContentUnavailableConfiguration.empty()
            config.image = UIImage(systemName: signInRequired ? "person.crop.circle" : "exclamationmark.triangle")
            config.imageProperties.tintColor = ContinuityTheme.Color.teal
            config.text = signInRequired ? "Sign in to see your library" : "Couldn't load your library"
            config.textProperties.font = ContinuityTheme.Font.display(22, weight: .semibold)
            config.secondaryText = signInRequired ? "Your articles, files, and upcoming events appear here." : message
            if signInRequired {
                config.button = .prominentGlass()
                config.button.baseBackgroundColor = ContinuityTheme.Color.teal
                config.button.baseForegroundColor = .white
                config.button.title = "Sign in"
                config.buttonProperties.primaryAction = UIAction { [weak self] _ in self?.onSignInRequested?() }
            } else {
                config.button = .glass()
                config.button.title = "Retry"
                config.buttonProperties.primaryAction = UIAction { [weak self] _ in self?.reload() }
            }
            contentUnavailableConfiguration = config
        case .loaded:
            if dataSource.snapshot().numberOfItems == 0 {
                var config = UIContentUnavailableConfiguration.empty()
                config.textProperties.font = ContinuityTheme.Font.display(22, weight: .semibold)
                switch segment {
                case .knowledge:
                    config.image = UIImage(systemName: "books.vertical")
                    config.text = "No articles yet"
                    config.secondaryText = "Articles drafted from your conversations appear here for review."
                case .files:
                    config.image = UIImage(systemName: "folder")
                    config.text = "No files yet"
                    config.secondaryText = "Connect sources on orgflow.dev."
                case .upcoming:
                    config.image = UIImage(systemName: "calendar")
                    config.text = "Nothing upcoming"
                    config.secondaryText = "Meetings and deadlines will show up here."
                case .checklists:
                    config.image = UIImage(systemName: "checklist")
                    config.text = "No checklists yet"
                    config.secondaryText = "Run a checklist from a published playbook with steps."
                }
                config.imageProperties.tintColor = ContinuityTheme.Color.secondaryInk
                contentUnavailableConfiguration = config
            } else {
                contentUnavailableConfiguration = nil
            }
        }
    }

    // MARK: Formatting

    private static func symbol(forProvider provider: String?) -> String {
        let name = (provider ?? "").lowercased()
        if name.contains("drive") { return "externaldrive" }
        if name.contains("gmail") || name.contains("mail") { return "envelope" }
        if name.contains("sharepoint") || name.contains("onedrive") { return "folder" }
        return "doc"
    }

    private static func relative(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    private static func eventDate(_ date: Date) -> String {
        date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
            + " · " + date.formatted(.dateTime.hour().minute())
    }
}

extension LibraryViewController {
    func pushArticle(_ article: Article) {
        let controller = ArticleViewController(article: article, workspace: workspace)
        controller.onPublished = { [weak self] published in
            guard let self else { return }
            replaceArticle(published)
            rebuild()
            reload()
        }
        controller.onReviewed = { [weak self] reviewed in
            self?.replaceArticle(reviewed)
            self?.rebuild()
        }
        controller.onRunChanged = { [weak self] run in self?.upsertRun(run) }
        controller.onRunDeleted = { [weak self] id in self?.removeRun(id) }
        navigationController?.pushViewController(controller, animated: true)
    }

    private func replaceArticle(_ article: Article) {
        if let index = workspace?.articles.firstIndex(where: { $0.id == article.id }) {
            workspace?.articles[index] = article
        }
    }

    private func pushChecklist(_ run: ChecklistRun) {
        let controller = ChecklistViewController(run: run, people: workspace?.people ?? [])
        controller.onChanged = { [weak self] in self?.upsertRun($0) }
        controller.onDeleted = { [weak self] in self?.removeRun($0) }
        navigationController?.pushViewController(controller, animated: true)
    }

    private func upsertRun(_ run: ChecklistRun) {
        guard workspace != nil else { return }
        if let index = workspace?.runs.firstIndex(where: { $0.id == run.id }) {
            workspace?.runs[index] = run
        } else {
            workspace?.runs.append(run)
        }
        rebuild()
    }

    private func removeRun(_ id: String) {
        workspace?.runs.removeAll { $0.id == id }
        rebuild()
    }

    private func presentCandidateActions(_ candidate: PlaybookCandidate, from indexPath: IndexPath) {
        let sheet = UIAlertController(title: candidate.title, message: candidate.summary, preferredStyle: .actionSheet)
        sheet.addAction(UIAlertAction(title: "Draft playbook", style: .default) { [weak self] _ in self?.draft(candidate) })
        sheet.addAction(UIAlertAction(title: "Dismiss", style: .destructive) { [weak self] _ in self?.dismissCandidate(candidate) })
        sheet.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        if let cell = collectionView.cellForItem(at: indexPath) {
            sheet.popoverPresentationController?.sourceView = cell
            sheet.popoverPresentationController?.sourceRect = cell.bounds
        }
        present(sheet, animated: true)
    }

    private func draft(_ candidate: PlaybookCandidate) {
        guard !isDrafting else { return }
        isDrafting = true
        var progress = UIContentUnavailableConfiguration.loading()
        progress.text = "Drafting playbook…"
        progress.secondaryText = "Reading \(candidate.evidence.count) emails and documents."
        contentUnavailableConfiguration = progress
        collectionView.isUserInteractionEnabled = false
        Task {
            defer {
                isDrafting = false
                collectionView.isUserInteractionEnabled = true
                updateBackground()
            }
            do {
                let result = try await OrgFlowAPI.shared.draftCandidate(id: candidate.id)
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                workspace?.candidates.removeAll { $0.id == candidate.id }
                if workspace?.articles.contains(where: { $0.id == result.draft.id }) == false { workspace?.articles.append(result.draft) }
                rebuild()
                pushArticle(result.draft)
                reload()
            } catch {
                UINotificationFeedbackGenerator().notificationOccurred(.error)
                let alert = UIAlertController(title: "Couldn't draft the playbook", message: error.localizedDescription, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "OK", style: .default))
                present(alert, animated: true)
            }
        }
    }

    private func dismissCandidate(_ candidate: PlaybookCandidate) {
        let previous = workspace?.candidates
        workspace?.candidates.removeAll { $0.id == candidate.id }
        rebuild()
        Task {
            do {
                try await OrgFlowAPI.shared.dismissCandidate(id: candidate.id)
            } catch {
                if let previous { workspace?.candidates = previous }
                rebuild()
                let alert = UIAlertController(title: "Couldn't dismiss the suggestion", message: error.localizedDescription, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "OK", style: .default))
                present(alert, animated: true)
            }
        }
    }
}

extension LibraryViewController: UICollectionViewDelegate {
    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        collectionView.deselectItem(at: indexPath, animated: true)
        guard let item = dataSource.itemIdentifier(for: indexPath) else { return }
        switch item {
        case .article(let article, _):
            pushArticle(article)
        case .candidate(let candidate):
            presentCandidateActions(candidate, from: indexPath)
        case .run(let run, _):
            pushChecklist(run)
        case .file(let file):
            if let url = file.url.flatMap({ URL(string: $0) }), url.scheme == "https" {
                UIApplication.shared.open(url)
            }
        case .event:
            break
        }
    }
}
