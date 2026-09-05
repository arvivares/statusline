import CryptoKit
import Foundation
import Security

enum CodexRelayError: Error, StatuslineLocalizedError, Sendable {
    case notConfigured
    case notPaired
    case invalidConfiguration
    case invalidPairing
    case invalidResponse
    case invalidSnapshot
    case secureStorage
    case encryptionFailed
    case endpointMismatch
    case networkUnavailable
    case timedOut
    case server(code: String, message: String)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            L10n.text("This build does not have a relay endpoint configured yet.")
        case .notPaired:
            L10n.text("Pair this device with Statusline Companion first.")
        case .invalidConfiguration:
            L10n.text("The relay URL is invalid.")
        case .invalidPairing:
            L10n.text("The pairing QR or link is invalid.")
        case .invalidResponse:
            L10n.text("The relay returned an unexpected response.")
        case .invalidSnapshot:
            L10n.text("The received snapshot has an invalid format.")
        case .secureStorage:
            L10n.text("Could not access this device’s secure storage.")
        case .encryptionFailed:
            L10n.text("Could not encrypt or decrypt the snapshot.")
        case .endpointMismatch:
            L10n.text("The pairing belongs to a different Statusline relay.")
        case .networkUnavailable:
            L10n.text("Could not connect to the relay. Check your connection and try again.")
        case .timedOut:
            L10n.text("The relay took too long to respond.")
        case .server(let code, _):
            L10n.relayError(code)
        }
    }
}

struct StatusRelayConfiguration: Equatable, Sendable {
    static let infoKey = "StatuslineRelayBaseURL"

    let baseURL: URL
    let origin: String

    static func current(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        bundle: Bundle = .main
    ) -> StatusRelayConfiguration? {
        let rawValue = environment["STATUSLINE_RELAY_BASE_URL"]
            ?? bundle.object(forInfoDictionaryKey: infoKey) as? String
        guard let rawValue, !rawValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return try? StatusRelayConfiguration(rawValue)
    }

    init(_ rawValue: String) throws {
        guard var components = URLComponents(string: rawValue),
              let host = components.host,
              components.user == nil,
              components.password == nil,
              components.query == nil,
              components.fragment == nil else {
            throw CodexRelayError.invalidConfiguration
        }

        let isHTTPS = components.scheme?.lowercased() == "https"
        #if DEBUG
        let isLocalHTTP = components.scheme?.lowercased() == "http"
            && ["localhost", "127.0.0.1", "::1"].contains(host.lowercased())
        #else
        let isLocalHTTP = false
        #endif
        guard isHTTPS || isLocalHTTP else {
            throw CodexRelayError.invalidConfiguration
        }

        components.path = "/"
        guard let normalizedURL = components.url else {
            throw CodexRelayError.invalidConfiguration
        }
        baseURL = normalizedURL
        origin = normalizedURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    func endpoint(_ components: String...) throws -> URL {
        var result = baseURL
        for component in components {
            guard !component.isEmpty, !component.contains("/") else {
                throw CodexRelayError.invalidConfiguration
            }
            result.append(path: component)
        }
        return result
    }
}

struct StatusRelayPairing: Equatable, Sendable {
    let channelID: UUID
    let pairingToken: String
    let encryptionKey: Data

    init(uri: String) throws {
        guard let components = URLComponents(string: uri),
              components.scheme == "statusline",
              components.host == "pair",
              components.user == nil,
              components.password == nil,
              components.fragment == nil,
              let items = components.queryItems,
              items.count == 4 else {
            throw CodexRelayError.invalidPairing
        }

        var values: [String: String] = [:]
        for item in items {
            guard values[item.name] == nil, let value = item.value else {
                throw CodexRelayError.invalidPairing
            }
            values[item.name] = value
        }
        guard values["v"] == "1",
              let channelValue = values["channel"],
              let channelID = UUID(uuidString: channelValue),
              let pairingToken = values["pairing"],
              pairingToken.base64URLData?.count == 32,
              let encryptionKey = values["key"]?.base64URLData,
              encryptionKey.count == 32 else {
            throw CodexRelayError.invalidPairing
        }
        self.channelID = channelID
        self.pairingToken = pairingToken
        self.encryptionKey = encryptionKey
    }
}

struct StatusRelayReaderCredentials: Codable, Equatable, Sendable {
    let protocolVersion: Int
    let relayOrigin: String
    let channelID: UUID
    let readerToken: String
    let encryptionKey: Data
}

struct StatusRelayPublisherCredentials: Codable, Equatable, Sendable {
    let protocolVersion: Int
    let relayOrigin: String
    let channelID: UUID
    let publisherToken: String
    let encryptionKey: Data
    var pendingPairingToken: String?
    var pairingExpiresAt: Int64
    var expiresAt: Int64
    var lastSequence: Int64?
    var lastPublishedAt: Int64?

