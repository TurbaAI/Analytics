import UIKit
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    // Keep a reference to the current live activity id if started (safe across OS versions)
    private var currentActivityId: String? = nil

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        if #available(iOS 16.1, *) {
            requestLiveActivityAuthorization()
        }
        configureWebViewSafeAreaHandling()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
        applySafeAreaToCapacitorWebView()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    @available(iOS 16.1, *)
    private func requestLiveActivityAuthorization() {
        // Request authorization to use Live Activities
        Task { @MainActor in
            do {
                _ = try await ActivityAuthorizationInfo().areActivitiesEnabled
            } catch {
                // No explicit UI here; apps typically handle errors upstream
                print("Live Activities authorization check failed: \(error)")
            }
        }
    }

    // MARK: - Live Activity Controls

    /// Starts a generic progress live activity for showcasing Dynamic Island usage.
    @available(iOS 16.1, *)
    func startGenericProgressActivity(title: String = "Processing", subtitle: String? = nil, progress: Double = 0.0) {
        let attributes = GenericProgressAttributes(title: title)
        let contentState = GenericProgressAttributes.ContentState(subtitle: subtitle, progress: min(max(progress, 0.0), 1.0))
        do {
            let activity = try Activity<GenericProgressAttributes>.request(attributes: attributes, contentState: contentState, pushType: nil)
            self.currentActivityId = activity.id
            print("Started Live Activity with id: \(activity.id)")
        } catch {
            print("Failed to start Live Activity: \(error)")
        }
    }

    /// Updates the current generic progress live activity.
    @available(iOS 16.1, *)
    func updateGenericProgressActivity(subtitle: String? = nil, progress: Double) {
        guard let id = currentActivityId else { return }
        guard let activity = Activity<GenericProgressAttributes>.activities.first(where: { $0.id == id }) else { return }
        let clamped = min(max(progress, 0.0), 1.0)
        let updated = GenericProgressAttributes.ContentState(subtitle: subtitle, progress: clamped)
        Task {
            await activity.update(using: updated)
        }
    }

    /// Ends the current generic progress live activity.
    @available(iOS 16.1, *)
    func endGenericProgressActivity(finalSubtitle: String? = nil, finalProgress: Double = 1.0, dismissalPolicy: ActivityUIDismissalPolicy = .immediate) {
        guard let id = currentActivityId else { return }
        guard let activity = Activity<GenericProgressAttributes>.activities.first(where: { $0.id == id }) else { return }
        let clamped = min(max(finalProgress, 0.0), 1.0)
        let finalState = GenericProgressAttributes.ContentState(subtitle: finalSubtitle, progress: clamped)
        Task {
            await activity.end(using: finalState, dismissalPolicy: dismissalPolicy)
            self.currentActivityId = nil
        }
    }

    // MARK: - Safe Area handling for Capacitor WKWebView

    private func configureWebViewSafeAreaHandling() {
        // Apply once at launch
        applySafeAreaToCapacitorWebView()
        // Re-apply when status bar frame or orientation changes (affects safe area)
        NotificationCenter.default.addObserver(self, selector: #selector(handleSafeAreaAffectingChange), name: UIApplication.didChangeStatusBarFrameNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(handleSafeAreaAffectingChange), name: UIDevice.orientationDidChangeNotification, object: nil)
    }

    @objc private func handleSafeAreaAffectingChange() {
        // Allow layout to settle before applying
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            self.applySafeAreaToCapacitorWebView()
        }
    }

    private func applySafeAreaToCapacitorWebView() {
        guard let bridgeVC = findBridgeViewController(from: window?.rootViewController) else { return }
        // Find the WKWebView created by Capacitor by walking the view hierarchy
        guard let webView = findWKWebView(in: bridgeVC.view) else { return }
        if #available(iOS 11.0, *) {
            // Manage content insets manually to respect the Dynamic Island / notch safe area
            webView.scrollView.contentInsetAdjustmentBehavior = .never

            // Compute the top safe area inset
            bridgeVC.view.layoutIfNeeded()
            let topInset = bridgeVC.view.safeAreaInsets.top

            var contentInsets = webView.scrollView.contentInset
            contentInsets.top = topInset
            webView.scrollView.contentInset = contentInsets

            var indicatorInsets = webView.scrollView.scrollIndicatorInsets
            indicatorInsets.top = topInset
            webView.scrollView.scrollIndicatorInsets = indicatorInsets
        }
    }

    private func findBridgeViewController(from root: UIViewController?) -> CAPBridgeViewController? {
        if let bridge = root as? CAPBridgeViewController { return bridge }
        if let nav = root as? UINavigationController {
            return findBridgeViewController(from: nav.visibleViewController)
        }
        if let tab = root as? UITabBarController {
            return findBridgeViewController(from: tab.selectedViewController)
        }
        for child in root?.children ?? [] {
            if let found = findBridgeViewController(from: child) { return found }
        }
        return nil
    }

    private func findWKWebView(in view: UIView?) -> WKWebView? {
        guard let view = view else { return nil }
        if let wv = view as? WKWebView { return wv }
        for sub in view.subviews {
            if let wv = findWKWebView(in: sub) { return wv }
        }
        return nil
    }

}
