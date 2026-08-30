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
    private(set) var message = "Comprobando tu sesión de Codex…"
    private(set) var relayMessage = "Comprobando el relay universal…"
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
            try await fetchAndPublishStatus()
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
            try await fetchAndPublishStatus()
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
            status = nil
            accountEmail = nil
            loginChallenge = nil
            connectionState = .disconnected
            message = "Cuenta de Codex desconectada. El vínculo con tus dispositivos se conserva."
        } catch {
            message = error.localizedDescription
        }
        isBusy = false
    }

    func createRelayPairing() async {
        guard !isRelayBusy else {
            return
        }
        isRelayBusy = true
        relayMessage = "Creando credenciales independientes de lectura y escritura…"
        do {
            relayState = try await relayPublisher.createPairing()
            relayMessage = "Escanea este QR desde Statusline en iOS o Android."
            if let status {
                relayState = try await relayPublisher.publish(status)
            }
        } catch {
            relayMessage = error.localizedDescription
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
            relayMessage = error.localizedDescription
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
            relayMessage = "Vínculo eliminado. El snapshot remoto ya no puede descifrarse."
        } catch {
            relayMessage = error.localizedDescription
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
        relayMessage = "Vínculo privado copiado. No lo compartas con terceros."
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
            try await fetchAndPublishStatus()
        } catch CodexAppServerError.executableNotFound {
            connectionState = .unavailable
            message = CodexAppServerError.executableNotFound.localizedDescription
        } catch {
            connectionState = .disconnected
            message = error.localizedDescription
        }

        isBusy = false
    }

    private func fetchAndPublishStatus() async throws {
        message = "Leyendo tu límite semanal de Codex…"
        let limits = try await appServer.rateLimits()
        let currentStatus = try limits.weeklyStatus()
        status = currentStatus

        switch relayState {
        case .pairing, .connected:
            relayMessage = "Cifrando y publicando el snapshot…"
            do {
                relayState = try await relayPublisher.publish(currentStatus)
                relayMessage = relayState.statusMessage
                message = "Codex leído y snapshot cifrado publicado."
            } catch {
                relayMessage = error.localizedDescription
                message = "Codex leído; el relay necesita atención."
            }
        case .notConfigured:
            message = "Codex leído. Configura el endpoint para sincronizar otros dispositivos."
        case .unpaired:
            message = "Codex leído. Crea un vínculo para sincronizar iOS o Android."
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
            "Este build no tiene configurado el endpoint del relay."
        case .unpaired:
            "Crea un vínculo para conectar iOS o Android."
        case .pairing(_, _, let expiresAt, _):
            "Esperando el escaneo del QR. Caduca \(expiresAt.formatted(.relative(presentation: .named)))."
        case .connected(_, let lastPublishedAt):
            if let lastPublishedAt {
                "Snapshot cifrado publicado \(lastPublishedAt.formatted(.relative(presentation: .named)))."
            } else {
                "Dispositivo conectado. Esperando la primera publicación."
            }
        }
    }
}
