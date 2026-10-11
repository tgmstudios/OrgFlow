import UIKit

/// OrgFlow account sheet: sign in or create an account against the backend's email/password auth.
final class SignInViewController: UIViewController, UITextFieldDelegate {
    var onSignedIn: ((OrgFlowUser) -> Void)?

    private var isCreatingAccount = false
    private var isWorking = false { didSet { refresh() } }

    private let titleLabel = UILabel()
    private let subtitleLabel = UILabel()
    private let nameField = UITextField()
    private let emailField = UITextField()
    private let passwordField = UITextField()
    private let organizationField = UITextField()
    private let inviteCodeField = UITextField()
    private let workspaceChoice = UISegmentedControl(items: ["Demo workspace", "New organization", "Invite code"])
    private let errorLabel = UILabel()
    private let primaryButton = UIButton(configuration: .prominentGlass())
    private let switchButton = UIButton(configuration: .plain())
    private lazy var nameRow = fieldRow(nameField)
    private lazy var organizationRow = fieldRow(organizationField)
    private lazy var inviteCodeRow = fieldRow(inviteCodeField)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = ContinuityTheme.Color.canvas

        titleLabel.font = ContinuityTheme.Font.display(28, weight: .semibold)
        titleLabel.textColor = ContinuityTheme.Color.ink
        subtitleLabel.font = ContinuityTheme.Font.text(15)
        subtitleLabel.textColor = ContinuityTheme.Color.secondaryInk
        subtitleLabel.numberOfLines = 0

        configure(nameField, placeholder: "Name", content: .name)
        nameField.autocapitalizationType = .words
        configure(emailField, placeholder: "Work email", content: .username)
        emailField.keyboardType = .emailAddress
        emailField.autocapitalizationType = .none
        configure(passwordField, placeholder: "Password", content: .password)
        passwordField.isSecureTextEntry = true
        passwordField.returnKeyType = .go

        configure(organizationField, placeholder: "Organization name", content: .organizationName)
        organizationField.autocapitalizationType = .words
        configure(inviteCodeField, placeholder: "Invite code", content: .oneTimeCode)
        inviteCodeField.autocapitalizationType = .none
        inviteCodeField.returnKeyType = .next

