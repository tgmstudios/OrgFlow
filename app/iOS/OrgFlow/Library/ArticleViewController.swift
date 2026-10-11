import UIKit

extension Article {
    /// Short human-readable state used in lists and the article header.
    var statusBadge: String {
        if isSample { return "Sample" }
        if isDraft { return hasPublishedVersion ? "Changes awaiting review" : "Draft — awaiting review" }
        return "Published"
    }

    var statusColor: UIColor {
        if isSample { return ContinuityTheme.Color.iris }
        return isDraft ? ContinuityTheme.Color.apricot : ContinuityTheme.Color.teal
    }

    /// The version a reader should see: drafts show the draft, published articles the live snapshot.
    var visibleContent: RichTextNode? { isDraft ? content : (publishedContent ?? content) }
    var visibleTitle: String { isDraft ? title : displayTitle }
    var updatedDate: Date? { OrgFlowDates.parse(updatedAt) }

    /// True when the published version has list items a checklist can be run from.
    var hasRunnableChecklist: Bool {
        guard hasPublishedVersion || !isDraft, let doc = publishedContent ?? content else { return false }
        func containsListItem(_ node: RichTextNode) -> Bool {
            node.type == "listItem" || node.type == "taskItem" || (node.content ?? []).contains(where: containsListItem)
        }
        return containsListItem(doc)
    }
}

nonisolated enum OrgFlowDates {
    static func parse(_ string: String?) -> Date? {
        guard let string else { return nil }
        return (try? Date(string, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))) ?? (try? Date(string, strategy: .iso8601))
    }
}

final class ArticleViewController: UIViewController {
    var onPublished: ((Article) -> Void)?
    /// Called after the article is marked reviewed.
    var onReviewed: ((Article) -> Void)?
    /// Called when a checklist run is started or changed from this screen.
    var onRunChanged: ((ChecklistRun) -> Void)?
    var onRunDeleted: ((String) -> Void)?

    private var article: Article?
    private var workspace: Workspace?
    private let articleID: String?
    private var isPublishing = false

    private let scrollView = UIScrollView()
    private let stack = UIStackView()
    private let bottomBar = UIView()
    private let publishButton = UIButton(type: .system)
    private let noteLabel = UILabel()
    private let errorLabel = UILabel()

    private init(article: Article?, articleID: String?, workspace: Workspace?) {
        self.article = article
        self.articleID = articleID
        self.workspace = workspace
        super.init(nibName: nil, bundle: nil)
    }

    convenience init(article: Article, workspace: Workspace?) {
        self.init(article: article, articleID: nil, workspace: workspace)
    }

    convenience init(articleID: String) {
        self.init(article: nil, articleID: articleID, workspace: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = ContinuityTheme.Color.canvas
        navigationItem.largeTitleDisplayMode = .never
        buildLayout()
        if let nav = navigationController, nav.viewControllers.first === self, nav.presentingViewController != nil {
            navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .close, primaryAction: UIAction { [weak self] _ in
                self?.dismiss(animated: true)
            })
        }
        if article != nil {
            render()
        } else {
            load()
        }
    }

    // MARK: Loading

    private func load() {
        guard let articleID else { return }
        contentUnavailableConfiguration = UIContentUnavailableConfiguration.loading()
        Task {
            do {
                let workspace = try await OrgFlowAPI.shared.workspace()
                self.workspace = workspace
                if let found = workspace.article(articleID) {
                    article = found
                    contentUnavailableConfiguration = nil
                    render()
                } else {
                    showError("This article couldn't be found. It may have been removed.", retry: false)
                }
            } catch {
                showError(error.localizedDescription, retry: true)
            }
        }
    }

    private func showError(_ message: String, retry: Bool) {
        var config = UIContentUnavailableConfiguration.empty()
        config.image = UIImage(systemName: "doc.text")
        config.text = "Couldn't open article"
        config.secondaryText = message
        if retry {
            config.button = .plain()
            config.button.title = "Retry"
            config.buttonProperties.primaryAction = UIAction { [weak self] _ in self?.load() }
        }
        contentUnavailableConfiguration = config
    }

