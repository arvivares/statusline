import Foundation
import Testing
@testable import statusline

@Suite("Quota push preferences")
@MainActor
struct QuotaPushTests {
    @Test("Existing Codex-credit opt-in never opts in to quota alerts")
    func preservesLegacyScope() throws {
        let name = "statusline.tests.push.\(UUID())"
        let defaults = try #require(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        defaults.set(true, forKey: "statusline.codexResetPush.enabled")
        let manager = ResetPushManager(defaults: defaults)
        #expect(manager.isEnabled)
        #expect(manager.resetCreditsEnabled)
        #expect(!manager.quotaAlertsEnabled)
    }

    @Test("Notification categories are independent", arguments: [false, true], [false, true])
    func independentPreferences(credits: Bool, quota: Bool) throws {
        let name = "statusline.tests.push.\(UUID())"
        let defaults = try #require(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let manager = ResetPushManager(defaults: defaults)
        manager.markPreferences(resetCredits: credits, quotaAlerts: quota)
        #expect(manager.resetCreditsEnabled == credits)
        #expect(manager.quotaAlertsEnabled == quota)
        #expect(manager.isEnabled == (credits || quota))
        let reloaded = ResetPushManager(defaults: defaults)
        #expect(reloaded.quotaAlertsEnabled == quota)
        #expect(reloaded.resetCreditsEnabled == credits)
    }
}

// Per-request, immutable expectations: safe under parallel Swift Testing.
private final class PushPreferencesProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let url = request.url else { return }
        if url.path == "/health" {
            let capabilities = url.host == "legacy.example" ? #"["reset-push-v1"]"# : #"["reset-push-v1","quota-alerts-v1"]"#
            respond(url, status: 200, body: #"{"status":"ok","protocolVersion":1,"capabilities":\#(capabilities)}"#)
        } else {
            #expect(request.httpMethod == "PUT")
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-reader")
            var body = request.httpBody
            if body == nil, let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var bytes = [UInt8](repeating: 0, count: 8192)
                let count = stream.read(&bytes, maxLength: bytes.count)
                if count > 0 { body = Data(bytes.prefix(count)) }
            }
            do {
                let bytes = try #require(body)
                let decoded = try JSONSerialization.jsonObject(with: bytes) as? [String: Any]
                let object = try #require(decoded)
                #expect(object["quotaAlerts"] as? Bool == true)
                #expect(object["resetCredits"] as? Bool == false)
                #expect(object["language"] as? String == "es")
            } catch { Issue.record(error) }
            respond(url, status: url.host == "denied.example" ? 401 : 204, body: "")
        }
    }
    private func respond(_ url: URL, status: Int, body: String) {
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@Suite("Quota push wire compatibility")
@MainActor
struct QuotaPushNetworkTests {
    @Test(arguments: ["modern", "legacy", "denied"])
    func negotiatesCapabilityAndSendsIndependentPreferences(variant: String) async throws {
        let configuration = try StatusRelayConfiguration("https://\(variant).example")
        let sessionConfiguration = URLSessionConfiguration.ephemeral
        sessionConfiguration.protocolClasses = [PushPreferencesProtocol.self]
        let session = URLSession(configuration: sessionConfiguration)
        defer { session.invalidateAndCancel() }
        let credentials = StatusRelayReaderCredentials(protocolVersion: 1, relayOrigin: configuration.origin,
            channelID: UUID(), readerToken: "fixture-reader", encryptionKey: Data(repeating: 7, count: 32))
        let client = CodexRelayReaderRepository(configuration: configuration, session: session,
                                               credentialStore: PushCredentialFixture(credentials))
        #expect(try await client.supportsQuotaAlerts() == (variant != "legacy"))
        if variant == "denied" {
            await #expect(throws: CodexRelayError.self) {
                try await client.registerPushPreferences(deviceID: UUID(), fid: "fixture-installation", language: "es",
                                                    resetCredits: false, quotaAlerts: true)
            }
        } else {
            try await client.registerPushPreferences(deviceID: UUID(), fid: "fixture-installation", language: "es",
                                                resetCredits: false, quotaAlerts: true)
        }
    }
}

private final class PushCredentialFixture: StatusRelayReaderCredentialStoring {
    private var value: StatusRelayReaderCredentials?
    init(_ value: StatusRelayReaderCredentials) { self.value = value }
    func loadReader() throws -> StatusRelayReaderCredentials? { value }
    func saveReader(_ credentials: StatusRelayReaderCredentials) throws { value = credentials }
    func deleteReader() throws { value = nil }
}
