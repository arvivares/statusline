import Foundation
import Testing
@testable import statusline

@MainActor
private final class ActivationPushFixture: ResetPushManaging {
    var resetCreditsEnabled = false
    var quotaAlertsEnabled = false
    var isEnabled: Bool { resetCreditsEnabled || quotaAlertsEnabled }
    var pendingUnregistration = false
    var pendingRegistration = false
    let deviceID = UUID()
    var permission = true
    var installationFailure: Error?
    var onPermission: (() -> Void)?
    var onPermissionCheck: (() async -> Void)?
    var onInstallation: (() -> Void)?
    var onInstallationWait: (() async throws -> Void)?
    var onCancelRegistration: (() -> Void)?
    var registrationCalls = 0
    func requestPermission() async throws {
        onPermission?()
        if !permission { throw ResetPushError.permissionDenied }
    }
    func currentInstallationID() async throws -> String {
        registrationCalls += 1
        onInstallation?()
        try await onInstallationWait?()
        if let installationFailure { throw installationFailure }
        return "fixture-installation"
    }
    func hasNotificationPermission() async -> Bool { await onPermissionCheck?(); return permission }
    func markPreferences(resetCredits: Bool, quotaAlerts: Bool) {
        resetCreditsEnabled = resetCredits; quotaAlertsEnabled = quotaAlerts
        pendingRegistration = isEnabled; pendingUnregistration = false
    }
    func markRegistered() { pendingRegistration = false }
    func cancelRegistration() { onCancelRegistration?() }
    func beginOptOut() {
        cancelRegistration()
        resetCreditsEnabled = false; quotaAlertsEnabled = false
        pendingRegistration = false; pendingUnregistration = true
    }
    func finishOptOut() async -> Bool { pendingUnregistration = false; return true }
    func invalidateTokenForOptOut() async -> Bool { true }
}

@MainActor
private final class ActivationReaderFixture: CodexRelayReading {
    let endpoint: String? = "https://fixture.example"
    var channel: UUID? = UUID()
    var failure: Error?
    var registered: [(Bool, Bool)] = []
    var onRegister: (() async -> Void)?
    var onUnregister: (() async -> Void)?
    var unregisterFailure: Error?
    var operations: [String] = []
    func pairedChannelID() throws -> UUID? { channel }
    func isPaired() throws -> Bool { channel != nil }
    func pair(using uri: String) async throws { channel = UUID() }
    func fetchStatus() async throws -> CodexUsageStatus? { nil }
    func supportsResetPush() async throws -> Bool { true }
    func supportsQuotaAlerts() async throws -> Bool { true }
    func registerPushPreferences(deviceID: UUID, fid: String, language: String,
                                 resetCredits: Bool, quotaAlerts: Bool) async throws {
        await onRegister?()
        if let failure { throw failure }
        registered.append((resetCredits, quotaAlerts))
        operations.append("PUT")
    }
    func unregisterPushDevice() async throws {
        await onUnregister?()
        if let unregisterFailure { throw unregisterFailure }
        operations.append("DELETE")
    }
    func disconnect() throws { channel = nil }
}

@Suite("Notification activation survives delivery delays")
@MainActor
struct PushActivationTests {
    @Test func swiftUIReceivesAPNsCallbacksWithoutFirebaseSwizzling() {
        #expect(Bundle.main.object(forInfoDictionaryKey: "FirebaseAppDelegateProxyEnabled") as? Bool == false)
        #expect(Bundle.main.object(forInfoDictionaryKey: "FirebaseMessagingAutoInitEnabled") as? Bool == false)
    }

    private func fixture() throws -> (CodexStatusViewModel, ActivationPushFixture, ActivationReaderFixture, () -> Void) {
        let name = "statusline.tests.activation.\(UUID())"
        let defaults = try #require(UserDefaults(suiteName: name))
        let push = ActivationPushFixture()
        let reader = ActivationReaderFixture()
        let store = CodexStatusStore(defaults: defaults)
        try store.servicesStore.save(AgentServicesSnapshot(providers: [], updatedAt: .now,
                                                         channelID: reader.channel, sequence: 1))
        return (CodexStatusViewModel(store: store, relayRepository: reader, resetPushManager: push),
                push, reader, { defaults.removePersistentDomain(forName: name) })
    }