    var pairingURI: String? {
        guard let pendingPairingToken else {
            return nil
        }
        var components = URLComponents()
        components.scheme = "statusline"
        components.host = "pair"
        components.queryItems = [
            URLQueryItem(name: "v", value: "1"),
            URLQueryItem(name: "channel", value: channelID.uuidString.lowercased()),
            URLQueryItem(name: "pairing", value: pendingPairingToken),
            URLQueryItem(name: "key", value: encryptionKey.base64URLEncodedString),
        ]
        return components.url?.absoluteString
    }
}

enum StatusRelayPublisherState: Equatable, Sendable {
    case notConfigured
    case unpaired(endpoint: String)
    case pairing(endpoint: String, uri: String, expiresAt: Date, lastPublishedAt: Date?)
    case connected(endpoint: String, lastPublishedAt: Date?)
}

private struct StatusRelaySnapshot: Codable, Equatable, Sendable {
    let schemaVersion: Int
    let remainingPercentage: Int
    let resetAt: Int64
    let updatedAt: Int64

    init(status: CodexUsageStatus) {
        schemaVersion = 1
        remainingPercentage = status.remainingPercentage
        resetAt = Int64(status.resetDate.timeIntervalSince1970)
        updatedAt = Int64(status.updatedAt.timeIntervalSince1970)
    }

    var usageStatus: CodexUsageStatus? {
        guard schemaVersion == 1,
              (0...100).contains(remainingPercentage),
              resetAt > 0,
              updatedAt > 0 else {
            return nil
        }
        return CodexUsageStatus(
            remainingPercentage: remainingPercentage,
            resetDate: Date(timeIntervalSince1970: TimeInterval(resetAt)),
            updatedAt: Date(timeIntervalSince1970: TimeInterval(updatedAt)),
            sourceText: "Sincronizado mediante el relay universal cifrado de Statusline."
        )
    }
}

struct StatusRelayEnvelope: Codable, Equatable, Sendable {
    let protocolVersion: Int
    let sequence: Int64
    let nonce: String
    let ciphertext: String
}

private struct CreateChannelResponse: Decodable, Sendable {
    let protocolVersion: Int
    let channelId: UUID
    let publisherToken: String
    let pairingToken: String
    let pairingExpiresAt: Int64
    let expiresAt: Int64
}

private struct ClaimChannelResponse: Decodable, Sendable {
    let protocolVersion: Int
    let readerToken: String
    let expiresAt: Int64
}

private struct ChannelMetadata: Decodable, Sendable {
    let protocolVersion: Int
    let readerClaimedAt: Int64?
    let pairingExpiresAt: Int64
    let lastPublishedAt: Int64?
    let expiresAt: Int64
}

private struct RelayAPIErrorEnvelope: Decodable, Sendable {
    struct Body: Decodable, Sendable {
        let code: String
        let message: String
    }

    let error: Body
}

private final class StatusRelayNoRedirectDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    nonisolated func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

@MainActor
private final class StatusRelayAPIClient {
    private static let maximumResponseBytes = 64 * 1_024

    private let configuration: StatusRelayConfiguration
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(
        configuration: StatusRelayConfiguration,
        session: URLSession? = nil
    ) {
        self.configuration = configuration
        if let session {
            self.session = session
        } else {
            let sessionConfiguration = URLSessionConfiguration.ephemeral
            sessionConfiguration.timeoutIntervalForRequest = 20
            sessionConfiguration.timeoutIntervalForResource = 30
            sessionConfiguration.waitsForConnectivity = true
            sessionConfiguration.requestCachePolicy = .reloadIgnoringLocalCacheData
            sessionConfiguration.httpShouldSetCookies = false
            sessionConfiguration.urlCredentialStorage = nil
            self.session = URLSession(
                configuration: sessionConfiguration,
                delegate: StatusRelayNoRedirectDelegate(),
                delegateQueue: nil
            )
        }
    }

