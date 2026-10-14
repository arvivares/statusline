import Foundation
import Observation
import WidgetKit

enum CodexStatusFeedback: Equatable {
    case success(String)
    case error(String)

    var message: String {
        switch self {
        case .success(let message), .error(let message):
            message
        }
    }

    var systemImage: String {
        switch self {
        case .success:
            "checkmark.circle.fill"
        case .error:
            "exclamationmark.triangle.fill"
        }
    }

    var isError: Bool {
        if case .error = self { true } else { false }
    }
}

enum CodexRelaySyncState: Equatable {
    case notConfigured
    case unpaired
    case pairing
    case syncing
    case waitingForDesktop
    case synced(Date)
    case failed(String)

    var message: String {
        switch self {
        case .notConfigured:
            L10n.text("This build does not have a relay endpoint configured yet.")
        case .unpaired:
            L10n.text("Scan the QR shown by Statusline Companion to connect this device.")
        case .pairing:
            L10n.text("Validating the encrypted pairing with the relay…")
        case .syncing:
            L10n.text("Looking for the latest encrypted snapshot…")
        case .waitingForDesktop:
            L10n.text("Device connected. Waiting for the companion’s first sample.")
        case .synced(let date):
            L10n.text("Synced {0}", L10n.relative(date))
        case .failed(let message):
            message
        }
    }

    var systemImage: String {
        switch self {
        case .notConfigured:
            "network.slash"
        case .unpaired:
            "qrcode.viewfinder"
        case .pairing:
            "link.badge.plus"
        case .syncing:
            "arrow.triangle.2.circlepath"
        case .waitingForDesktop:
            "desktopcomputer"
        case .synced:
            "checkmark.shield.fill"
        case .failed:
            "exclamationmark.shield.fill"
        }
    }

    var isError: Bool {
        if case .failed = self { true } else { false }
    }

    var isPaired: Bool {
        switch self {
        case .syncing, .waitingForDesktop, .synced:
            true
        case .notConfigured, .unpaired, .pairing, .failed:
            false
        }
    }
}

@Observable
@MainActor
final class CodexStatusViewModel {
    private(set) var status: CodexUsageStatus?
    private(set) var services: AgentServicesSnapshot?
    private(set) var preferredProvider: AgentProviderID?
    private(set) var feedback: CodexStatusFeedback?
    private(set) var relaySyncState: CodexRelaySyncState = .unpaired
    private(set) var resetNotificationsEnabled: Bool
    private(set) var quotaNotificationsEnabled: Bool
    private(set) var resetNotificationsBusy = false
    private(set) var notificationRegistrationPending: Bool
    @ObservationIgnored private(set) var notificationPreferenceTask: Task<Void, Never>?
    private let store: CodexStatusStore
    private let relayRepository: any CodexRelayReading
    private let resetPushManager: any ResetPushManaging
    private(set) var isRefreshing = false
    private(set) var isDisconnecting = false
    private var pairingGeneration = 0
    private var notificationRevision = 0

    convenience init() {
        self.init(
            store: CodexStatusStore(),
            relayRepository: CodexRelayReaderRepository(),
            resetPushManager: ResetPushManager.shared
        )
    }

    init(
        store: CodexStatusStore,
        relayRepository: any CodexRelayReading,
        resetPushManager: (any ResetPushManaging)? = nil
    ) {
        self.store = store
        self.relayRepository = relayRepository
        let pushManager = resetPushManager ?? ResetPushManager.shared
        self.resetPushManager = pushManager
        resetNotificationsEnabled = pushManager.resetCreditsEnabled
        quotaNotificationsEnabled = pushManager.quotaAlertsEnabled
        notificationRegistrationPending = pushManager.pendingRegistration
        preferredProvider = store.servicesStore.focusedProvider

        reloadLocalStatus()
    }

    var focusedProvider: AgentProviderReading? { services?.focusedProvider(preferred: preferredProvider) }
    var watchlist: [AgentProviderReading] { services?.providers.filter { $0.id != focusedProvider?.id } ?? [] }

