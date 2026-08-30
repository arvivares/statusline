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
    private(set) var status: CodexUsageStatus?
    private(set) var loginChallenge: CodexLoginChallenge?
    private(set) var accountEmail: String?
    private(set) var message = "Comprobando tu sesión de Codex…"
    private(set) var isBusy = false

    private let appServer: CodexAppServerClient
    private let cloudRepository: CodexCloudStatusRepository
    private var serviceTask: Task<Void, Never>?

    convenience init() {
        self.init(
            appServer: CodexAppServerClient(),
            cloudRepository: CodexCloudStatusRepository()
        )
    }

    init(
        appServer: CodexAppServerClient,
        cloudRepository: CodexCloudStatusRepository
    ) {
        self.appServer = appServer
        self.cloudRepository = cloudRepository
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
        await restoreSession()

        while !Task.isCancelled {
            do {
                try await Task.sleep(for: .seconds(15 * 60))
            } catch {
                break
            }

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
        message = "Abriendo el inicio de sesión seguro de OpenAI…"

        do {
            let challenge = try await appServer.beginLogin(mode: mode)
            loginChallenge = challenge
            NSWorkspace.shared.open(challenge.authorizationURL)

            message = challenge.userCode == nil
                ? "Completa el inicio de sesión en tu navegador."
                : "Introduce el código mostrado abajo en la página de OpenAI."

            try await appServer.waitForLogin(challenge.loginID)
            loginChallenge = nil

            let account = try await appServer.account()
            guard account.account?.type == "chatgpt" else {
                throw CodexAppServerError.loginFailed(
                    "Statusline necesita una sesión de ChatGPT, no una API key."
                )
            }

            accountEmail = account.account?.email
            connectionState = .connected
            try await fetchAndSyncStatus()
        } catch {
            connectionState = error is CodexAppServerError ? .disconnected : .unavailable
            message = error.localizedDescription
        }

        isBusy = false
    }

    func refresh() async {
        guard connectionState == .connected, !isBusy else {
            return
        }

        isBusy = true
        do {
            try await fetchAndSyncStatus()
        } catch {
            message = error.localizedDescription
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
            try await cloudRepository.deleteStatus()
            status = nil
            accountEmail = nil
            loginChallenge = nil
            connectionState = .disconnected
            message = "Cuenta desconectada y estado eliminado de iCloud."
        } catch {
            message = error.localizedDescription
        }
        isBusy = false
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
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(code, forType: .string)
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
                message = "Conecta tu cuenta de Codex para comenzar."
                isBusy = false
                return
            }

            accountEmail = response.account?.email
            connectionState = .connected
            try await fetchAndSyncStatus()
        } catch CodexAppServerError.executableNotFound {
            connectionState = .unavailable
            message = CodexAppServerError.executableNotFound.localizedDescription
        } catch {
            connectionState = .disconnected
            message = error.localizedDescription
        }

        isBusy = false
    }

    private func fetchAndSyncStatus() async throws {
        message = "Leyendo tu límite semanal de Codex…"
        let limits = try await appServer.rateLimits()
        let currentStatus = try limits.weeklyStatus()

        status = currentStatus
        message = "Enviando el estado a tu iCloud privado…"
        try await cloudRepository.saveStatus(currentStatus)
        message = "Sincronizado correctamente."
    }
}