    func createChannel() async throws -> CreateChannelResponse {
        var request = URLRequest(url: try configuration.endpoint("v1", "channels"))
        request.httpMethod = "POST"
        let (data, response) = try await perform(request)
        try requireStatus(response, data: data, allowed: [201])
        return try decode(CreateChannelResponse.self, from: data)
    }

    func claim(_ pairing: StatusRelayPairing) async throws -> ClaimChannelResponse {
        var request = URLRequest(
            url: try configuration.endpoint(
                "v1", "channels", pairing.channelID.uuidString.lowercased(), "claim"
            )
        )
        request.httpMethod = "POST"
        authorize(&request, token: pairing.pairingToken)
        let (data, response) = try await perform(request)
        try requireStatus(response, data: data, allowed: [201])
        return try decode(ClaimChannelResponse.self, from: data)
    }

    func metadata(_ credentials: StatusRelayPublisherCredentials) async throws -> ChannelMetadata {
        var request = URLRequest(
            url: try configuration.endpoint(
                "v1", "channels", credentials.channelID.uuidString.lowercased()
            )
        )
        authorize(&request, token: credentials.publisherToken)
        let (data, response) = try await perform(request)
        try requireStatus(response, data: data, allowed: [200])
        return try decode(ChannelMetadata.self, from: data)
    }

    func publish(
        _ envelope: StatusRelayEnvelope,
        credentials: StatusRelayPublisherCredentials
    ) async throws {
        var request = URLRequest(
            url: try configuration.endpoint(
                "v1", "channels", credentials.channelID.uuidString.lowercased(), "snapshot"
            )
        )
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(envelope)
        authorize(&request, token: credentials.publisherToken)
        let (data, response) = try await perform(request)
        try requireStatus(response, data: data, allowed: [201, 204])
    }

    func fetch(_ credentials: StatusRelayReaderCredentials) async throws -> StatusRelayEnvelope? {
        var request = URLRequest(
            url: try configuration.endpoint(
                "v1", "channels", credentials.channelID.uuidString.lowercased(), "snapshot"
            )
        )
        authorize(&request, token: credentials.readerToken)
        let (data, response) = try await perform(request)
        if response.statusCode == 404,
           let body = try? decoder.decode(RelayAPIErrorEnvelope.self, from: data),
           body.error.code == "snapshotNotFound" {
            return nil
        }
        try requireStatus(response, data: data, allowed: [200])
        return try decode(StatusRelayEnvelope.self, from: data)
    }

    func delete(_ credentials: StatusRelayPublisherCredentials) async throws {
        var request = URLRequest(
            url: try configuration.endpoint(
                "v1", "channels", credentials.channelID.uuidString.lowercased()
            )
        )
        request.httpMethod = "DELETE"
        authorize(&request, token: credentials.publisherToken)
        let (data, response) = try await perform(request)
        try requireStatus(response, data: data, allowed: [204, 404])
    }

    private func perform(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (bytes, response) = try await session.bytes(for: request)
            guard let httpResponse = response as? HTTPURLResponse,
                  response.expectedContentLength <= Int64(Self.maximumResponseBytes)
                    || response.expectedContentLength == NSURLSessionTransferSizeUnknown else {
                throw CodexRelayError.invalidResponse
            }
            var data = Data()
            if response.expectedContentLength > 0 {
                data.reserveCapacity(Int(response.expectedContentLength))
            }
            for try await byte in bytes {
                guard data.count < Self.maximumResponseBytes else {
                    throw CodexRelayError.invalidResponse
                }
                data.append(byte)
            }
            return (data, httpResponse)
        } catch let error as CodexRelayError {
            throw error
        } catch let error as URLError {
            switch error.code {
            case .notConnectedToInternet, .networkConnectionLost, .cannotFindHost:
                throw CodexRelayError.networkUnavailable
            case .timedOut:
                throw CodexRelayError.timedOut
            case .cancelled:
                throw CancellationError()
            default:
                throw CodexRelayError.networkUnavailable
            }
        }
    }

    private func requireStatus(
        _ response: HTTPURLResponse,
        data: Data,
        allowed: Set<Int>
    ) throws {
        guard allowed.contains(response.statusCode) else {
            if let body = try? decoder.decode(RelayAPIErrorEnvelope.self, from: data),
               !body.error.code.isEmpty,
               !body.error.message.isEmpty {
                throw CodexRelayError.server(code: body.error.code, message: body.error.message)
            }
            throw CodexRelayError.invalidResponse
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try decoder.decode(type, from: data)
        } catch {
            throw CodexRelayError.invalidResponse
        }
    }