    func focus(_ provider: AgentProviderID) {
        guard services?.providers.contains(where: { $0.id == provider }) == true else { return }
        preferredProvider = provider
        store.servicesStore.focus(provider)
        WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind)
    }

    var relayEndpoint: String? { relayRepository.endpoint }

    func setResetNotifications(_ enabled: Bool) {
        setNotificationPreferences(resetCredits: enabled, quotaAlerts: quotaNotificationsEnabled)
    }

    func setQuotaNotifications(_ enabled: Bool) {
        setNotificationPreferences(resetCredits: resetNotificationsEnabled, quotaAlerts: enabled)
    }

    private func setNotificationPreferences(resetCredits: Bool, quotaAlerts: Bool) {
        guard !isDisconnecting, relaySyncState.isPaired || (!resetCredits && !quotaAlerts) else { return }
        notificationRevision += 1
        let revision = notificationRevision
        let generation = pairingGeneration
        let channel = try? relayRepository.pairedChannelID()
        let previous = notificationPreferenceTask
        // Interrupt SDK waits, not an issued HTTP write. Draining that write
        // before a later DELETE prevents an old opt-in from restoring delivery.
        resetPushManager.cancelRegistration()
        resetNotificationsEnabled = resetCredits
        quotaNotificationsEnabled = quotaAlerts
        notificationRegistrationPending = resetCredits || quotaAlerts
        feedback = nil
        PushDiagnostics.record(.preferences, .started)
        if !resetCredits && !quotaAlerts {
            resetPushManager.beginOptOut()
        } else if resetPushManager.isEnabled {
            // Removing a category takes effect locally immediately. New consent
            // is still persisted only after system authorization succeeds.
            resetPushManager.markPreferences(
                resetCredits: resetPushManager.resetCreditsEnabled && resetCredits,
                quotaAlerts: resetPushManager.quotaAlertsEnabled && quotaAlerts
            )
        }
        resetNotificationsBusy = true
        notificationPreferenceTask = Task {
            defer {
                if revision == notificationRevision {
                    resetNotificationsBusy = false
                    if generation != pairingGeneration || channel != (try? relayRepository.pairedChannelID()) {
                        resetNotificationsEnabled = resetPushManager.resetCreditsEnabled
                        quotaNotificationsEnabled = resetPushManager.quotaAlertsEnabled
                        notificationRegistrationPending = resetPushManager.pendingRegistration
                    }
                }
            }
            await previous?.value
            guard revision == notificationRevision, generation == pairingGeneration,
                  channel == (try? relayRepository.pairedChannelID()), !Task.isCancelled else { return }

            if !resetCredits && !quotaAlerts {
                do {
                    PushDiagnostics.record(.cleanup, .started)
                    try await relayRepository.unregisterPushDevice()
                    let completed = await resetPushManager.finishOptOut()
                    guard revision == notificationRevision, generation == pairingGeneration else { return }
                    PushDiagnostics.record(.cleanup, completed ? .ready : .pending)
                    feedback = completed
                        ? .success(L10n.text("Notifications are off. This device was unregistered."))
                        : .error(L10n.text("Relay registration removed; notification cleanup will retry when Statusline opens."))
                } catch {
                    await resetPushManager.invalidateTokenForOptOut()
                    guard revision == notificationRevision, generation == pairingGeneration else { return }
                    PushDiagnostics.failure(.cleanup, error)
                    feedback = .error(L10n.text("Could not unregister this device. It will retry when Statusline opens."))
                }
                return
            }

            do {
                if resetPushManager.pendingUnregistration {
                    try await relayRepository.unregisterPushDevice()
                    _ = await resetPushManager.finishOptOut()
                }
                guard revision == notificationRevision, generation == pairingGeneration,
                      channel == (try? relayRepository.pairedChannelID()), !Task.isCancelled else { return }
                let available = try await (quotaAlerts ? relayRepository.supportsQuotaAlerts() : relayRepository.supportsResetPush())
                guard revision == notificationRevision, generation == pairingGeneration,
                      channel == (try? relayRepository.pairedChannelID()) else { return }
                guard available else {
                    throw ResetPushError.relayUnavailable
                }
                try await resetPushManager.requestPermission()
                guard notificationRevision == revision, pairingGeneration == generation,
                      channel == (try relayRepository.pairedChannelID()), !Task.isCancelled else { throw CancellationError() }
                // Permission is consent; APNs/FCM/relay connectivity is delivery
                // readiness. Persist the user's choice before network work.
                resetPushManager.markPreferences(resetCredits: resetCredits, quotaAlerts: quotaAlerts)
                resetNotificationsEnabled = resetCredits
                quotaNotificationsEnabled = quotaAlerts
                notificationRegistrationPending = true
                let installationID = try await resetPushManager.currentInstallationID()
                guard notificationRevision == revision, pairingGeneration == generation,
                      channel == (try relayRepository.pairedChannelID()), !Task.isCancelled else { throw CancellationError() }
                PushDiagnostics.record(.relay, .started)
                try await relayRepository.registerPushPreferences(
                    deviceID: resetPushManager.deviceID,
                    fid: installationID,
                    language: L10n.language,
                    resetCredits: resetCredits,
                    quotaAlerts: quotaAlerts
                )
                guard notificationRevision == revision, pairingGeneration == generation,
                      channel == (try relayRepository.pairedChannelID()) else { throw CancellationError() }
                resetPushManager.markRegistered()
                notificationRegistrationPending = false
                PushDiagnostics.record(.relay, .ready)
                feedback = .success(L10n.text("Notification preferences updated."))
            } catch {
                guard revision == notificationRevision, generation == pairingGeneration,
                      channel == (try? relayRepository.pairedChannelID()) else { return }
                PushDiagnostics.failure(.preferences, error)
                if case ResetPushError.permissionDenied = error {
                    resetPushManager.beginOptOut()
                    do {
                        try await relayRepository.unregisterPushDevice()
                        _ = await resetPushManager.finishOptOut()
                    } catch {
                        // Keep the pending DELETE durable if the relay is offline.
                        await resetPushManager.invalidateTokenForOptOut()
                        PushDiagnostics.failure(.cleanup, error)
                    }
                    guard revision == notificationRevision else { return }
                }
                resetNotificationsEnabled = resetPushManager.resetCreditsEnabled
                quotaNotificationsEnabled = resetPushManager.quotaAlertsEnabled
                notificationRegistrationPending = resetPushManager.pendingRegistration
                switch error {
                case ResetPushError.permissionDenied:
                    feedback = .error(L10n.text("Allow notifications in system Settings to receive alerts."))
                case ResetPushError.notConfigured:
                    feedback = .error(L10n.text("Push notifications are not configured for this build."))
                case ResetPushError.relayUnavailable:
                    feedback = .error(L10n.text("Push notifications are not available on this relay yet."))
                case is CancellationError: break
                default:
                    feedback = .error(notificationRegistrationPending
                        ? L10n.text("Notification preferences saved. Registration is pending and will retry while Statusline is open.")
                        : L10n.text("Could not enable notifications. Check your connection and try again."))
                }
            }
        }
    }

    private func refreshResetPushRegistration() async {
        guard !resetNotificationsBusy else { return }
        resetNotificationsBusy = true
        let revision = notificationRevision
        let task = Task { await performResetPushRegistrationRefresh(revision: revision) }
        notificationPreferenceTask = task
        // Keep issued writes tracked even if the foreground view task ends.
        // A newer preference/disconnect waits for this task before its DELETE.
        await task.value
    }

    private func performResetPushRegistrationRefresh(revision: Int) async {
        defer { if revision == notificationRevision { resetNotificationsBusy = false } }
        guard revision == notificationRevision else { return }
        let generation = pairingGeneration
        let channel = try? relayRepository.pairedChannelID()
        if resetPushManager.pendingUnregistration {
            do {
                try await relayRepository.unregisterPushDevice()
                guard await resetPushManager.finishOptOut() else { return }
                guard revision == notificationRevision, generation == pairingGeneration else { return }
            } catch {
                return
            }
        }
        guard resetPushManager.isEnabled else { return }
        let allowed = await resetPushManager.hasNotificationPermission()
        guard revision == notificationRevision, generation == pairingGeneration,
              let channel, channel == (try? relayRepository.pairedChannelID()),
              resetPushManager.isEnabled, !Task.isCancelled else { return }
        guard allowed else {
            resetPushManager.beginOptOut()
            resetNotificationsEnabled = false
            quotaNotificationsEnabled = false
            notificationRegistrationPending = false
            do {
                try await relayRepository.unregisterPushDevice()
                let firebaseCleanupCompleted = await resetPushManager.finishOptOut()
                guard revision == notificationRevision, generation == pairingGeneration else { return }
                feedback = firebaseCleanupCompleted
                    ? .success(L10n.text("Notifications are off because permission was revoked."))
                    : .error(L10n.text("Relay registration removed; notification cleanup will retry when Statusline opens."))
            } catch {
                await resetPushManager.invalidateTokenForOptOut()
                guard revision == notificationRevision, generation == pairingGeneration else { return }
                feedback = .error(L10n.text("Could not unregister this device. It will retry when Statusline opens."))
            }
            return
        }
        resetPushManager.markPreferences(resetCredits: resetPushManager.resetCreditsEnabled,
                                         quotaAlerts: resetPushManager.quotaAlertsEnabled)
        notificationRegistrationPending = true
        do {
            let installationID = try await resetPushManager.currentInstallationID()
            guard revision == notificationRevision, generation == pairingGeneration,
                  channel == (try relayRepository.pairedChannelID()) else { return }
            PushDiagnostics.record(.relay, .started)
            try await relayRepository.registerPushPreferences(
                deviceID: resetPushManager.deviceID,
                fid: installationID,
                language: L10n.language,
                resetCredits: resetPushManager.resetCreditsEnabled,
                quotaAlerts: resetPushManager.quotaAlertsEnabled
            )
            guard revision == notificationRevision, generation == pairingGeneration,
                  channel == (try relayRepository.pairedChannelID()) else { return }
            resetPushManager.markRegistered()
            notificationRegistrationPending = false
            PushDiagnostics.record(.relay, .ready)
            if feedback == .error(L10n.text("Notification preferences saved. Registration is pending and will retry while Statusline is open.")) {
                feedback = .success(L10n.text("Notification preferences updated."))
            }
        } catch {
            // A temporary push-registration failure must not interrupt quota sync.
            if revision == notificationRevision { PushDiagnostics.failure(.preferences, error) }
        }
    }

    /// Owned by ContentView.task(id: scenePhase); cancels when no longer active.
    func runForegroundRefresh(
        sleep: (Duration) async throws -> Void = { try await Task.sleep(for: $0) }
    ) async {
        reloadLocalStatus()
        await refreshResetPushRegistration()
        while !Task.isCancelled {
            await start()
            do { try await sleep(CodexSyncPolicy.foregroundInterval) }
            catch { return }
            if notificationRegistrationPending, !Task.isCancelled {
                await refreshResetPushRegistration()
            }
        }
    }

    func start() async {
        guard relaySyncState != .pairing, !Task.isCancelled else { return }
        guard relayRepository.endpoint != nil else {
            relaySyncState = .notConfigured
            return
        }
        do {
            guard try relayRepository.isPaired() else {
                relaySyncState = .unpaired
                return
            }
            await refreshFromRelay()
        } catch {
            relaySyncState = .failed(L10n.error(error))
        }
    }

    func pair(using uri: String) async {
        guard relaySyncState != .pairing else {
            return
        }
        relaySyncState = .pairing
        pairingGeneration += 1
        feedback = nil
        do {
            try await relayRepository.pair(using: uri)
            store.clear()
            store.servicesStore.clear()
            services = nil
            preferredProvider = nil
            status = nil
            WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind)
            feedback = .success(L10n.text("Device connected with encryption."))
            relaySyncState = .waitingForDesktop
            await refreshResetPushRegistration()
            await refreshFromRelay()
        } catch {
            relaySyncState = .failed(L10n.error(error))
            feedback = .error(L10n.error(error))
        }
    }

    func refreshFromRelay(userInitiated: Bool = false) async {
        guard !isRefreshing, relaySyncState != .pairing, !Task.isCancelled else {
            return
        }
        guard relayRepository.endpoint != nil else {
            relaySyncState = .notConfigured
            return
        }

        let generation = pairingGeneration
        let previousState = relaySyncState
        isRefreshing = true
        defer { isRefreshing = false }
        relaySyncState = .syncing
        do {
            let fetched = try await relayRepository.fetchServices()
            try Task.checkCancellation()
            guard generation == pairingGeneration else { return }
            guard let relayStatus = fetched else {
                // Keep a last successful sample if the relay is temporarily empty.
                relaySyncState = .waitingForDesktop
                return
            }
            guard relayStatus.channelID == (try relayRepository.pairedChannelID()) else { return }
            let selected: AgentServicesSnapshot
            if let previous = services, previous.channelID == relayStatus.channelID,
               !relayStatus.supersedes(previous) { selected = previous }
            else { selected = relayStatus }
            let changed = services != selected
            try store.servicesStore.save(selected)
            services = selected
            status = selected.codexStatus
            if let status { try store.save(status) } else { store.clear() }
            relaySyncState = .synced(selected.updatedAt)
            if changed { WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind) }
            if userInitiated {
                feedback = .success(L10n.text("Encrypted snapshot updated."))
            }
        } catch is CancellationError {
            if generation == pairingGeneration { relaySyncState = previousState }
        } catch CodexRelayError.notPaired {
            if generation == pairingGeneration { relaySyncState = .unpaired }
        } catch {
            if generation == pairingGeneration { relaySyncState = .failed(L10n.error(error)) }
        }
    }

    @discardableResult
    func disconnectRelay() -> Task<Void, Never> {
        Task {
            guard !isDisconnecting else { return }
            isDisconnecting = true
            defer { isDisconnecting = false; resetNotificationsBusy = false }
            notificationRevision += 1
            if resetPushManager.isEnabled || resetPushManager.pendingUnregistration || resetNotificationsBusy {
                resetPushManager.beginOptOut()
                resetNotificationsEnabled = false
                quotaNotificationsEnabled = false
                notificationRegistrationPending = false
                // A delayed PUT must finish before the final DELETE, so an
                // in-flight opt-in cannot recreate the relay subscription.
                await notificationPreferenceTask?.value
                do {
                    try await relayRepository.unregisterPushDevice()
                } catch {
                    await resetPushManager.invalidateTokenForOptOut()
                    resetNotificationsBusy = false
                    feedback = .error(L10n.text("Could not unregister this device. Check your connection before disconnecting."))
                    return
                }
                await resetPushManager.finishOptOut()
                resetNotificationsEnabled = false
            }
            do {
                try relayRepository.disconnect()
                pairingGeneration += 1
                store.clear()
                store.servicesStore.clear()
                services = nil
                preferredProvider = nil
                status = nil
                relaySyncState = .unpaired
                feedback = .success(L10n.text("This device was disconnected from the relay."))
                WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind)
            } catch {
                relaySyncState = .failed(L10n.error(error))
                feedback = .error(L10n.error(error))
            }
        }
    }

    func reloadLocalStatus() {
        do {
            let channel = try relayRepository.pairedChannelID()
            if let saved = store.servicesStore.load(), saved.channelID == channel {
                services = saved
            } else if let legacy = store.loadSaved(), legacy.relayChannelID == channel {
                services = .legacy(legacy)
            } else { services = nil }
            status = services?.codexStatus
            if let services { relaySyncState = .synced(services.updatedAt) }
        } catch {
            status = nil
            services = nil
        }
    }

    func loadLocalDemo() {
        do {
            // Demo data is fixed and local; arbitrary status text is no longer accepted.
            guard try !relayRepository.isPaired(), !isRefreshing,
                  relaySyncState != .pairing else { return }
            let demo = CodexUsageStatus.example
            let snapshot = AgentServicesSnapshot.legacy(demo)
            try store.save(demo)
            try store.servicesStore.save(snapshot)
            status = demo
            services = snapshot
            WidgetCenter.shared.reloadTimelines(ofKind: CodexStatusConstants.widgetKind)
            feedback = .success(L10n.text("Local demo enabled. The app and widget show an example sample."))
        } catch {
            feedback = .error(L10n.error(error))
        }
    }
}
