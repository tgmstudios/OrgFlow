import UIKit

/// The app's tabs: Ask (Ask, Capture and Handoff around the knot), Library, the Knowledge map,
/// Knowledge health and People. Sheets are kept for things that are momentary: sign-in, an article
/// opened from an answer, a handover to confirm, an interview plan.
final class AppTabBarController: UITabBarController {
    let ask: AskViewController
    private let library = LibraryViewController(workspace: nil)
    private let map = KnowledgeMapViewController(workspace: nil)
    private let health = KnowledgeHealthViewController(workspace: nil)
    private let people = PeopleViewController(workspace: nil)

    private enum Tab: Int { case ask, library, map, health, people }

    init(ask: AskViewController) {
        self.ask = ask
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = ContinuityTheme.Color.canvas

        let startInterview: (InterviewPlan) -> Void = { [weak self] plan in self?.startInterview(plan) }
        let signIn: () -> Void = { [weak self] in self?.ask.presentSignIn() }
        library.onSignInRequested = signIn
        map.onSignInRequested = signIn
        map.onStartInterview = startInterview
        health.onSignInRequested = signIn
        health.onStartInterview = startInterview
        people.onSignInRequested = signIn
        people.onStartInterview = startInterview
        ask.onShowKnowledgeMap = { [weak self] in self?.show(.map) }
        ask.onSignedIn = { [weak self] in self?.reloadAll() }

        ask.tabBarItem = UITabBarItem(title: "Ask", image: UIImage(systemName: "bubble.left.and.text.bubble.right"), tag: Tab.ask.rawValue)
        viewControllers = [
            ask,
            navigation(library, title: "Library", symbol: "books.vertical", tab: .library),
            navigation(map, title: "Map", symbol: "point.3.connected.trianglepath.dotted", tab: .map),
            navigation(health, title: "Health", symbol: "waveform.path.ecg", tab: .health),
            navigation(people, title: "People", symbol: "person.2", tab: .people),
        ]
        tabBar.tintColor = ContinuityTheme.Color.teal
    }

    private func navigation(_ root: UIViewController, title: String, symbol: String, tab: Tab) -> UINavigationController {
        let nav = UINavigationController(rootViewController: root)
        nav.tabBarItem = UITabBarItem(title: title, image: UIImage(systemName: symbol), tag: tab.rawValue)
        nav.navigationBar.tintColor = ContinuityTheme.Color.teal
        return nav
    }

    private func show(_ tab: Tab) {
        if let nav = viewControllers?[tab.rawValue] as? UINavigationController {
            nav.popToRootViewController(animated: false)
        }
        selectedIndex = tab.rawValue
    }

    /// From any tab: close whatever is showing, switch to Ask and start the planned interview there.
    private func startInterview(_ plan: InterviewPlan) {
        let begin = { [weak self] in
            guard let self else { return }
            selectedIndex = Tab.ask.rawValue
            ask.beginInterview(plan)
        }
        if presentedViewController != nil {
            dismiss(animated: true, completion: begin)
        } else {
            begin()
        }
    }

    private func reloadAll() {
        if library.isViewLoaded { library.reload() }
        if map.isViewLoaded { Task { await map.refresh() } }
        if health.isViewLoaded { health.load() }
        if people.isViewLoaded { people.reload() }
    }

    // Scene lifecycle, forwarded to the knot.
    func sceneDidEnterBackground() { ask.sceneDidEnterBackground() }
    func sceneWillEnterForeground() { ask.sceneWillEnterForeground() }
}
