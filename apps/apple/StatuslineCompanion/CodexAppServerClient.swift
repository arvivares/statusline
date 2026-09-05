import Foundation

enum CodexAppServerError: Error, StatuslineLocalizedError, Sendable {
    case executableNotFound
    case invalidResponse
    case invalidLoginChallenge
    case processExited
    case rpc(code: Int, message: String)
    case loginFailed(String)

    var errorDescription: String? {
        switch self {
        case .executableNotFound:
            L10n.text("Codex CLI was not found. Install it or include the codex executable in the companion.")
        case .invalidResponse:
            L10n.text("Codex App Server returned an unexpected response.")
        case .invalidLoginChallenge:
            L10n.text("Codex did not return a valid sign-in URL.")
        case .processExited:
            L10n.text("Codex App Server closed unexpectedly.")
        case .rpc:
            L10n.text("Codex App Server returned an unexpected response.")
        case .loginFailed:
            L10n.text("Could not sign in to Codex. Please try again.")
        }
    }
}

enum CodexLoginMode: Sendable {
    case browser
    case deviceCode
}

struct CodexLoginChallenge: Identifiable, Equatable, Sendable {
    let loginID: String
    let authorizationURL: URL
    let userCode: String?

    var id: String { loginID }
}

struct CodexAccountResponse: Decodable, Sendable {
    let account: CodexAccount?
    let requiresOpenaiAuth: Bool
}

struct CodexAccount: Decodable, Sendable {
    let type: String
    let email: String?
    let planType: String?
}