    @Test(arguments: ["apns-or-firebase", "relay", "success"], [false, true])
    func permissionKeepsChoiceWhileDeliveryIsPending(stage: String, creditCategory: Bool) async throws {
        let (vm, push, reader, clear) = try fixture(); defer { clear() }
        if stage == "apns-or-firebase" { push.installationFailure = ResetPushError.installationIDUnavailable }
        if stage == "relay" { reader.failure = URLError(.notConnectedToInternet) }
        push.onInstallation = {
            #expect(vm.quotaNotificationsEnabled == !creditCategory)
            #expect(push.quotaAlertsEnabled == !creditCategory)
            #expect(vm.notificationRegistrationPending)
            #expect(vm.resetNotificationsEnabled == creditCategory)
        }
        if creditCategory { vm.setResetNotifications(true) } else { vm.setQuotaNotifications(true) }
        await vm.notificationPreferenceTask?.value
        #expect(vm.quotaNotificationsEnabled == !creditCategory)
        #expect(push.quotaAlertsEnabled == !creditCategory)
        #expect(vm.resetNotificationsEnabled == creditCategory)
        #expect(!vm.resetNotificationsBusy)
        #expect(vm.notificationRegistrationPending == (stage != "success"))
        #expect(push.pendingRegistration == (stage != "success"))
        #expect(reader.operations.contains("DELETE") == false)
        push.onInstallation = nil
        push.installationFailure = nil; reader.failure = nil
        await vm.runForegroundRefresh(sleep: { _ in throw CancellationError() })
        #expect(!vm.notificationRegistrationPending)
        #expect(reader.registered.last?.0 == creditCategory)
        #expect(reader.registered.last?.1 == !creditCategory)
    }

    @Test(arguments: [false, true])
    func deniedPermissionDoesNotEnableOrRegisterAnything(creditCategory: Bool) async throws {
        let (vm, push, reader, clear) = try fixture(); defer { clear() }
        push.permission = false
        if creditCategory { vm.setResetNotifications(true) } else { vm.setQuotaNotifications(true) }
        await vm.notificationPreferenceTask?.value
        #expect(!push.isEnabled && !vm.quotaNotificationsEnabled && !vm.resetNotificationsEnabled)
        #expect(!vm.notificationRegistrationPending)
        #expect(push.registrationCalls == 0 && reader.registered.isEmpty)
    }

    @Test func channelChangeWhileAskingPermissionCannotEnableNewPairing() async throws {
        let (vm, push, reader, clear) = try fixture(); defer { clear() }
        push.onPermission = { reader.channel = UUID() }
        vm.setResetNotifications(true)
        await vm.notificationPreferenceTask?.value
        #expect(!push.isEnabled && !vm.resetNotificationsEnabled)
        #expect(push.registrationCalls == 0 && reader.registered.isEmpty)
    }

    @Test func failingCategoryChangePreservesBothIndependentChoices() async throws {
        let (vm, push, reader, clear) = try fixture(); defer { clear() }
        vm.setResetNotifications(true)
        await vm.notificationPreferenceTask?.value
        reader.failure = URLError(.timedOut)
        vm.setQuotaNotifications(true)
        await vm.notificationPreferenceTask?.value
        #expect(vm.resetNotificationsEnabled && vm.quotaNotificationsEnabled)
        #expect(push.resetCreditsEnabled && push.quotaAlertsEnabled)
        #expect(vm.notificationRegistrationPending)
        vm.setResetNotifications(false)
        await vm.notificationPreferenceTask?.value
        #expect(!vm.resetNotificationsEnabled && vm.quotaNotificationsEnabled)
        #expect(!reader.operations.contains("DELETE"))
        vm.setQuotaNotifications(false)
        await vm.notificationPreferenceTask?.value
        #expect(!push.isEnabled && !vm.notificationRegistrationPending)
        #expect(reader.operations.last == "DELETE")
    }

