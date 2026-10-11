import UIKit

nonisolated struct Suggestion: Hashable, Sendable {
    let symbol: String
    let text: String
    /// Set for a suggested playbook: tapping drafts it from the candidate's evidence.
    var candidateID: String?

    static let defaults: [Suggestion] = [
        Suggestion(symbol: "person.badge.plus", text: "Onboard a new team member"),
        Suggestion(symbol: "arrow.triangle.branch", text: "Find our donor follow-up process"),
        Suggestion(symbol: "arrow.left.arrow.right", text: "Prepare a role handoff"),
    ]
}

/// A horizontally scrolling row of glass capsules, suspended just above the composer.
final class SuggestionCapsulesView: UIView {
    var onSelect: ((Suggestion) -> Void)?

    private let scrollView = UIScrollView()
    private let stack = UIStackView()
    private var buttons: [UIView] = []

    init(suggestions: [Suggestion], horizontalInset: CGFloat) {
        super.init(frame: .zero)
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.alwaysBounceHorizontal = true
        scrollView.clipsToBounds = false
        scrollView.contentInset = UIEdgeInsets(top: 0, left: horizontalInset, bottom: 0, right: horizontalInset)
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(scrollView)

        stack.axis = .horizontal
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(stack)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: topAnchor),
            scrollView.bottomAnchor.constraint(equalTo: bottomAnchor),
            scrollView.leadingAnchor.constraint(equalTo: leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
            stack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor),
            stack.heightAnchor.constraint(equalTo: scrollView.frameLayoutGuide.heightAnchor),
            heightAnchor.constraint(equalToConstant: 42),
        ])
        setSuggestions(suggestions, animated: false)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    private var current: [Suggestion] = []
    private var isRevealed = true

    /// Replaces the capsules, cross-fading in the new ones when visible.
    func setSuggestions(_ suggestions: [Suggestion], animated: Bool) {
        guard suggestions != current else { return }
        current = suggestions
        let old = buttons
        buttons = []
        for suggestion in suggestions {
            var config = UIButton.Configuration.glass()
            config.cornerStyle = .capsule
            config.image = UIImage(systemName: suggestion.symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 13, weight: .medium))
            config.imagePadding = 7
            config.imageColorTransformer = UIConfigurationColorTransformer { _ in ContinuityTheme.Color.teal }
            config.baseForegroundColor = ContinuityTheme.Color.ink
            config.contentInsets = NSDirectionalEdgeInsets(top: 10, leading: 14, bottom: 10, trailing: 16)
            config.attributedTitle = AttributedString(suggestion.text, attributes: AttributeContainer([
                .font: ContinuityTheme.Font.text(15, weight: .medium),
            ]))
            let button = UIButton(configuration: config)
            button.addAction(UIAction { [weak self] _ in
                UISelectionFeedbackGenerator().selectionChanged()
                self?.onSelect?(suggestion)
            }, for: .primaryActionTriggered)
            buttons.append(button)
        }
        let install = {
            old.forEach { $0.removeFromSuperview() }
            self.buttons.forEach { self.stack.addArrangedSubview($0) }
            self.scrollView.contentOffset.x = -self.scrollView.contentInset.left
            for button in self.buttons {
                button.alpha = 0
                button.transform = CGAffineTransform(translationX: 0, y: 10)
            }
            self.setRevealed(self.isRevealed, animated: animated)
        }
        guard animated, !old.isEmpty else { return install() }
        UIView.animate(withDuration: 0.2, animations: { old.forEach { $0.alpha = 0 } }, completion: { _ in install() })
    }

    /// Staggered rise-and-fade entrance / exit.
    func setRevealed(_ revealed: Bool, animated: Bool) {
        isRevealed = revealed
        isUserInteractionEnabled = revealed
        for (i, button) in buttons.enumerated() {
            let apply = {
                button.alpha = revealed ? 1 : 0
                button.transform = revealed ? .identity : CGAffineTransform(translationX: 0, y: 10)
            }
            if animated {
                UIView.animate(springDuration: 0.5, bounce: 0.15, initialSpringVelocity: 0, delay: Double(i) * 0.05, options: [.allowUserInteraction], animations: apply)
            } else {
                apply()
            }
        }
    }
}
