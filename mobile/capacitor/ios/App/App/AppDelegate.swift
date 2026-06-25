import SwiftUI
import UIKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = UIHostingController(rootView: TurbalanceNativeAppView())
        window.tintColor = UIColor(red: 0.00, green: 0.56, blue: 0.45, alpha: 1.0)
        self.window = window
        window.makeKeyAndVisible()
        return true
    }
}