    @Test(arguments: [false, true])
    func disconnectDeletesAfterAnInflightOptInCompletes(foregroundRenewal: Bool) async throws {
        let (vm, push, reader, clear) = try fixture(); defer { clear() }
        var releaseWrite: CheckedContinuation<Void, Never>?
        var foregroundTask: Task<Void, Never>?
        await withCheckedContinuation { started in
            reader.onRegister = {
                await withCheckedContinuation { release in
                    releaseWrite = release
                    started.resume()
                }
            }
            if foregroundRenewal {
                push.markPreferences(resetCredits: false, quotaAlerts: true)
                foregroundTask = Task {
                    await vm.runForegroundRefresh(sleep: { _ in throw CancellationError() })
                }
            } else { vm.setQuotaNotifications(true) }
        }
        let disconnect = vm.disconnectRelay()
        releaseWrite?.resume()
        await disconnect.value
        await foregroundTask?.value
        #expect(reader.operations == ["PUT", "DELETE"])
        #expect(reader.channel == nil)
        #expect(!push.isEnabled && !vm.quotaNotificationsEnabled)
        #expect(!vm.notificationRegistrationPending)
    }

    @Test func delayedPermissionCheckCannotRestorePendingStateAfterDisconnect() async throws {
        let (vm, push, reader, clear) = try fixture(); defer { clear() }
        push.markPreferences(resetCredits: false, quotaAlerts: true)
        var releasePermission: CheckedContinuation<Void, Never>?
        var foreground: Task<Void, Never>?
        await withCheckedContinuation { started in
            push.onPermissionCheck = {
                await withCheckedContinuation { release in
                    releasePermission = release; started.resume()
                }
            }
            foreground = Task { await vm.runForegroundRefresh(sleep: { _ in throw CancellationError() }) }
        }
        let disconnect = vm.disconnectRelay()
        releasePermission?.resume()
        await disconnect.value
        await foreground?.value
        #expect(reader.operations == ["DELETE"])
        #expect(reader.channel == nil && !push.isEnabled)
        #expect(!vm.notificationRegistrationPending)
    }

