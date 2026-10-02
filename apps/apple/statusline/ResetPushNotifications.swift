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
final class ResetPushManager {
    static let shared = ResetPushManager()

    private let defaults: UserDefaults
    private let enabledKey = "statusline.codexResetPush.enabled"
    private let quotaEnabledKey = "statusline.quotaAlerts.enabled"
    private let deviceIDKey = "statusline.codexResetPush.deviceID"
    private let pendingUnregistrationKey = "statusline.codexResetPush.pendingUnregistration"
    private var apnsRegistrationWaiter: CheckedContinuation<Void, Error>?
    private var registrationAttempt: UUID?
    private var registrationTimeout: Task<Void, Never>?
    private var registrationWaiters: [CheckedContinuation<String, Error>] = []
    private var latestInstallationID: String?

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    var resetCreditsEnabled: Bool { defaults.bool(forKey: enabledKey) }
    var quotaAlertsEnabled: Bool { defaults.bool(forKey: quotaEnabledKey) }
    var isEnabled: Bool { resetCreditsEnabled || quotaAlertsEnabled }
    var pendingUnregistration: Bool { defaults.bool(forKey: pendingUnregistrationKey) }
    var isConfigured: Bool { FirebaseApp.app() != nil }

    var deviceID: UUID {
        if let raw = defaults.string(forKey: deviceIDKey), let existing = UUID(uuidString: raw) {
            return existing
        }
        let newValue = UUID()
        defaults.set(newValue.uuidString.lowercased(), forKey: deviceIDKey)
        return newValue
    }

    func requestPermissionAndInstallationID() async throws -> String {
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
        Messaging.messaging().isAutoInitEnabled = true
        if Messaging.messaging().apnsToken == nil {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                apnsRegistrationWaiter = continuation
                UIApplication.shared.registerForRemoteNotifications()
                Task { @MainActor [weak self] in
                    try? await Task.sleep(for: .seconds(20))
                    guard let self, let waiter = self.apnsRegistrationWaiter else { return }
                    self.apnsRegistrationWaiter = nil
                    waiter.resume(throwing: ResetPushError.installationIDUnavailable)
                }
            }
        } else {
            UIApplication.shared.registerForRemoteNotifications()
        }
        return try await registerForInstallationID()
    }

    func didRegisterForRemoteNotifications(with deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        let waiter = apnsRegistrationWaiter
        apnsRegistrationWaiter = nil
        waiter?.resume()
    }

    func didFailToRegisterForRemoteNotifications(_ error: Error) {
        let waiter = apnsRegistrationWaiter
        apnsRegistrationWaiter = nil
        waiter?.resume(throwing: error)
    }

    func currentInstallationID() async throws -> String {
        guard isEnabled, FirebaseApp.app() != nil else { throw ResetPushError.notConfigured }
        UIApplication.shared.registerForRemoteNotifications()
        return try await registerForInstallationID()
    }

    func hasNotificationPermission() async -> Bool {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        return [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus)
    }

    func markEnabled() { defaults.set(true, forKey: enabledKey) }
    func markPreferences(resetCredits: Bool, quotaAlerts: Bool) {
        defaults.set(resetCredits, forKey: enabledKey)
        defaults.set(quotaAlerts, forKey: quotaEnabledKey)
        defaults.set(false, forKey: pendingUnregistrationKey)
    }

    func didReceiveRegistration(_ installationID: String?) {
        guard let installationID, !installationID.isEmpty else { return }
        latestInstallationID = installationID
        guard let attempt = registrationAttempt else { return }
        finishRegistration(attempt, with: .success(installationID))
    }

    func beginOptOut() {
        defaults.set(false, forKey: enabledKey)
        defaults.set(false, forKey: quotaEnabledKey)
        defaults.set(true, forKey: pendingUnregistrationKey)
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
        latestInstallationID = nil
        return succeeded
    }

    private func registerForInstallationID() async throws -> String {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String, Error>) in
            registrationWaiters.append(continuation)
            guard registrationAttempt == nil else { return }
            let attempt = UUID()
            registrationAttempt = attempt
            Messaging.messaging().register { [weak self] error in
                guard let error else { return }
                Task { @MainActor [weak self] in
                    self?.finishRegistration(attempt, with: .failure(error))
                }
            }
            registrationTimeout = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(30))
                self?.finishRegistration(
                    attempt,
                    with: .failure(ResetPushError.installationIDUnavailable)
                )
            }
        }
    }

    private func finishRegistration(
        _ attempt: UUID,
        with result: Result<String, Error>
    ) {
        guard registrationAttempt == attempt else { return }
        registrationAttempt = nil
        registrationTimeout?.cancel()
        registrationTimeout = nil
        let waiters = registrationWaiters
        registrationWaiters.removeAll()
        for waiter in waiters { waiter.resume(with: result) }
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
        Task { @MainActor in
            ResetPushManager.shared.didReceiveRegistration(installationID)
        }
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