    // MARK: Layout

    private func buildLayout() {
        let gutter = ContinuityTheme.Metrics.gutter

        bottomBar.backgroundColor = ContinuityTheme.Color.canvas
        bottomBar.translatesAutoresizingMaskIntoConstraints = false
        let rule = UIView()
        rule.backgroundColor = ContinuityTheme.Color.hairline
        rule.translatesAutoresizingMaskIntoConstraints = false
        bottomBar.addSubview(rule)

        var config = UIButton.Configuration.prominentGlass()
        config.title = "Approve & publish"
        config.cornerStyle = .capsule
        config.baseBackgroundColor = ContinuityTheme.Color.teal
        config.baseForegroundColor = .white
        config.buttonSize = .large
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var out = incoming
            out.font = ContinuityTheme.Font.text(17, weight: .semibold)
            return out
        }
        publishButton.configuration = config
        publishButton.addAction(UIAction { [weak self] _ in self?.publish() }, for: .touchUpInside)

        noteLabel.text = "Publishing makes this available to everyone who asks."
        noteLabel.font = ContinuityTheme.Font.text(13)
        noteLabel.textColor = ContinuityTheme.Color.secondaryInk
        noteLabel.textAlignment = .center
        noteLabel.numberOfLines = 0

        errorLabel.font = ContinuityTheme.Font.text(13)
        errorLabel.textColor = .systemRed
        errorLabel.textAlignment = .center
        errorLabel.numberOfLines = 0
        errorLabel.isHidden = true

        let barStack = UIStackView(arrangedSubviews: [publishButton, errorLabel, noteLabel])
        barStack.axis = .vertical
        barStack.spacing = 8
        barStack.translatesAutoresizingMaskIntoConstraints = false
        bottomBar.addSubview(barStack)

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.alwaysBounceVertical = true
        stack.axis = .vertical
        stack.alignment = .fill
        stack.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(stack)

        view.addSubview(scrollView)
        view.addSubview(bottomBar)