    @Test func turningOffInterruptsAPNsWaitAndIgnoresItsLateCallback() async throws {
        let (vm, push, reader, clear) = try fixture(); defer { clear() }
        let gate = PushRegistrationGate<String>()
        var attempt: UUID?
        push.onCancelRegistration = { gate.cancel() }
        await withCheckedContinuation { started in
            push.onInstallationWait = {
                _ = try await gate.wait(timeout: .seconds(30)) { id in
                    attempt = id
                    started.resume()
                }
            }
            vm.setQuotaNotifications(true)
        }
        #expect(vm.resetNotificationsBusy && vm.quotaNotificationsEnabled)
        vm.setQuotaNotifications(false)
        #expect(!vm.quotaNotificationsEnabled && !push.isEnabled)
        gate.finish(try #require(attempt), with: .success("late-token"))
        await vm.notificationPreferenceTask?.value
        #expect(reader.operations == ["DELETE"])
        #expect(!vm.resetNotificationsBusy && !vm.notificationRegistrationPending)
    }

    @Test func rapidOnOffOnUsesLatestChoices() async throws {
        let (vm, push, reader, clear) = try fixture(); defer { clear() }
        vm.setResetNotifications(true)
        vm.setResetNotifications(false)
        vm.setQuotaNotifications(true)
        #expect(!vm.resetNotificationsEnabled && vm.quotaNotificationsEnabled)
        await vm.notificationPreferenceTask?.value
        #expect(!push.resetCreditsEnabled && push.quotaAlertsEnabled)
        #expect(reader.registered.count == 1)
        #expect(reader.registered.last?.0 == false && reader.registered.last?.1 == true)
        #expect(!vm.resetNotificationsBusy && !vm.notificationRegistrationPending)
    }

    @Test func offDeletesAfterAnAlreadyIssuedOptIn() async throws {
        let (vm, push, reader, clear) = try fixture(); defer { clear() }
        var releaseWrite: CheckedContinuation<Void, Never>?
        await withCheckedContinuation { started in
            reader.onRegister = {
                await withCheckedContinuation { release in
                    releaseWrite = release; started.resume()
                }
            }
            vm.setQuotaNotifications(true)
        }
        vm.setQuotaNotifications(false)
        #expect(!vm.quotaNotificationsEnabled)
        releaseWrite?.resume()
        await vm.notificationPreferenceTask?.value
        #expect(reader.operations == ["PUT", "DELETE"])
        #expect(!push.isEnabled && !vm.notificationRegistrationPending)
    }

    @Test func optingInWaitsForEarlierCleanupWithoutBlockingSwitches() async throws {
        let (vm, push, reader, clear) = try fixture(); defer { clear() }
        vm.setQuotaNotifications(true)
        await vm.notificationPreferenceTask?.value
        var releaseDelete: CheckedContinuation<Void, Never>?
        await withCheckedContinuation { started in
            reader.onUnregister = {
                await withCheckedContinuation { release in
                    releaseDelete = release; started.resume()
                }
            }
            vm.setQuotaNotifications(false)
        }
        vm.setResetNotifications(true)
        vm.setQuotaNotifications(true)
        #expect(vm.resetNotificationsEnabled && vm.quotaNotificationsEnabled)
        releaseDelete?.resume()
        await vm.notificationPreferenceTask?.value
        #expect(reader.operations == ["PUT", "DELETE", "PUT"])
        #expect(push.resetCreditsEnabled && push.quotaAlertsEnabled)
        #expect(!vm.notificationRegistrationPending && !vm.resetNotificationsBusy)
    }

    @Test func deniedPermissionKeepsFailedUnregistrationPending() async throws {
        let (vm, push, reader, clear) = try fixture(); defer { clear() }
        push.permission = false
        reader.unregisterFailure = URLError(.notConnectedToInternet)
        vm.setQuotaNotifications(true)
        await vm.notificationPreferenceTask?.value
        #expect(!push.isEnabled && push.pendingUnregistration)
        #expect(!vm.quotaNotificationsEnabled && !vm.notificationRegistrationPending)
    }
}

@Suite("Registration attempts isolate callbacks and timeouts")
@MainActor
struct PushRegistrationGateTests {
    @Test func synchronousCallbackCompletesWithoutLosingTheWaiter() async throws {
        let gate = PushRegistrationGate<String>()
        let value = try await gate.wait(timeout: .seconds(30)) { id in
            gate.finish(id, with: .success("fixture"))
        }
        #expect(value == "fixture" && gate.attempt == nil)
    }

    @Test func oldTimeoutCannotCompleteTheNextAttempt() async throws {
        let gate = PushRegistrationGate<String>()
        var old: UUID?
        await #expect(throws: ResetPushError.self) {
            try await gate.wait(timeout: .seconds(30)) { id in
                old = id
                gate.finish(id, with: .failure(ResetPushError.installationIDUnavailable))
            }
        }
        let previous = try #require(old)
        let value = try await gate.wait(timeout: .seconds(30)) { id in
            gate.finish(previous, with: .failure(ResetPushError.installationIDUnavailable))
            #expect(gate.attempt == id)
            gate.finish(id, with: .success("new-attempt"))
        }
        #expect(value == "new-attempt")
    }

    @Test func optOutCancelsWaiterAndIgnoresLateSuccess() async {
        let gate = PushRegistrationGate<String>()
        await #expect(throws: CancellationError.self) {
            try await gate.wait(timeout: .seconds(30)) { id in
                gate.cancel()
                gate.finish(id, with: .success("late"))
            }
        }
        #expect(gate.attempt == nil)
    }

    @Test func cancellingTaskResumesItsWaiter() async throws {
        let gate = PushRegistrationGate<String>()
        var task: Task<String, Error>?
        await withCheckedContinuation { started in
            task = Task {
                try await gate.wait(timeout: .seconds(30)) { _ in started.resume() }
            }
        }
        let waiting = try #require(task)
        waiting.cancel()
        await #expect(throws: CancellationError.self) { try await waiting.value }
        #expect(gate.attempt == nil)
    }
}
