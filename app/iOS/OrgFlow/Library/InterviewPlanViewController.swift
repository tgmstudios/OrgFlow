import UIKit

/// A gap-driven interview plan (`POST /api/people/:id/interview`). Starting it switches OrgFlow to
/// Handoff and opens a live conversation; the plan is handed to the voice agent once it connects.
final class InterviewPlanViewController: UIViewController {
    var onStart: ((InterviewPlan) -> Void)?
    /// Set when the plan is already loaded for the next call: offers to remove it.
    var onRemove: (() -> Void)?

    private let plan: InterviewPlan

    init(plan: InterviewPlan) {
        self.plan = plan
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = ContinuityTheme.Color.canvas
        let stack = MapUI.scrollingStack(in: view)
        stack.addArrangedSubview(MapUI.caption("Interview plan"))
        let title = MapUI.title(plan.title, size: 28)
        stack.addArrangedSubview(title)
        let gaps = plan.gapCount
        let summary = gaps == 0
            ? "No gaps found in their records, so OneFlow uses its standard handoff questions."
            : "OneFlow found \(gaps) \(gaps == 1 ? "gap" : "gaps") in what they own and asks about \(gaps == 1 ? "it" : "those") first."
        stack.addArrangedSubview(MapUI.body(summary))
        stack.setCustomSpacing(22, after: stack.arrangedSubviews.last!)

        stack.addArrangedSubview(MapUI.caption("\(plan.questions.count) questions, in order"))
        for (index, question) in plan.questions.enumerated() {
            stack.addArrangedSubview(questionRow(index + 1, question))
        }
        stack.setCustomSpacing(22, after: stack.arrangedSubviews.last!)

        stack.addArrangedSubview(MapUI.button("Start interview", symbol: "waveform", prominent: true, action: UIAction { [weak self] _ in
            guard let self else { return }
            UIImpactFeedbackGenerator(style: .medium, view: view).impactOccurred()
            onStart?(plan)
        }))
        if let onRemove {
            stack.addArrangedSubview(MapUI.button("Remove plan", symbol: nil, prominent: false, action: UIAction { _ in onRemove() }))
        }
        let note = MapUI.body("OneFlow's voice agent asks one question at a time and follows up when an answer is vague. The transcript becomes a handoff draft; nothing is published until someone approves it.", size: 13)
        note.textAlignment = .center
        stack.addArrangedSubview(note)
    }

    private func questionRow(_ number: Int, _ question: InterviewPlan.Question) -> UIView {
        let index = UILabel()
        index.attributedText = ContinuityTheme.caption(String(format: "%02d", number), color: question.isGap ? UIColor(hex: 0x9A4B22) : ContinuityTheme.Color.teal, size: 11)
        index.setContentHuggingPriority(.required, for: .horizontal)
        let text = MapUI.body(question.text, color: ContinuityTheme.Color.ink, size: 15)
        let tag = UILabel()
        tag.attributedText = ContinuityTheme.caption(question.isGap ? "From a gap" : "Standard", color: question.isGap ? UIColor(hex: 0x9A4B22) : ContinuityTheme.Color.secondaryInk, size: 9.5)
        let column = UIStackView(arrangedSubviews: [text, tag])
        column.axis = .vertical
        column.spacing = 4
        let row = UIStackView(arrangedSubviews: [index, column])
        row.spacing = 12
        row.alignment = .firstBaseline
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0)
        return row
    }

    /// Fetches a person's plan, then presents it from `presenter`. Errors show an alert.
    static func present(personID: String, from presenter: UIViewController, onLoaded: (() -> Void)? = nil, onStart: @escaping (InterviewPlan) -> Void) {
        Task {
            defer { onLoaded?() }
            do {
                let plan = try await OrgFlowAPI.shared.interviewPlan(personID: personID)
                let controller = InterviewPlanViewController(plan: plan)
                controller.onStart = onStart
                controller.sheetPresentationController?.detents = [.large()]
                controller.sheetPresentationController?.prefersGrabberVisible = true
                presenter.present(controller, animated: true)
            } catch {
                UINotificationFeedbackGenerator(view: presenter.view).notificationOccurred(.error)
                let alert = UIAlertController(title: "Couldn't plan the interview", message: error.localizedDescription, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "OK", style: .default))
                presenter.present(alert, animated: true)
            }
        }
    }
}