        let barBottom = bottomBar.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: bottomBar.topAnchor),

            bottomBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bottomBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            barBottom,

            rule.topAnchor.constraint(equalTo: bottomBar.topAnchor),
            rule.leadingAnchor.constraint(equalTo: bottomBar.leadingAnchor),
            rule.trailingAnchor.constraint(equalTo: bottomBar.trailingAnchor),
            rule.heightAnchor.constraint(equalToConstant: ContinuityTheme.Metrics.hairline),

            barStack.topAnchor.constraint(equalTo: bottomBar.topAnchor, constant: 14),
            barStack.leadingAnchor.constraint(equalTo: bottomBar.leadingAnchor, constant: gutter),
            barStack.trailingAnchor.constraint(equalTo: bottomBar.trailingAnchor, constant: -gutter),
            barStack.bottomAnchor.constraint(equalTo: bottomBar.safeAreaLayoutGuide.bottomAnchor, constant: -8),

            stack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 12),
            stack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -32),
            stack.leadingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.leadingAnchor, constant: gutter),
            stack.trailingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.trailingAnchor, constant: -gutter),
        ])
    }

    // MARK: Rendering

    private func render() {
        guard let article else { return }
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }

        let categoryName = workspace?.category(article.categoryId)?.name ?? "Article"
        let caption = NSMutableAttributedString(attributedString: ContinuityTheme.caption(categoryName))
        caption.append(ContinuityTheme.caption("  ·  "))
        caption.append(ContinuityTheme.caption(article.statusBadge, color: article.isSample || article.isDraft ? article.statusColor : ContinuityTheme.Color.teal))
        let captionLabel = UILabel()
        captionLabel.numberOfLines = 0
        captionLabel.attributedText = caption
        stack.addArrangedSubview(captionLabel)
        stack.setCustomSpacing(10, after: captionLabel)

        let titleLabel = UILabel()
        titleLabel.numberOfLines = 0
        titleLabel.font = ContinuityTheme.Font.display(32, weight: .semibold)
        titleLabel.textColor = ContinuityTheme.Color.ink
        titleLabel.text = article.visibleTitle
        stack.addArrangedSubview(titleLabel)
        stack.setCustomSpacing(8, after: titleLabel)

        if let date = article.updatedDate {
            let updated = UILabel()
            updated.font = ContinuityTheme.Font.text(13)
            updated.textColor = ContinuityTheme.Color.secondaryInk
            updated.text = "Updated " + date.formatted(date: .abbreviated, time: .shortened)
            stack.addArrangedSubview(updated)
        }
        if article.hasPublishedVersion || !article.isDraft {
            if article.publishedBy != nil || article.publishedDate != nil {
                let approved = UILabel()
                approved.font = ContinuityTheme.Font.text(13)
                approved.textColor = ContinuityTheme.Color.secondaryInk
                approved.numberOfLines = 0
                var parts = [article.publishedBy.map { "Approved by \($0.name)" } ?? "Approved"]
                if let date = article.publishedDate { parts.append(date.formatted(date: .abbreviated, time: .omitted)) }
                approved.text = parts.joined(separator: " · ")
                stack.addArrangedSubview(approved)
            }
            if let due = article.reviewDueDate {
                let review = UILabel()
                let overdue = article.isDueForReview
                review.font = ContinuityTheme.Font.text(13, weight: overdue ? .semibold : .regular)
                review.textColor = overdue ? UIColor(hex: 0xB5603A) : ContinuityTheme.Color.secondaryInk
                review.numberOfLines = 0
                review.text = (overdue ? "Review due " : "Next review ") + due.formatted(date: .abbreviated, time: .omitted)
                stack.addArrangedSubview(review)
            }
        }
        if let last = stack.arrangedSubviews.last { stack.setCustomSpacing(22, after: last) }

        let body = UITextView()
        body.isEditable = false
        body.isScrollEnabled = false
        body.backgroundColor = .clear
        body.textContainerInset = .zero
        body.textContainer.lineFragmentPadding = 0
        body.linkTextAttributes = [
            .foregroundColor: ContinuityTheme.Color.teal,
            .underlineStyle: NSUnderlineStyle.single.rawValue,
        ]
        if let doc = article.visibleContent {
            body.attributedText = RichTextRenderer.attributedString(for: doc)
        } else {
            body.attributedText = NSAttributedString(string: "This article has no content yet.", attributes: [
                .font: ContinuityTheme.Font.text(17), .foregroundColor: ContinuityTheme.Color.secondaryInk,
            ])
        }
        stack.addArrangedSubview(body)

        if let sources = article.sources, !sources.isEmpty {
            let spacer = UIView()
            spacer.heightAnchor.constraint(equalToConstant: 16).isActive = true
            stack.addArrangedSubview(spacer)

            let rule = UIView()
            rule.backgroundColor = ContinuityTheme.Color.hairline
            rule.heightAnchor.constraint(equalToConstant: ContinuityTheme.Metrics.hairline).isActive = true
            stack.addArrangedSubview(rule)
            stack.setCustomSpacing(14, after: rule)

            let header = UILabel()
            header.attributedText = ContinuityTheme.caption("Sources")
            stack.addArrangedSubview(header)
            stack.setCustomSpacing(4, after: header)

            for source in sources { stack.addArrangedSubview(sourceRow(source)) }
        }

        let shareItem = UIBarButtonItem(systemItem: .action, primaryAction: UIAction { [weak self] _ in self?.share() })
        var menuActions: [UIMenuElement] = []
        if article.hasRunnableChecklist, article.hasPublishedVersion || !article.isDraft {
            menuActions.append(UIAction(title: "Run checklist", image: UIImage(systemName: "checklist")) { [weak self] _ in self?.startChecklist() })
        }
        if article.reviewDueAt != nil, article.hasPublishedVersion || !article.isDraft {
            menuActions.append(UIAction(title: "Mark reviewed", image: UIImage(systemName: "checkmark.seal")) { [weak self] _ in self?.markReviewed() })
        }
        if menuActions.isEmpty {
            navigationItem.rightBarButtonItems = [shareItem]
        } else {
            let more = UIBarButtonItem(image: UIImage(systemName: "ellipsis"), menu: UIMenu(children: menuActions))
            navigationItem.rightBarButtonItems = [more, shareItem]
        }
        updateBottomBar()
    }

    private func sourceRow(_ source: ArticleSource) -> UIView {
        let url = source.url.flatMap { URL(string: $0) }.flatMap { $0.scheme == "https" ? $0 : nil }
        var config = UIButton.Configuration.plain()
        config.title = source.title
        config.subtitle = source.status?.capitalized
        config.baseForegroundColor = ContinuityTheme.Color.ink
        config.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0)
        config.titleAlignment = .leading
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var out = incoming
            out.font = ContinuityTheme.Font.text(15, weight: .medium)
            return out
        }
        config.subtitleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var out = incoming
            out.font = ContinuityTheme.Font.text(12)
            out.foregroundColor = ContinuityTheme.Color.secondaryInk
            return out
        }
        if url != nil {
            config.image = UIImage(systemName: "arrow.up.right")
            config.imagePlacement = .trailing
            config.imagePadding = 8
            config.imageColorTransformer = UIConfigurationColorTransformer { _ in ContinuityTheme.Color.teal }
        }
        let button = UIButton(configuration: config)
        button.contentHorizontalAlignment = .fill
        if let url {
            button.addAction(UIAction { _ in UIApplication.shared.open(url) }, for: .touchUpInside)
        } else {
            button.isUserInteractionEnabled = false
        }
        return button
    }

    private func updateBottomBar() {
        let showBar = article?.isDraft == true
        bottomBar.isHidden = !showBar
        var config = publishButton.configuration
        config?.showsActivityIndicator = isPublishing
        config?.title = isPublishing ? "Publishing…" : "Approve & publish"
        publishButton.configuration = config
        publishButton.isEnabled = !isPublishing
    }

    // MARK: Actions

    private func publish() {
        guard let article, article.isDraft, !isPublishing else { return }
        isPublishing = true
        errorLabel.isHidden = true
        updateBottomBar()
        Task {
            do {
                let published = try await OrgFlowAPI.shared.publishArticle(id: article.id)
                isPublishing = false
                self.article = published
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                render()
                onPublished?(published)
            } catch {
                isPublishing = false
                errorLabel.text = error.localizedDescription
                errorLabel.isHidden = false
                updateBottomBar()
            }
        }
    }

    private func startChecklist() {
        guard let article else { return }
        Task {
            do {
                let run = try await OrgFlowAPI.shared.startRun(articleID: article.id, title: article.displayTitle)
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                onRunChanged?(run)
                let checklist = ChecklistViewController(run: run, people: workspace?.people ?? [])
                checklist.onChanged = onRunChanged
                checklist.onDeleted = onRunDeleted
                navigationController?.pushViewController(checklist, animated: true)
            } catch {
                showAlert("Couldn't start the checklist", error)
            }
        }
    }

    private func markReviewed() {
        guard let article else { return }
        Task {
            do {
                let reviewed = try await OrgFlowAPI.shared.markReviewed(articleID: article.id)
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                self.article = reviewed
                render()
                onReviewed?(reviewed)
            } catch {
                showAlert("Couldn't mark as reviewed", error)
            }
        }
    }

    private func showAlert(_ title: String, _ error: Error) {
        let alert = UIAlertController(title: title, message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    private func share() {
        guard let article else { return }
        var items: [Any] = [article.visibleTitle]
        if let text = article.visibleContent?.plainText, !text.isEmpty { items.append(text) }
        let controller = UIActivityViewController(activityItems: [items.compactMap { $0 as? String }.joined(separator: "\n\n")], applicationActivities: nil)
        controller.popoverPresentationController?.sourceItem = navigationItem.rightBarButtonItems?.last
        present(controller, animated: true)
    }
}
