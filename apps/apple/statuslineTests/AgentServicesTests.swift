import Foundation
import Testing
@testable import statusline

private enum ServicesFixture {
    nonisolated static let plaintext = #"""
{"schemaVersion":1,"updatedAt":1900000000,"providers":[{"id":"codex","status":"ready","updatedAt":1900000000,"weekly":{"remainingPercentage":53,"resetAt":2000500000,"windowMinutes":10080},"shortWindow":null},{"id":"antigravity","status":"ready","updatedAt":1900000000,"weekly":null,"shortWindow":{"remainingPercentage":73,"resetAt":1900003600,"windowMinutes":300}}]}
"""#
    nonisolated static let envelopeJSON = #"""
{"protocolVersion":1,"payloadKind":"services-v1","sequence":42,"nonce":"BAQEBAQEBAQEBAQE","ciphertext":"LhFbqw6MFmlex9-9ZB69XziG5mFQ4t9oO_MWBL9eR3MSmAWRpqN_yG5Y-NAO76wc4ocp5craDMcKYV6Z_MuWUX-wReYGm2nnMM8KZp7exwYwVNM3_cMXoJQhg5WYMpetLOogJ3n1h4h6dTYfIpkzV4pVaphC_7a9id8EPgixMywBgWt_fEorMBIDd8L6vmJDYKCeNQ4RYXVMOSlexND7PHIKjt4u2_Ek1zw5G-T_pjmjR1_Nh0DEMfzX9kOm5uoCDqiI8iWqXIRTH2Cn1KxDMFs-ibBKayqzPBdZM-Ir_R_iX5AmzDwQIChtjJ_prgcrU8CSucirD8OINU1HtzD8JcCqgs9QzrDmCpw0l1w0YTZP_qjvGK-nIolOigvqUZOwmdtJPwCPPtADvN9rfvjRz-nvwncGIjM0tWQz6hnloi8zJlYarN9ML7mKMxhMCT5sHv8lZnBfzD5jJ-pOFyZoajg1O4ESaVb2d_wwPRGBxVWZpIl7XnmtUf1OOiQpAA"}
"""#
}

private final class ServicesNetworkFixture: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let url = request.url else { return }
        #expect(request.httpMethod == "GET")
        #expect(url.path.hasSuffix("/snapshot"))
        #expect(request.value(forHTTPHeaderField: "Accept") == "application/vnd.statusline.services-v1+json")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer public-fixture")
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(ServicesFixture.envelopeJSON.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@MainActor
private final class ServicesCredentials: StatusRelayReaderCredentialStoring {
    var value: StatusRelayReaderCredentials?
    func loadReader() throws -> StatusRelayReaderCredentials? { value }
    func saveReader(_ credentials: StatusRelayReaderCredentials) throws { value = credentials }
    func deleteReader() throws { value = nil }
}

@MainActor
private final class ServicesReader: CodexRelayReading {
    var endpoint: String? = "https://fixture.example"
    var channel: UUID? = UUID(uuidString: "018f47a0-7b52-4c15-9e55-5f0f266b7440")
    var result: AgentServicesSnapshot?
    var failure: Error?
    var calls = 0
    var onRead: (() -> Void)?
    func pairedChannelID() throws -> UUID? { channel }
    func isPaired() throws -> Bool { channel != nil }
    func pair(using uri: String) async throws { channel = UUID() }
    func disconnect() throws { channel = nil }
    func fetchStatus() async throws -> CodexUsageStatus? { result?.codexStatus }
    func fetchServices() async throws -> AgentServicesSnapshot? {
        calls += 1
        onRead?()
        if let failure { throw failure }
        return result
    }
}

@Suite("Companion service inventory")
@MainActor
struct AgentServicesTests {
    private let channel = UUID(uuidString: "018f47a0-7b52-4c15-9e55-5f0f266b7440")!
    private let now = Date(timeIntervalSince1970: 1_900_000_120)

    @Test func productionReaderNegotiatesOneRequestForBothServices() async throws {
        let config = try StatusRelayConfiguration("https://fixture.example")
        let credentials = ServicesCredentials()
        credentials.value = StatusRelayReaderCredentials(protocolVersion: 1, relayOrigin: config.origin,
            channelID: channel, readerToken: "public-fixture", encryptionKey: Data(repeating: 7, count: 32))
        let sessionConfig = URLSessionConfiguration.ephemeral
        sessionConfig.protocolClasses = [ServicesNetworkFixture.self]
        let session = URLSession(configuration: sessionConfig)
        defer { session.invalidateAndCancel() }
        let reader = CodexRelayReaderRepository(configuration: config, session: session, credentialStore: credentials, isWidget: true)
        let result = try await reader.fetchServices()
        #expect(result?.providers.map(\.id) == [.codex, .antigravity])
        #expect(result?.channelID == channel)
    }

    private func sample(sequence: Int64 = 42) throws -> AgentServicesSnapshot {
        try AgentServicesSnapshot.decode(Data(ServicesFixture.plaintext.utf8), channelID: channel, sequence: sequence)
    }

    private func empty(sequence: Int64 = 43) -> AgentServicesSnapshot {
        AgentServicesSnapshot(providers: [], updatedAt: now, channelID: channel, sequence: sequence)
    }

    private func cache() throws -> (CodexStatusStore, () -> Void) {
        let name = "statusline.tests.services.\(UUID())"
        let defaults = try #require(UserDefaults(suiteName: name))
        return (CodexStatusStore(defaults: defaults), { defaults.removePersistentDomain(forName: name) })
    }

    @Test(arguments: ["codex", "antigravity", "both", "none"])
    func onlyPublishedProvidersAppear(variant: String) throws {
        var wire = try #require(JSONSerialization.jsonObject(with: Data(ServicesFixture.plaintext.utf8)) as? [String: Any])
        let providers = try #require(wire["providers"] as? [[String: Any]])
        wire["providers"] = variant == "both" ? providers : providers.filter { ($0["id"] as? String) == variant }
        let parsed = try AgentServicesSnapshot.decode(JSONSerialization.data(withJSONObject: wire), channelID: channel, sequence: 42)
        #expect(parsed.providers.count == (variant == "both" ? 2 : variant == "none" ? 0 : 1))
        if variant == "antigravity" {
            #expect(parsed.codexStatus == nil)
            #expect(parsed.focusedProvider(preferred: .codex)?.id == .antigravity)
            #expect(parsed.providers[0].weekly == nil)
            #expect(parsed.providers[0].window()?.windowMinutes == 300)
        }
    }

    @Test func unknownFutureProviderDoesNotBreakSupportedServices() throws {
        var wire = try #require(JSONSerialization.jsonObject(with: Data(ServicesFixture.plaintext.utf8)) as? [String: Any])
        var providers = try #require(wire["providers"] as? [[String: Any]])
        providers.append(["id": "future-agent", "status": ["a": "future schema"]])
        wire["providers"] = providers
        let parsed = try AgentServicesSnapshot.decode(JSONSerialization.data(withJSONObject: wire), channelID: channel, sequence: 42)
        #expect(parsed.providers.map(\.id) == [.codex, .antigravity])
    }

    @Test func oldCodexProjectionCannotReplaceInventoryByChangingItsOuterSequence() throws {
        let current = try sample()
        let legacy = AgentServicesSnapshot.legacy(try #require(current.codexStatus), sequence: 999_999)
        #expect(!legacy.supersedes(current))
    }

    @Test(arguments: ["duplicate", "count", "percentage", "weekly-duration", "google-duration", "version", "timestamp", "unavailable-with-quota"])
    func malformedInventoriesAreRejected(variant: String) throws {
        var wire = try #require(JSONSerialization.jsonObject(with: Data(ServicesFixture.plaintext.utf8)) as? [String: Any])
        var providers = try #require(wire["providers"] as? [[String: Any]])
        switch variant {
        case "duplicate": providers.append(providers[0])
        case "count": providers = (0..<17).map { ["id": "future-\($0)"] }
        case "percentage", "weekly-duration":
            var window = try #require(providers[0]["weekly"] as? [String: Any])
            window[variant == "percentage" ? "remainingPercentage" : "windowMinutes"] = variant == "percentage" ? 101 : 300
            providers[0]["weekly"] = window
        case "google-duration":
            var window = try #require(providers[1]["shortWindow"] as? [String: Any])
            window["windowMinutes"] = 60
            providers[1]["shortWindow"] = window
        case "version": wire["schemaVersion"] = 2
        case "timestamp": wire["updatedAt"] = -1
        case "unavailable-with-quota": providers[0]["status"] = "unavailable"
        default: break
        }
        wire["providers"] = providers
        let data = try JSONSerialization.data(withJSONObject: wire)
        #expect(throws: (any Error).self) { try AgentServicesSnapshot.decode(data, channelID: channel, sequence: 42) }
    }

    @Test(arguments: ["valid", "sequence", "kind", "channel", "key"])
    func decryptsSharedVectorAndAuthenticatesEnvelope(variant: String) throws {
        var envelope = try JSONDecoder().decode(StatusRelayEnvelope.self, from: Data(ServicesFixture.envelopeJSON.utf8))
        if variant == "sequence" {
            envelope = StatusRelayEnvelope(protocolVersion: 1, sequence: 43, nonce: envelope.nonce, ciphertext: envelope.ciphertext, payloadKind: "services-v1")
        }
        if variant == "kind" { envelope.payloadKind = nil }
        let credentials = StatusRelayReaderCredentials(protocolVersion: 1, relayOrigin: "https://fixture.example",
            channelID: variant == "channel" ? UUID() : channel, readerToken: "public-fixture",
            encryptionKey: Data(repeating: variant == "key" ? 8 : 7, count: 32))
        if variant == "valid" {
            let parsed = try StatusRelayCrypto.decryptServices(envelope: envelope, credentials: credentials)
            let expected = try sample()
            #expect(parsed == expected)
            #expect(parsed.codexStatus?.remainingPercentage == 53)
            #expect(parsed.providers[1].window()?.remainingPercentage == 73)
        } else {
            #expect(throws: (any Error).self) { try StatusRelayCrypto.decryptServices(envelope: envelope, credentials: credentials) }
        }
    }

    @Test func widgetFetchesBothServicesAndKeepsLastSampleOffline() async throws {
        let (shared, clear) = try cache(); defer { clear() }
        let (local, clearLocal) = try cache(); defer { clearLocal() }
        let reader = ServicesReader()
        reader.result = try sample()
        let loader = AgentWidgetSnapshotLoader(reader: reader, sharedStore: shared, widgetStore: local)
        #expect(await loader.load(now: now) == reader.result)
        #expect(shared.servicesStore.load() == nil)
        #expect(local.servicesStore.load() == reader.result)
        reader.failure = URLError(.notConnectedToInternet)
        #expect(await loader.load(now: now) == reader.result)
        #expect(reader.calls == 2)
    }

    @Test func authoritativeEmptyInventoryCannotResurrectLegacyOrReplayedServices() async throws {
        let (shared, clear) = try cache(); defer { clear() }
        let (local, clearLocal) = try cache(); defer { clearLocal() }
        let reader = ServicesReader()
        try shared.save(try #require(sample().codexStatus))
        try shared.servicesStore.save(sample())
        reader.result = empty()
        let loader = AgentWidgetSnapshotLoader(reader: reader, sharedStore: shared, widgetStore: local)
        #expect(await loader.load(now: now) == empty())
        reader.result = try sample(sequence: 42)
        #expect(await loader.load(now: now.addingTimeInterval(120)) == empty())
        #expect(loader.cachedSnapshot()?.providers.isEmpty == true)
        reader.channel = UUID()
        #expect(loader.cachedSnapshot() == nil)
        reader.channel = nil
        #expect(loader.cachedSnapshot() == nil)
    }

    @Test func disconnectDuringWidgetReadDiscardsBothProviders() async throws {
        let (shared, clear) = try cache(); defer { clear() }
        let (local, clearLocal) = try cache(); defer { clearLocal() }
        let reader = ServicesReader()
        reader.result = try sample()
        reader.onRead = { reader.channel = nil }
        let loader = AgentWidgetSnapshotLoader(reader: reader, sharedStore: shared, widgetStore: local)
        #expect(await loader.load(now: now) == nil)
        #expect(local.servicesStore.load() == nil)
    }

    @Test func appSelectionRemovalAndDisconnectUpdateTheSameSharedInventory() async throws {
        let (store, clear) = try cache(); defer { clear() }
        let reader = ServicesReader()
        reader.result = try sample()
        let vm = CodexStatusViewModel(parser: CodexStatusParser(), store: store, relayRepository: reader)
        await vm.refreshFromRelay()
        #expect(vm.focusedProvider?.id == .codex)
        vm.focus(.antigravity)
        #expect(vm.focusedProvider?.id == .antigravity)
        #expect(store.servicesStore.focusedProvider == .antigravity)
        reader.result = empty()
        await vm.refreshFromRelay()
        #expect(vm.focusedProvider == nil)
        #expect(vm.status == nil)
        #expect(store.loadSaved() == nil)
        vm.disconnectRelay()
        #expect(store.servicesStore.load() == nil)
        #expect(store.servicesStore.focusedProvider == nil)
    }

    @Test func freshSharedInventoryAvoidsAnExtraRequestAndRefreshConsidersEveryWindow() async throws {
        let (shared, clear) = try cache(); defer { clear() }
        let (local, clearLocal) = try cache(); defer { clearLocal() }
        let reader = ServicesReader()
        let current = try sample()
        try shared.servicesStore.save(current)
        let loader = AgentWidgetSnapshotLoader(reader: reader, sharedStore: shared, widgetStore: local)
        #expect(await loader.load(now: current.updatedAt.addingTimeInterval(5)) == current)
        #expect(reader.calls == 0)
        #expect(current.nextWidgetRefresh(after: now) == now.addingTimeInterval(1_800))
        #expect(current.staleTransitions(after: now, before: now.addingTimeInterval(1_800)) == [current.updatedAt.addingTimeInterval(900)])
        let beforeReset = Date(timeIntervalSince1970: 1_900_003_599)
        #expect(current.nextWidgetRefresh(after: beforeReset) == beforeReset.addingTimeInterval(300))
    }
}
