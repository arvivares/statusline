import AppKit
import Foundation
import Observation

enum CompanionConnectionState: Equatable {
    case checking
    case disconnected
    case waitingForLogin
    case connected
    case unavailable
}

@Observable
@MainActor
final class CompanionViewModel {
    private(set) var connectionState: CompanionConnectionState = .checking
    private(set) var relayState: StatusRelayPublisherState = .notConfigured
    private(set) var status: CodexUsageStatus?
    private(set) var loginChallenge: CodexLoginChallenge?
    private(set) var accountEmail: String?
    private(set) var message = L10n.text("Checking your Codex session…")
    private(set) var relayMessage = L10n.text("Checking the relay…")
    private(set) var isBusy = false
    private(set) var isRelayBusy = false

    private let appServer: CodexAppServerClient
    private let relayPublisher: CodexRelayPublisherRepository
    private var serviceTask: Task<Void, Never>?

    convenience init() {
        self.init(
            appServer: CodexAppServerClient(),
            relayPublisher: CodexRelayPublisherRepository()
        )
    }

    init(
        appServer: CodexAppServerClient,
        relayPublisher: CodexRelayPublisherRepository
    ) {
        self.appServer = appServer
        self.relayPublisher = relayPublisher
    }

    var pairingURI: String? {
        if case .pairing(_, let uri, _, _) = relayState { uri } else { nil }
    }

    var relayEndpoint: String? {
        switch relayState {
        case .notConfigured:
            nil
        case .unpaired(let endpoint),
             .pairing(let endpoint, _, _, _),
             .connected(let endpoint, _):
            endpoint
        }
    }

    func start() {
        guard serviceTask == nil else {
            return
        }

        serviceTask = Task { [weak self] in
            await self?.runServiceLoop()
        }
    }

    private func runServiceLoop() async {
        await refreshRelayState()
        await restoreSession()

        while !Task.isCancelled {
            do {
                try await Task.sleep(for: .seconds(15 * 60))
            } catch {
                break
            }

            await refreshRelayState()
            if connectionState == .connected {
                await refresh()
            }
        }

        await appServer.stop()
        serviceTask = nil
    }

    func connect(mode: CodexLoginMode) async {
        guard !isBusy else {
            return
        }

        isBusy = true
        connectionState = .waitingForLogin
        message = L10n.text("Opening secure OpenAI sign-in…")

        do {
            let challenge = try await appServer.beginLogin(mode: mode)
            loginChallenge = challenge
            NSWorkspace.shared.open(challenge.authorizationURL)

            message = challenge.userCode == nil
                ? L10n.text("Complete sign-in in your browser.")
                : L10n.text("Enter the code shown below on the OpenAI page.")

            try await appServer.waitForLogin(challenge.loginID)
            loginChallenge = nil

            let account = try await appServer.account()
            guard account.account?.type == "chatgpt" else {
                throw CodexAppServerError.loginFailed(
                    L10n.text("Statusline needs a ChatGPT session, not an API key.")
                )
            }

            accountEmail = account.account?.email
            connectionState = .connected
            try await fetchAndPublishStatus()
        } catch {
            connectionState = error is CodexAppServerError ? .disconnected : .unavailable
            message = L10n.error(error)
        }

        isBusy = false
    }

    func refresh() async {
        guard connectionState == .connected, !isBusy else {
            return
        }

        isBusy = true
        do {
            try await fetchAndPublishStatus()
        } catch {
            message = L10n.error(error)
        }
        isBusy = false
    }

    func disconnect() async {
        guard !isBusy else {
            return
        }

        isBusy = true
        do {
            try await appServer.logout()
            status = nil
            accountEmail = nil
            loginChallenge = nil
            connectionState = .disconnected
            message = L10n.text("Codex account disconnected. Your devices remain paired.")
        } catch {
            message = L10n.error(error)
        }
        isBusy = false
    }

