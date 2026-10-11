import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var askViewController: AskViewController?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        let controller = AskViewController(coordinator: AskScreenCoordinator())
        window.rootViewController = controller
        window.tintColor = ContinuityTheme.Color.teal
        // The palette is light-only; this also keeps Liquid Glass in its light rendering.
        window.overrideUserInterfaceStyle = .light
        window.makeKeyAndVisible()
        self.window = window
        askViewController = controller
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        askViewController?.sceneDidEnterBackground()
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        askViewController?.sceneWillEnterForeground()
    }
}