    private func authorize(_ request: inout URLRequest, token: String) {
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }
}

enum StatusRelayCrypto {
    static func encrypt(
        status: CodexUsageStatus,
        credentials: StatusRelayPublisherCredentials,
        sequence: Int64
    ) throws -> StatusRelayEnvelope {
        do {
            let plaintext = try JSONEncoder().encode(StatusRelaySnapshot(status: status))
            let key = SymmetricKey(data: credentials.encryptionKey)
            let sealed = try AES.GCM.seal(
                plaintext,
                using: key,
                authenticating: authenticatedData(channelID: credentials.channelID)
            )
            var ciphertext = sealed.ciphertext
            ciphertext.append(sealed.tag)
            return StatusRelayEnvelope(
                protocolVersion: 1,
                sequence: sequence,
                nonce: Data(sealed.nonce).base64URLEncodedString,
                ciphertext: ciphertext.base64URLEncodedString
            )
        } catch {
            throw CodexRelayError.encryptionFailed
        }
    }

    static func decrypt(
        envelope: StatusRelayEnvelope,
        credentials: StatusRelayReaderCredentials
    ) throws -> CodexUsageStatus {
        guard envelope.protocolVersion == 1,
              envelope.sequence > 0,
              let nonceData = envelope.nonce.base64URLData,
              nonceData.count == 12,
              let encryptedData = envelope.ciphertext.base64URLData,
              encryptedData.count > 16 else {
            throw CodexRelayError.invalidSnapshot
        }
        do {
            let ciphertext = encryptedData.dropLast(16)
            let tag = encryptedData.suffix(16)
            let sealed = try AES.GCM.SealedBox(
                nonce: AES.GCM.Nonce(data: nonceData),
                ciphertext: ciphertext,
                tag: tag
            )
            let plaintext = try AES.GCM.open(
                sealed,
                using: SymmetricKey(data: credentials.encryptionKey),
                authenticating: authenticatedData(channelID: credentials.channelID)
            )
            guard let status = try JSONDecoder()
                .decode(StatusRelaySnapshot.self, from: plaintext)
                .usageStatus else {
                throw CodexRelayError.invalidSnapshot
            }
            return status
        } catch let error as CodexRelayError {
            throw error
        } catch {
            throw CodexRelayError.encryptionFailed
        }
    }

    private static func authenticatedData(channelID: UUID) -> Data {
        Data("statusline.snapshot.v1|\(channelID.uuidString.lowercased())".utf8)
    }
}

private struct StatusRelayCredentialStore {
    private static let service = "inmerzion.statusline.relay"
    private static let readerAccount = "universal-reader-v1"
    private static let publisherAccount = "universal-publisher-v1"

    func loadReader() throws -> StatusRelayReaderCredentials? {
        try load(StatusRelayReaderCredentials.self, account: Self.readerAccount)
    }

    func saveReader(_ credentials: StatusRelayReaderCredentials) throws {
        try save(credentials, account: Self.readerAccount)
    }

    func deleteReader() throws {
        try delete(account: Self.readerAccount)
    }

    func loadPublisher() throws -> StatusRelayPublisherCredentials? {
        try load(StatusRelayPublisherCredentials.self, account: Self.publisherAccount)
    }

    func savePublisher(_ credentials: StatusRelayPublisherCredentials) throws {
        try save(credentials, account: Self.publisherAccount)
    }

    func deletePublisher() throws {
        try delete(account: Self.publisherAccount)
    }

    private func load<T: Decodable>(_ type: T.Type, account: String) throws -> T? {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess, let data = item as? Data else {
            throw CodexRelayError.secureStorage
        }
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw CodexRelayError.secureStorage
        }
    }

    private func save<T: Encodable>(_ value: T, account: String) throws {
        let data: Data
        do {
            data = try JSONEncoder().encode(value)
        } catch {
            throw CodexRelayError.secureStorage
        }
        let query = baseQuery(account: account)
        let update = [kSecValueData as String: data]
        let updateStatus = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if updateStatus == errSecSuccess {
            return
        }
        guard updateStatus == errSecItemNotFound else {
            throw CodexRelayError.secureStorage
        }
        var insertion = query
        insertion[kSecValueData as String] = data
        insertion[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(insertion as CFDictionary, nil) == errSecSuccess else {
            throw CodexRelayError.secureStorage
        }
    }

    private func delete(account: String) throws {
        let status = SecItemDelete(baseQuery(account: account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw CodexRelayError.secureStorage
        }
    }

    private func baseQuery(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: account,
        ]
    }
}