    func createRelayPairing() async {
        guard !isRelayBusy else {
            return
        }
        isRelayBusy = true
        relayMessage = L10n.text("Creating independent read and write credentials…")
        do {
            relayState = try await relayPublisher.createPairing()
            relayMessage = L10n.text("Scan this QR from Statusline on iOS or Android.")
            if let status {
                relayState = try await relayPublisher.publish(status)
            }
        } catch {
            relayMessage = L10n.error(error)
        }
        isRelayBusy = false
    }

    func refreshRelayState() async {
        guard !isRelayBusy else {
            return
        }
        isRelayBusy = true
        do {
            relayState = try await relayPublisher.status()
            relayMessage = relayState.statusMessage
        } catch {
            relayMessage = L10n.error(error)
        }
        isRelayBusy = false
    }

    func disconnectRelay() async {
        guard !isRelayBusy else {
            return
        }
        isRelayBusy = true
        do {
            try await relayPublisher.disconnect()
            relayState = relayEndpoint.map { .unpaired(endpoint: $0) } ?? .notConfigured
            relayMessage = L10n.text("Pairing removed. The remote snapshot can no longer be decrypted.")
        } catch {
            relayMessage = L10n.error(error)
        }
        isRelayBusy = false
    }

    func openAuthorizationPage() {
        guard let url = loginChallenge?.authorizationURL else {
            return
        }
        NSWorkspace.shared.open(url)
    }

    func copyUserCode() {
        guard let code = loginChallenge?.userCode else {
            return
        }
        copyToPasteboard(code)
    }

    func copyPairingLink() {
        guard let pairingURI else {
            return
        }
        copyToPasteboard(pairingURI)
        relayMessage = L10n.text("Private link copied. Do not share it with anyone else.")
    }

    private func restoreSession() async {
        guard !isBusy else {
            return
        }

        isBusy = true
        connectionState = .checking

        do {
            let response = try await appServer.account()
            guard response.account?.type == "chatgpt" else {
                connectionState = .disconnected
                message = L10n.text("Connect your Codex account to get started.")
                isBusy = false
                return
            }

            accountEmail = response.account?.email
            connectionState = .connected
            try await fetchAndPublishStatus()
        } catch CodexAppServerError.executableNotFound {
            connectionState = .unavailable
            message = CodexAppServerError.executableNotFound.localizedDescription
        } catch {
            connectionState = .disconnected
            message = L10n.error(error)
        }

        isBusy = false
    }

    private func fetchAndPublishStatus() async throws {
        message = L10n.text("Reading your Codex weekly limit…")
        let limits = try await appServer.rateLimits()
        let currentStatus = try limits.weeklyStatus()
        status = currentStatus

        switch relayState {
        case .pairing, .connected:
            relayMessage = L10n.text("Encrypting and publishing the snapshot…")
            do {
                relayState = try await relayPublisher.publish(currentStatus)
                relayMessage = relayState.statusMessage
                message = L10n.text("Codex read and encrypted snapshot published.")
            } catch {
                relayMessage = L10n.error(error)
                message = L10n.text("Codex read; the relay needs attention.")
            }
        case .notConfigured:
            message = L10n.text("Codex read. Configure the relay endpoint to sync other devices.")
        case .unpaired:
            message = L10n.text("Codex read. Create a pairing to sync iOS or Android.")
        }
    }

    private func copyToPasteboard(_ value: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(value, forType: .string)
    }
}

private extension StatusRelayPublisherState {
    var statusMessage: String {
        switch self {
        case .notConfigured:
            L10n.text("This build does not have a relay endpoint configured yet.")
        case .unpaired:
            L10n.text("Create a pairing to connect iOS or Android.")
        case .pairing(_, _, let expiresAt, _):
            L10n.text("Waiting for the QR scan. Expires {0}.", L10n.relative(expiresAt))
        case .connected(_, let lastPublishedAt):
            if let lastPublishedAt {
                L10n.text("Encrypted snapshot published {0}.", L10n.relative(lastPublishedAt))
            } else {
                L10n.text("Device connected. Waiting for the first publication.")
            }
        }
    }
}
