import FirebaseCore
import FirebaseInstallations
import FirebaseMessaging
import Foundation
import UIKit
import UserNotifications

enum ResetPushError: Error {
    case notConfigured
    case permissionDenied
    case installationIDUnavailable
    case relayUnavailable
}

@MainActor
protocol ResetPushManaging: AnyObject {
    var resetCreditsEnabled: Bool { get }
    var quotaAlertsEnabled: Bool { get }
    var isEnabled: Bool { get }
    var pendingUnregistration: Bool { get }
    var pendingRegistration: Bool { get }
    var deviceID: UUID { get }
    func requestPermission() async throws
    func currentInstallationID() async throws -> String
    func hasNotificationPermission() async -> Bool
    func markPreferences(resetCredits: Bool, quotaAlerts: Bool)
    func markRegistered()
    func beginOptOut()
    @discardableResult func finishOptOut() async -> Bool
    @discardableResult func invalidateTokenForOptOut() async -> Bool
}

@MainActor
final class ResetPushManager: ResetPushManaging {
    static let shared = ResetPushManager()

    private let defaults: UserDefaults
    private let enabledKey = "statusline.codexResetPush.enabled"
    private let quotaEnabledKey = "statusline.quotaAlerts.enabled"
    private let deviceIDKey = "statusline.codexResetPush.deviceID"
    private let pendingUnregistrationKey = "statusline.codexResetPush.pendingUnregistration"
    private let pendingRegistrationKey = "statusline.push.pendingRegistration"
    private let apnsRegistration = PushRegistrationGate<Void>()
    private let firebaseRegistration = PushRegistrationGate<String>()

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    var resetCreditsEnabled: Bool { defaults.bool(forKey: enabledKey) }
    var quotaAlertsEnabled: Bool { defaults.bool(forKey: quotaEnabledKey) }
    var isEnabled: Bool { resetCreditsEnabled || quotaAlertsEnabled }
    var pendingUnregistration: Bool { defaults.bool(forKey: pendingUnregistrationKey) }
    var pendingRegistration: Bool { defaults.bool(forKey: pendingRegistrationKey) }
    var isConfigured: Bool { FirebaseApp.app() != nil }

    var deviceID: UUID {
        if let raw = defaults.string(forKey: deviceIDKey), let existing = UUID(uuidString: raw) {
            return existing
        }
        let newValue = UUID()
        defaults.set(newValue.uuidString.lowercased(), forKey: deviceIDKey)
        return newValue
    }