@MainActor
final class CodexRelayReaderRepository {
    private let configuration: StatusRelayConfiguration?
    private let store: StatusRelayCredentialStore
    private let client: StatusRelayAPIClient?

    convenience init() {
        self.init(configuration: StatusRelayConfiguration.current())
    }

    init(
        configuration: StatusRelayConfiguration?,
        session: URLSession? = nil
    ) {
        self.configuration = configuration
        store = StatusRelayCredentialStore()
        client = configuration.map { StatusRelayAPIClient(configuration: $0, session: session) }
    }

    var endpoint: String? { configuration?.origin }

    func isPaired() throws -> Bool {
        try store.loadReader() != nil
    }

    func pair(using uri: String) async throws {
        guard let configuration, let client else {
            throw CodexRelayError.notConfigured
        }
        let pairing = try StatusRelayPairing(uri: uri)
        let claimed = try await client.claim(pairing)
        guard claimed.protocolVersion == 1,
              claimed.readerToken.base64URLData?.count == 32,
              claimed.expiresAt > 0 else {
            throw CodexRelayError.invalidResponse
        }
        let credentials = StatusRelayReaderCredentials(
            protocolVersion: 1,
            relayOrigin: configuration.origin,
            channelID: pairing.channelID,
            readerToken: claimed.readerToken,
            encryptionKey: pairing.encryptionKey
        )
        try store.saveReader(credentials)
    }

    func fetchStatus() async throws -> CodexUsageStatus? {
        guard let configuration, let client else {
            throw CodexRelayError.notConfigured
        }
        guard let credentials = try store.loadReader() else {
            throw CodexRelayError.notPaired
        }
        guard credentials.protocolVersion == 1,
              credentials.relayOrigin == configuration.origin else {
            throw CodexRelayError.endpointMismatch
        }
        guard let envelope = try await client.fetch(credentials) else {
            return nil
        }
        return try StatusRelayCrypto.decrypt(envelope: envelope, credentials: credentials)
    }

    func disconnect() throws {
        try store.deleteReader()
    }
}

@MainActor
final class CodexRelayPublisherRepository {
    private let configuration: StatusRelayConfiguration?
    private let store: StatusRelayCredentialStore
    private let client: StatusRelayAPIClient?

    convenience init() {
        self.init(configuration: StatusRelayConfiguration.current())
    }

    init(
        configuration: StatusRelayConfiguration?,
        session: URLSession? = nil
    ) {
        self.configuration = configuration
        store = StatusRelayCredentialStore()
        client = configuration.map { StatusRelayAPIClient(configuration: $0, session: session) }
    }

    func status() async throws -> StatusRelayPublisherState {
        guard let configuration, let client else {
            return .notConfigured
        }
        guard var credentials = try store.loadPublisher() else {
            return .unpaired(endpoint: configuration.origin)
        }
        try requireCurrentEndpoint(credentials, configuration: configuration)
        let metadata = try await client.metadata(credentials)
        try validate(metadata)
        credentials.pairingExpiresAt = metadata.pairingExpiresAt
        credentials.expiresAt = metadata.expiresAt
        if metadata.readerClaimedAt != nil {
            credentials.pendingPairingToken = nil
        }
        if credentials.lastPublishedAt == nil {
            credentials.lastPublishedAt = metadata.lastPublishedAt
        }
        try store.savePublisher(credentials)
        return try publisherState(credentials, configuration: configuration)
    }

    func createPairing() async throws -> StatusRelayPublisherState {
        guard let configuration, let client else {
            throw CodexRelayError.notConfigured
        }
        if let existing = try store.loadPublisher(), existing.relayOrigin == configuration.origin {
            try? await client.delete(existing)
        }
        let response = try await client.createChannel()
        try validate(response)
        var key = Data(count: 32)
        let result = key.withUnsafeMutableBytes { bytes in
            SecRandomCopyBytes(kSecRandomDefault, 32, bytes.baseAddress!)
        }
        guard result == errSecSuccess else {
            throw CodexRelayError.encryptionFailed
        }
        let credentials = StatusRelayPublisherCredentials(
            protocolVersion: 1,
            relayOrigin: configuration.origin,
            channelID: response.channelId,
            publisherToken: response.publisherToken,
            encryptionKey: key,
            pendingPairingToken: response.pairingToken,
            pairingExpiresAt: response.pairingExpiresAt,
            expiresAt: response.expiresAt,
            lastSequence: nil,
            lastPublishedAt: nil
        )
        try store.savePublisher(credentials)
        return try publisherState(credentials, configuration: configuration)
    }

