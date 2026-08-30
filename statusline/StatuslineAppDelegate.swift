import UIKit
import WidgetKit

extension Notification.Name {
    static let codexStatusDidSync = Notification.Name("codexStatusDidSync")
}

@MainActor
final class StatuslineAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        application.registerForRemoteNotifications()
        return true
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        Task { @MainActor in
            let repository = CodexCloudStatusRepository()
            let store = CodexStatusStore()

            do {
                let previousStatus = store.loadSaved()
                let cloudStatus = try await repository.fetchStatus()

                if let cloudStatus {
                    try store.save(cloudStatus)
                } else {
                    store.clear()
                }

                WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind)
                NotificationCenter.default.post(name: .codexStatusDidSync, object: nil)
                completionHandler(previousStatus == cloudStatus ? .noData : .newData)
            } catch {
                completionHandler(.failed)
            }
        }
    }
}