        workspaceChoice.selectedSegmentIndex = 0
        workspaceChoice.setTitleTextAttributes([.font: ContinuityTheme.Font.text(12, weight: .medium)], for: .normal)
        workspaceChoice.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            errorLabel.text = nil
            UIView.animate(springDuration: 0.35) { self.refresh() }
        }, for: .valueChanged)

        errorLabel.font = ContinuityTheme.Font.text(14)
        errorLabel.textColor = UIColor(hex: 0xB5603A)
        errorLabel.numberOfLines = 0

        primaryButton.configuration?.cornerStyle = .capsule
        primaryButton.configuration?.baseBackgroundColor = ContinuityTheme.Color.teal
        primaryButton.configuration?.contentInsets = NSDirectionalEdgeInsets(top: 15, leading: 20, bottom: 15, trailing: 20)
        primaryButton.addAction(UIAction { [weak self] _ in self?.submit() }, for: .primaryActionTriggered)
        switchButton.configuration?.baseForegroundColor = ContinuityTheme.Color.teal
        switchButton.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            isCreatingAccount.toggle()
            errorLabel.text = nil
            UIView.animate(springDuration: 0.35) { self.refresh() }
        }, for: .primaryActionTriggered)

        let stack = UIStackView(arrangedSubviews: [
            titleLabel, subtitleLabel, nameRow, fieldRow(emailField), fieldRow(passwordField), workspaceChoice, organizationRow, inviteCodeRow, errorLabel, primaryButton, switchButton,
        ])
        stack.axis = .vertical
        stack.spacing = 12
        stack.setCustomSpacing(6, after: titleLabel)
        stack.setCustomSpacing(24, after: subtitleLabel)
        stack.setCustomSpacing(18, after: errorLabel)
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        let gutter = ContinuityTheme.Metrics.gutter
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 32),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: gutter),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -gutter),
        ])
        refresh()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        emailField.becomeFirstResponder()
    }

    private func configure(_ field: UITextField, placeholder: String, content: UITextContentType) {
        field.placeholder = placeholder
        field.textContentType = content
        field.font = ContinuityTheme.Font.text(17)
        field.textColor = ContinuityTheme.Color.ink
        field.autocorrectionType = .no
        field.returnKeyType = .next
        field.delegate = self
    }

    private func fieldRow(_ field: UITextField) -> UIView {
        let effect = UIGlassEffect()
        let container = UIVisualEffectView(effect: effect)
        container.cornerConfiguration = .capsule()
        field.translatesAutoresizingMaskIntoConstraints = false
        container.contentView.addSubview(field)
        NSLayoutConstraint.activate([
            container.heightAnchor.constraint(equalToConstant: 52),
            field.leadingAnchor.constraint(equalTo: container.contentView.leadingAnchor, constant: 20),
            field.trailingAnchor.constraint(equalTo: container.contentView.trailingAnchor, constant: -20),
            field.centerYAnchor.constraint(equalTo: container.contentView.centerYAnchor),
        ])
        return container
    }

    private func refresh() {
        titleLabel.text = isCreatingAccount ? "Create your account" : "Sign in to OrgFlow"
        subtitleLabel.text = isCreatingAccount
            ? "Your answers come from your organization's approved knowledge."
            : "Use the account you use for OrgFlow on the web."
        nameRow.isHidden = !isCreatingAccount
        nameRow.alpha = isCreatingAccount ? 1 : 0
        let choice = workspaceChoice.selectedSegmentIndex
        workspaceChoice.isHidden = !isCreatingAccount
        workspaceChoice.alpha = isCreatingAccount ? 1 : 0
        organizationRow.isHidden = !(isCreatingAccount && choice == 1)
        organizationRow.alpha = organizationRow.isHidden ? 0 : 1
        inviteCodeRow.isHidden = !(isCreatingAccount && choice == 2)
        inviteCodeRow.alpha = inviteCodeRow.isHidden ? 0 : 1
        workspaceChoice.isEnabled = !isWorking
        primaryButton.configuration?.title = isCreatingAccount ? "Create account" : "Sign in"
        primaryButton.configuration?.showsActivityIndicator = isWorking
        primaryButton.isEnabled = !isWorking
        switchButton.configuration?.title = isCreatingAccount ? "I already have an account" : "Create an account"
        switchButton.isEnabled = !isWorking
        errorLabel.isHidden = errorLabel.text == nil
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        switch textField {
        case nameField: emailField.becomeFirstResponder()
        case emailField: passwordField.becomeFirstResponder()
        case passwordField where isCreatingAccount && workspaceChoice.selectedSegmentIndex == 1: organizationField.becomeFirstResponder()
        case passwordField where isCreatingAccount && workspaceChoice.selectedSegmentIndex == 2: inviteCodeField.becomeFirstResponder()
        default: submit()
        }
        return true
    }

    private func submit() {
        guard !isWorking else { return }
        let email = (emailField.text ?? "").trimmingCharacters(in: .whitespaces)
        let password = passwordField.text ?? ""
        let name = (nameField.text ?? "").trimmingCharacters(in: .whitespaces)
        let choice = workspaceChoice.selectedSegmentIndex
        let organization = isCreatingAccount && choice == 1 ? (organizationField.text ?? "").trimmingCharacters(in: .whitespaces) : ""
        let inviteCode = isCreatingAccount && choice == 2 ? (inviteCodeField.text ?? "").trimmingCharacters(in: .whitespaces) : ""
        if isCreatingAccount, choice == 1, organization.isEmpty { errorLabel.text = "Enter a name for your organization."; refresh(); return }
        if isCreatingAccount, choice == 2, inviteCode.isEmpty { errorLabel.text = "Enter the invite code you were given."; refresh(); return }
        errorLabel.text = nil
        isWorking = true
        Task {
            do {
                let user = isCreatingAccount
                    ? try await OrgFlowAPI.shared.signUp(
                        name: name, email: email, password: password,
                        organization: organization.isEmpty ? nil : organization,
                        inviteCode: inviteCode.isEmpty ? nil : inviteCode
                    )
                    : try await OrgFlowAPI.shared.signIn(email: email, password: password)
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                onSignedIn?(user)
                dismiss(animated: true)
            } catch {
                errorLabel.text = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                isWorking = false
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            }
        }
    }
}