    func publish(_ status: CodexUsageStatus) async throws -> StatusRelayPublisherState {
        guard let configuration, let client else {
            throw CodexRelayError.notConfigured
        }
        guard var credentials = try store.loadPublisher() else {
            throw CodexRelayError.notPaired
        }
        try requireCurrentEndpoint(credentials, configuration: configuration)
        let milliseconds = Int64(Date.now.timeIntervalSince1970 * 1_000)
        let sequence = max(milliseconds, (credentials.lastSequence ?? 0) + 1)
        let envelope = try StatusRelayCrypto.encrypt(
            status: status,
            credentials: credentials,
            sequence: sequence
        )
        try await client.publish(envelope, credentials: credentials)
        credentials.lastSequence = sequence
        credentials.lastPublishedAt = Int64(status.updatedAt.timeIntervalSince1970)
        let metadata = try await client.metadata(credentials)
        try validate(metadata)
        credentials.expiresAt = metadata.expiresAt
        credentials.pairingExpiresAt = metadata.pairingExpiresAt
        if metadata.readerClaimedAt != nil {
            credentials.pendingPairingToken = nil
        }
        try store.savePublisher(credentials)
        return try publisherState(credentials, configuration: configuration)
    }

    func disconnect() async throws {
        if let configuration, let client, let credentials = try store.loadPublisher(),
           credentials.relayOrigin == configuration.origin {
            try? await client.delete(credentials)
        }
        try store.deletePublisher()
    }

    private func publisherState(
        _ credentials: StatusRelayPublisherCredentials,
        configuration: StatusRelayConfiguration
    ) throws -> StatusRelayPublisherState {
        let published = credentials.lastPublishedAt.map {
            Date(timeIntervalSince1970: TimeInterval($0))
        }
        if credentials.pendingPairingToken != nil {
            guard let uri = credentials.pairingURI else {
                throw CodexRelayError.invalidPairing
            }
            return .pairing(
                endpoint: configuration.origin,
                uri: uri,
                expiresAt: Date(timeIntervalSince1970: TimeInterval(credentials.pairingExpiresAt)),
                lastPublishedAt: published
            )
        }
        return .connected(endpoint: configuration.origin, lastPublishedAt: published)
    }

    private func requireCurrentEndpoint(
        _ credentials: StatusRelayPublisherCredentials,
        configuration: StatusRelayConfiguration
    ) throws {
        guard credentials.protocolVersion == 1,
              credentials.relayOrigin == configuration.origin else {
            throw CodexRelayError.endpointMismatch
        }
    }

    private func validate(_ response: CreateChannelResponse) throws {
        guard response.protocolVersion == 1,
              response.publisherToken.base64URLData?.count == 32,
              response.pairingToken.base64URLData?.count == 32,
              response.pairingExpiresAt > 0,
              response.expiresAt > response.pairingExpiresAt else {
            throw CodexRelayError.invalidResponse
        }
    }

    private func validate(_ metadata: ChannelMetadata) throws {
        guard metadata.protocolVersion == 1,
              metadata.pairingExpiresAt > 0,
              metadata.expiresAt > 0,
              metadata.readerClaimedAt.map({ $0 > 0 }) ?? true,
              metadata.lastPublishedAt.map({ $0 > 0 }) ?? true else {
            throw CodexRelayError.invalidResponse
        }
    }
}

private extension Data {
    var base64URLEncodedString: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

private extension String {
    var base64URLData: Data? {
        guard !isEmpty,
              range(of: #"^[A-Za-z0-9_-]+$"#, options: .regularExpression) != nil else {
            return nil
        }
        var base64 = replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = base64.count % 4
        guard remainder != 1 else {
            return nil
        }
        if remainder > 0 {
            base64.append(String(repeating: "=", count: 4 - remainder))
        }
        return Data(base64Encoded: base64)
    }
}