    func requestPermission() async throws {
        guard FirebaseApp.app() != nil else { throw ResetPushError.notConfigured }
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        let allowed: Bool
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            allowed = true
        case .notDetermined:
            allowed = try await center.requestAuthorization(options: [.alert, .sound])
        case .denied:
            allowed = false
        @unknown default:
            allowed = false
        }
        guard allowed else { throw ResetPushError.permissionDenied }
    }

    func didRegisterForRemoteNotifications(with deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        if let attempt = apnsRegistration.attempt { apnsRegistration.finish(attempt, with: .success(())) }
    }

    func didFailToRegisterForRemoteNotifications(_ error: Error) {
        if let attempt = apnsRegistration.attempt { apnsRegistration.finish(attempt, with: .failure(error)) }
    }

    func currentInstallationID() async throws -> String {
        guard isEnabled, FirebaseApp.app() != nil else { throw ResetPushError.notConfigured }
        // Always use this system registration's token, including warm starts.
        // A cached SDK token is not proof of the current APNs association.
        try await apnsRegistration.wait(timeout: .seconds(20)) { _ in
            UIApplication.shared.registerForRemoteNotifications()
        }
        try Task.checkCancellation()
        guard isEnabled else { throw CancellationError() }
        Messaging.messaging().isAutoInitEnabled = true
        return try await registerForInstallationID()
    }

    func hasNotificationPermission() async -> Bool {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        return [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus)
    }

    func markPreferences(resetCredits: Bool, quotaAlerts: Bool) {
        defaults.set(resetCredits, forKey: enabledKey)
        defaults.set(quotaAlerts, forKey: quotaEnabledKey)
        defaults.set(false, forKey: pendingUnregistrationKey)
        defaults.set(resetCredits || quotaAlerts, forKey: pendingRegistrationKey)
    }

    func markRegistered() { defaults.set(false, forKey: pendingRegistrationKey) }

    func beginOptOut() {
        defaults.set(false, forKey: enabledKey)
        defaults.set(false, forKey: quotaEnabledKey)
        defaults.set(true, forKey: pendingUnregistrationKey)
        defaults.set(false, forKey: pendingRegistrationKey)
        apnsRegistration.cancel()
        firebaseRegistration.cancel()
        if FirebaseApp.app() != nil { Messaging.messaging().isAutoInitEnabled = false }
    }

    @discardableResult
    func finishOptOut() async -> Bool {
        guard await invalidateTokenForOptOut() else { return false }
        defaults.set(false, forKey: pendingUnregistrationKey)
        return true
    }

    @discardableResult
    func invalidateTokenForOptOut() async -> Bool {
        guard FirebaseApp.app() != nil else { return true }
        Messaging.messaging().isAutoInitEnabled = false
        var succeeded = true
        do {
            try await Messaging.messaging().unregister()
        } catch {
            succeeded = false
        }
        do {
            try await Installations.installations().delete()
        } catch {
            succeeded = false
        }
        return succeeded
    }

    private func registerForInstallationID() async throws -> String {
        try await firebaseRegistration.wait(timeout: .seconds(30)) { attempt in
            Messaging.messaging().register { [weak self] error in
                Task { @MainActor [weak self] in
                    guard let self, self.firebaseRegistration.attempt == attempt else { return }
                    if let error {
                        self.firebaseRegistration.finish(attempt, with: .failure(error))
                        return
                    }
                    // Only use the FID after FCM confirms registration. Do not
                    // treat an early auto-init delegate event as delivery-ready.
                    do {
                        let fid = try await Installations.installations().installationID()
                        guard !fid.isEmpty else { throw ResetPushError.installationIDUnavailable }
                        self.firebaseRegistration.finish(attempt, with: .success(fid))
                    } catch {
                        self.firebaseRegistration.finish(attempt, with: .failure(error))
                    }
                }
            }
        }
    }
}

@MainActor
final class StatuslineAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        configureFirebaseIfAvailable()
        UNUserNotificationCenter.current().delegate = self
        if FirebaseApp.app() != nil { Messaging.messaging().delegate = self }
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        guard FirebaseApp.app() != nil else { return }
        ResetPushManager.shared.didRegisterForRemoteNotifications(with: deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        ResetPushManager.shared.didFailToRegisterForRemoteNotifications(error)
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        let quota = notification.request.content.userInfo["alertCategory"] as? String == "quota"
        let allowed = quota ? ResetPushManager.shared.quotaAlertsEnabled : ResetPushManager.shared.resetCreditsEnabled
        return allowed ? [.banner, .sound] : []
    }

    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistration installationID: String?) {
        // Registration completion (including cached registrations) owns the
        // activation flow. Auto-init events alone must not commit user consent.
    }

    private func configureFirebaseIfAvailable() {
        guard FirebaseApp.app() == nil,
              let apiKey = Bundle.main.object(forInfoDictionaryKey: "StatuslineFirebaseAPIKey") as? String,
              let projectID = Bundle.main.object(forInfoDictionaryKey: "StatuslineFirebaseProjectID") as? String,
              let senderID = Bundle.main.object(forInfoDictionaryKey: "StatuslineFirebaseSenderID") as? String,
              let appID = Bundle.main.object(forInfoDictionaryKey: "StatuslineFirebaseAppID") as? String,
              !apiKey.isEmpty, !projectID.isEmpty, !senderID.isEmpty, !appID.isEmpty else {
            return
        }
        let options = FirebaseOptions(googleAppID: appID, gcmSenderID: senderID)
        options.apiKey = apiKey
        options.projectID = projectID
        FirebaseApp.configure(options: options)
        Messaging.messaging().isAutoInitEnabled = false
    }
}