actor CodexAppServerClient {
    private var process: Process?
    private var inputHandle: FileHandle?
    private var readerTask: Task<Void, Never>?
    private var nextRequestID = 1
    private var isInitialized = false
    private var isStarting = false
    private var activeLoginID: String?

    private var pendingResponses: [Int: CheckedContinuation<Data, any Error>] = [:]
    private var startupWaiters: [CheckedContinuation<Void, any Error>] = []
    private var loginWaiters: [String: CheckedContinuation<Void, any Error>] = [:]
    private var completedLogins: [String: Result<Void, CodexAppServerError>] = [:]

    func account() async throws -> CodexAccountResponse {
        try await startIfNeeded()
        return try await request(
            method: "account/read",
            params: GetAccountParams(refreshToken: true)
        )
    }

    func beginLogin(mode: CodexLoginMode) async throws -> CodexLoginChallenge {
        try await startIfNeeded()

        let loginParams = switch mode {
        case .browser:
            LoginStartParams(
                type: "chatgpt",
                useHostedLoginSuccessPage: true,
                appBrand: "chatgpt"
            )
        case .deviceCode:
            LoginStartParams(
                type: "chatgptDeviceCode",
                useHostedLoginSuccessPage: nil,
                appBrand: nil
            )
        }

        let response: LoginStartResponse = try await request(
            method: "account/login/start",
            params: loginParams
        )

        guard let loginID = response.loginId else {
            throw CodexAppServerError.invalidLoginChallenge
        }

        let authorizationURL = response.authUrl ?? response.verificationUrl
        guard let authorizationURL else {
            throw CodexAppServerError.invalidLoginChallenge
        }

        activeLoginID = loginID
        return CodexLoginChallenge(
            loginID: loginID,
            authorizationURL: authorizationURL,
            userCode: response.userCode
        )
    }

    func waitForLogin(_ loginID: String) async throws {
        if let result = completedLogins.removeValue(forKey: loginID) {
            return try result.get()
        }

        try await withCheckedThrowingContinuation { continuation in
            loginWaiters[loginID] = continuation
        }
    }

    func rateLimits() async throws -> CodexRateLimitsResponse {
        try await startIfNeeded()
        return try await request(
            method: "account/rateLimits/read",
            params: EmptyParams()
        )
    }

    func logout() async throws {
        try await startIfNeeded()
        let _: EmptyResponse = try await request(
            method: "account/logout",
            params: EmptyParams()
        )
        activeLoginID = nil
    }

    func stop() {
        readerTask?.cancel()
        readerTask = nil

        try? inputHandle?.close()
        inputHandle = nil

        if process?.isRunning == true {
            process?.terminate()
        }
        process = nil
        isInitialized = false
        isStarting = false

        failOutstandingRequests(with: CodexAppServerError.processExited)
    }

    private func startIfNeeded() async throws {
        if isInitialized {
            return
        }

        if isStarting {
            try await withCheckedThrowingContinuation { continuation in
                startupWaiters.append(continuation)
            }
            return
        }

        isStarting = true

        do {
            try launchProcess()

            let _: InitializeResponse = try await requestWithoutStarting(
                method: "initialize",
                params: InitializeParams(
                    clientInfo: ClientInfo(
                        name: "statusline_companion",
                        title: "Statusline Companion",
                        version: "1.0.0"
                    )
                )
            )

            try sendNotification(method: "initialized")
            isInitialized = true
            isStarting = false

            let waiters = startupWaiters
            startupWaiters.removeAll()
            waiters.forEach { $0.resume() }
        } catch {
            isStarting = false
            isInitialized = false

            let waiters = startupWaiters
            startupWaiters.removeAll()
            waiters.forEach { $0.resume(throwing: error) }

            if process?.isRunning == true {
                process?.terminate()
            }
            process = nil
            inputHandle = nil
            throw error
        }
    }

    private func launchProcess() throws {
        guard let executableURL = locateCodexExecutable() else {
            throw CodexAppServerError.executableNotFound
        }

        let directories = try makeRuntimeDirectories()
        let outputPipe = Pipe()
        let inputPipe = Pipe()
        let process = Process()

        process.executableURL = executableURL
        process.arguments = [
            "app-server",
            "--stdio",
            "-c",
            "cli_auth_credentials_store=\"file\"",
        ]
        process.currentDirectoryURL = directories.runtime
        process.standardInput = inputPipe
        process.standardOutput = outputPipe
        process.standardError = FileHandle.nullDevice

        var environment = ProcessInfo.processInfo.environment
        environment["CODEX_HOME"] = directories.codexHome.path
        process.environment = environment

        try process.run()

        self.process = process
        inputHandle = inputPipe.fileHandleForWriting

        let outputHandle = outputPipe.fileHandleForReading
        readerTask = Task { [weak self] in
            await self?.consumeOutput(from: outputHandle)
        }
    }

    private func consumeOutput(from outputHandle: FileHandle) async {
        do {
            for try await line in outputHandle.bytes.lines {
                guard !Task.isCancelled else {
                    return
                }
                receive(line: line)
            }
        } catch {
            if !Task.isCancelled {
                failOutstandingRequests(with: error)
            }
            return
        }

        if !Task.isCancelled {
            isInitialized = false
            process = nil
            inputHandle = nil
            failOutstandingRequests(with: CodexAppServerError.processExited)
        }
    }

    private func receive(line: String) {
        guard let data = line.data(using: .utf8),
              let header = try? JSONDecoder().decode(IncomingHeader.self, from: data) else {
            return
        }

        if let requestID = header.id,
           let continuation = pendingResponses.removeValue(forKey: requestID) {
            continuation.resume(returning: data)
            return
        }

        guard header.method == "account/login/completed",
              let notification = try? JSONDecoder().decode(
                RPCNotificationEnvelope<LoginCompletedParams>.self,
                from: data
              ) else {
            return
        }

        let loginID = notification.params.loginId ?? activeLoginID
        guard let loginID else {
            return
        }

        let result: Result<Void, CodexAppServerError>
        if notification.params.success {
            result = .success(())
        } else {
            result = .failure(
                .loginFailed(notification.params.error ?? L10n.text("Could not sign in to Codex. Please try again."))
            )
        }

        activeLoginID = nil
        if let continuation = loginWaiters.removeValue(forKey: loginID) {
            continuation.resume(with: result.mapError { $0 as any Error })
        } else {
            completedLogins[loginID] = result
        }
    }

    private func request<Params, Response>(
        method: String,
        params: Params
    ) async throws -> Response
    where Params: Encodable & Sendable, Response: Decodable & Sendable {
        try await requestWithoutStarting(method: method, params: params)
    }

    private func requestWithoutStarting<Params, Response>(
        method: String,
        params: Params
    ) async throws -> Response
    where Params: Encodable & Sendable, Response: Decodable & Sendable {
        let requestID = nextRequestID
        nextRequestID += 1

        let requestData = try JSONEncoder().encode(
            RPCRequest(id: requestID, method: method, params: params)
        )

        let responseData: Data = try await withCheckedThrowingContinuation { continuation in
            pendingResponses[requestID] = continuation

            do {
                try writeLine(requestData)
            } catch {
                pendingResponses.removeValue(forKey: requestID)
                continuation.resume(throwing: error)
            }
        }

        let envelope = try JSONDecoder().decode(RPCResponse<Response>.self, from: responseData)
        if let error = envelope.error {
            throw CodexAppServerError.rpc(code: error.code, message: error.message)
        }

        guard let result = envelope.result else {
            throw CodexAppServerError.invalidResponse
        }
        return result
    }

    private func sendNotification(method: String) throws {
        let data = try JSONEncoder().encode(
            RPCNotification(method: method, params: EmptyParams())
        )
        try writeLine(data)
    }

    private func writeLine(_ data: Data) throws {
        guard let inputHandle else {
            throw CodexAppServerError.processExited
        }

        var framedData = data
        framedData.append(0x0A)
        try inputHandle.write(contentsOf: framedData)
    }

    private func failOutstandingRequests(with error: Error) {
        let responses = Array(pendingResponses.values)
        pendingResponses.removeAll()
        responses.forEach { $0.resume(throwing: error) }

        let logins = Array(loginWaiters.values)
        loginWaiters.removeAll()
        logins.forEach { $0.resume(throwing: error) }

        let startup = startupWaiters
        startupWaiters.removeAll()
        startup.forEach { $0.resume(throwing: error) }
    }

    private func locateCodexExecutable() -> URL? {
        let fileManager = FileManager.default

        let bundledCandidates = [
            Bundle.main.url(forAuxiliaryExecutable: "codex"),
            Bundle.main.url(forResource: "codex", withExtension: nil),
        ].compactMap { $0 }

        let pathCandidates = (ProcessInfo.processInfo.environment["PATH"] ?? "")
            .split(separator: ":")
            .map { URL(fileURLWithPath: String($0)).appendingPathComponent("codex") }

        let home = fileManager.homeDirectoryForCurrentUser
        let knownCandidates = [
            URL(fileURLWithPath: "/opt/homebrew/bin/codex"),
            URL(fileURLWithPath: "/usr/local/bin/codex"),
            home.appendingPathComponent(".local/bin/codex"),
        ]

        return (bundledCandidates + pathCandidates + knownCandidates).first {
            fileManager.isExecutableFile(atPath: $0.path)
        }
    }

    private func makeRuntimeDirectories() throws -> (codexHome: URL, runtime: URL) {
        let fileManager = FileManager.default
        let applicationSupport = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let root = applicationSupport.appendingPathComponent("Statusline Companion", isDirectory: true)
        let codexHome = root.appendingPathComponent("CodexHome", isDirectory: true)
        let runtime = root.appendingPathComponent("Runtime", isDirectory: true)

        try fileManager.createDirectory(at: codexHome, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: runtime, withIntermediateDirectories: true)
        try fileManager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: root.path)
        try fileManager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: codexHome.path)

        return (codexHome, runtime)
    }
}

