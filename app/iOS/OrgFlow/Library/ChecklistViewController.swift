import UIKit

/// One run of a playbook's checklist: progress, and steps that can be ticked off.
final class ChecklistViewController: UIViewController {
    var onChanged: ((ChecklistRun) -> Void)?
    var onDeleted: ((String) -> Void)?

    private var run: ChecklistRun
    private let people: [Person]
    /// Steps with a request in flight; a server reply never overrides their optimistic state.
    private var pending: Set<String> = []

    private let captionLabel = UILabel()
    private let titleLabel = UILabel()
    private let detailLabel = UILabel()
    private let progressView = UIProgressView(progressViewStyle: .bar)
    private var collectionView: UICollectionView!
    private var dataSource: UICollectionViewDiffableDataSource<Int, String>!

    init(run: ChecklistRun, people: [Person]) {
        self.run = run
        self.people = people
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = ContinuityTheme.Color.canvas
        navigationItem.largeTitleDisplayMode = .never
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            image: UIImage(systemName: "ellipsis"),
            menu: UIMenu(children: [
                UIAction(title: "Delete", image: UIImage(systemName: "trash"), attributes: .destructive) { [weak self] _ in
                    self?.confirmDelete()
                },
            ])
        )
        buildHeader()
        buildList()
        update()
    }

    // MARK: Layout

    private func buildHeader() {
        let gutter = ContinuityTheme.Metrics.gutter
        titleLabel.font = ContinuityTheme.Font.display(28, weight: .semibold)
        titleLabel.textColor = ContinuityTheme.Color.ink
        titleLabel.numberOfLines = 0
        detailLabel.font = ContinuityTheme.Font.text(14)
        detailLabel.textColor = ContinuityTheme.Color.secondaryInk
        detailLabel.numberOfLines = 0
        progressView.trackTintColor = ContinuityTheme.Color.hairline
        progressView.progressTintColor = ContinuityTheme.Color.teal

        let header = UIStackView(arrangedSubviews: [captionLabel, titleLabel, detailLabel, progressView])
        header.axis = .vertical
        header.spacing = 8
        header.setCustomSpacing(12, after: detailLabel)
        header.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(header)

        let layout = UICollectionViewCompositionalLayout { _, environment in
            var config = UICollectionLayoutListConfiguration(appearance: .insetGrouped)
            config.backgroundColor = .clear
            config.separatorConfiguration.color = ContinuityTheme.Color.hairline
            return NSCollectionLayoutSection.list(using: config, layoutEnvironment: environment)
        }
        collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
        collectionView.backgroundColor = .clear
        collectionView.delegate = self
        collectionView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(collectionView)

        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: gutter),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -gutter),
            collectionView.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 8),
            collectionView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            collectionView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            collectionView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    private func buildList() {
        let registration = UICollectionView.CellRegistration<UICollectionViewListCell, String> { [weak self] cell, _, stepID in
            guard let self, let step = run.steps.first(where: { $0.id == stepID }) else { return }
            var content = UIListContentConfiguration.subtitleCell()
            content.text = step.text
            content.textProperties.font = ContinuityTheme.Font.text(16, weight: .medium)
            content.textProperties.color = step.done ? ContinuityTheme.Color.secondaryInk : ContinuityTheme.Color.ink
            content.secondaryTextProperties.font = ContinuityTheme.Font.text(13)
            content.secondaryTextProperties.color = ContinuityTheme.Color.secondaryInk
            content.textToSecondaryTextVerticalPadding = 3
            if step.done {
                let who = step.doneBy.map { "Done by \($0.name)" } ?? "Done"
                let when = step.doneDate.map { "  ·  " + $0.formatted(.dateTime.month(.abbreviated).day().hour().minute()) } ?? ""
                content.secondaryText = who + when
            } else {
                content.secondaryText = nil
            }
            cell.contentConfiguration = content

            var config = UIButton.Configuration.plain()
            config.image = UIImage(systemName: step.done ? "checkmark.circle.fill" : "circle", withConfiguration: UIImage.SymbolConfiguration(pointSize: 24, weight: .regular))
            config.baseForegroundColor = step.done ? ContinuityTheme.Color.teal : ContinuityTheme.Color.secondaryInk
            config.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 8)
            let button = UIButton(configuration: config)
            button.addAction(UIAction { [weak self] _ in self?.toggle(stepID) }, for: .primaryActionTriggered)
            cell.accessories = [.customView(configuration: .init(customView: button, placement: .leading(), reservedLayoutWidth: .actual))]

            var background = UIBackgroundConfiguration.listCell()
            background.backgroundColor = .white
            cell.backgroundConfiguration = background
        }
        dataSource = UICollectionViewDiffableDataSource(collectionView: collectionView) { collectionView, indexPath, stepID in
            collectionView.dequeueConfiguredReusableCell(using: registration, for: indexPath, item: stepID)
        }
        var snapshot = NSDiffableDataSourceSnapshot<Int, String>()
        snapshot.appendSections([0])
        snapshot.appendItems(run.steps.map(\.id))
        dataSource.apply(snapshot, animatingDifferences: false)
    }

    // MARK: State

    private func update() {
        let done = run.completedCount
        let total = run.steps.count
        let caption = run.isCompleted ? "Checklist  ·  Completed" : "Checklist"
        captionLabel.attributedText = ContinuityTheme.caption(caption, color: run.isCompleted ? ContinuityTheme.Color.teal : ContinuityTheme.Color.secondaryInk)
        titleLabel.text = run.title
        var parts = ["\(done) of \(total)"]
        if let name = people.first(where: { $0.id == run.assigneeId })?.name { parts.append(name) }
        if let started = run.startedDate { parts.append("Started " + started.formatted(.dateTime.month(.abbreviated).day())) }
        detailLabel.text = parts.joined(separator: "  ·  ")
        progressView.setProgress(total == 0 ? 0 : Float(done) / Float(total), animated: true)
        var snapshot = dataSource.snapshot()
        snapshot.reconfigureItems(snapshot.itemIdentifiers)
        dataSource.apply(snapshot, animatingDifferences: false)
    }

    private func toggle(_ stepID: String) {
        guard let index = run.steps.firstIndex(where: { $0.id == stepID }), !pending.contains(stepID) else { return }
        let previous = run
        let done = !run.steps[index].done
        run.steps[index].done = done
        let nowCompleted = run.completedCount == run.steps.count
        if nowCompleted { run.status = "completed" } else { run.status = "active" }
        pending.insert(stepID)
        if done { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        update()

        Task {
            defer { pending.remove(stepID) }
            do {
                let saved = try await OrgFlowAPI.shared.setStep(runID: run.id, stepID: stepID, done: done)
                var merged = saved
                // Keep optimistic state for any other step still in flight.
                for (i, step) in run.steps.enumerated() where pending.contains(step.id) && step.id != stepID {
                    if let j = merged.steps.firstIndex(where: { $0.id == step.id }) { merged.steps[j].done = run.steps[i].done }
                }
                let wasCompleted = previous.isCompleted
                run = merged
                if merged.isCompleted, !wasCompleted { UINotificationFeedbackGenerator().notificationOccurred(.success) }
                update()
                onChanged?(run)
            } catch {
                if let current = run.steps.firstIndex(where: { $0.id == stepID }), let old = previous.steps.first(where: { $0.id == stepID }) {
                    run.steps[current].done = old.done
                    run.status = run.completedCount == run.steps.count && !run.steps.isEmpty ? "completed" : "active"
                }
                update()
                UINotificationFeedbackGenerator().notificationOccurred(.error)
                let alert = UIAlertController(title: "Couldn't update the step", message: error.localizedDescription, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "OK", style: .default))
                present(alert, animated: true)
            }
        }
    }

    private func confirmDelete() {
        let alert = UIAlertController(title: "Delete this checklist?", message: "Its progress will be removed. The playbook stays.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        alert.addAction(UIAlertAction(title: "Delete", style: .destructive) { [weak self] _ in self?.delete() })
        present(alert, animated: true)
    }

    private func delete() {
        let id = run.id
        Task {
            do {
                try await OrgFlowAPI.shared.deleteRun(id: id)
                onDeleted?(id)
                if let nav = navigationController, nav.viewControllers.first !== self {
                    nav.popViewController(animated: true)
                } else {
                    dismiss(animated: true)
                }
            } catch {
                let alert = UIAlertController(title: "Couldn't delete the checklist", message: error.localizedDescription, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "OK", style: .default))
                present(alert, animated: true)
            }
        }
    }
}

extension ChecklistViewController: UICollectionViewDelegate {
    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        collectionView.deselectItem(at: indexPath, animated: true)
        if let stepID = dataSource.itemIdentifier(for: indexPath) { toggle(stepID) }
    }
}