private struct ClientInfo: Encodable, Sendable {
    let name: String
    let title: String
    let version: String
}

private struct InitializeParams: Encodable, Sendable {
    let clientInfo: ClientInfo
}

private struct InitializeResponse: Decodable, Sendable {
    let codexHome: String
    let platformFamily: String
    let platformOs: String
    let userAgent: String
}

private struct GetAccountParams: Encodable, Sendable {
    let refreshToken: Bool
}

private struct LoginStartParams: Encodable, Sendable {
    let type: String
    let useHostedLoginSuccessPage: Bool?
    let appBrand: String?
}

private struct LoginStartResponse: Decodable, Sendable {
    let type: String
    let loginId: String?
    let authUrl: URL?
    let verificationUrl: URL?
    let userCode: String?
}

private struct LoginCompletedParams: Decodable, Sendable {
    let loginId: String?
    let success: Bool
    let error: String?
}

private struct EmptyParams: Encodable, Sendable {}
private struct EmptyResponse: Decodable, Sendable {}

private struct RPCRequest<Params: Encodable>: Encodable {
    let id: Int
    let method: String
    let params: Params
}

private struct RPCNotification: Encodable {
    let method: String
    let params: EmptyParams
}

private struct IncomingHeader: Decodable {
    let id: Int?
    let method: String?
}

private struct RPCNotificationEnvelope<Params: Decodable>: Decodable {
    let method: String
    let params: Params
}

private struct RPCResponse<Response: Decodable>: Decodable {
    let result: Response?
    let error: RPCErrorPayload?
}

private struct RPCErrorPayload: Decodable {
    let code: Int
    let message: String
}
