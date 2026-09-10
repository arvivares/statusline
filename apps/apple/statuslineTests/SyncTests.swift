import Foundation
import Testing
@testable import statusline

@MainActor
private final class SyncGate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []
    func wait() async {
        if isOpen { return }
        await withCheckedContinuation { waiters.append($0) }
    }
    func open() {
        isOpen = true
        let pending = waiters
        waiters.removeAll()
        pending.forEach { $0.resume() }
    }
}

@MainActor
private final class SyncReader: CodexRelayReading {
    var endpoint: String? = "https://relay.example"
    var channel: UUID? = UUID()
    var result: CodexUsageStatus?
    var error: Error?
    var calls = 0
    var suspended = false
    let started = SyncGate()
    let resume = SyncGate()
    func isPaired() throws -> Bool { channel != nil }
    func pairedChannelID() throws -> UUID? { channel }
    func pair(using uri: String) async throws { channel = UUID() }
    func disconnect() throws { channel = nil }
    func fetchStatus() async throws -> CodexUsageStatus? {
        calls += 1
        started.open()
        if suspended { await resume.wait() }
        if let error { throw error }
        return result
    }
}

@Suite("Independent widget and foreground synchronization")
@MainActor
struct SyncTests {
    private func store() throws -> (CodexStatusStore, () -> Void) {
        let name = "statusline.tests.sync.\(UUID())"
        let defaults = try #require(UserDefaults(suiteName: name))
        return (CodexStatusStore(defaults: defaults), { defaults.removePersistentDomain(forName: name) })
    }

    private func sample(channel: UUID?, age: TimeInterval = 120) -> CodexUsageStatus {
        CodexUsageStatus(remainingPercentage: 53, resetDate: .now.addingTimeInterval(86_400),
                         updatedAt: .now.addingTimeInterval(-age), sourceText: "fixture", relayChannelID: channel)
    }

    @Test("Widget fetches without app activity and preserves its last sample offline")
    func independentWidgetAndOfflineFallback() async throws {
        let (shared, clearShared) = try store(); defer { clearShared() }
        let (local, clearLocal) = try store(); defer { clearLocal() }
        let reader = SyncReader()
        let fetched = sample(channel: reader.channel)
        reader.result = fetched
        let loader = CodexWidgetSnapshotLoader(reader: reader, sharedStore: shared, widgetStore: local)
        #expect(await loader.load() == fetched)
        #expect(local.loadSaved() == fetched)
        #expect(shared.loadSaved() == nil) // Widget never overwrites app-owned state.
        reader.error = URLError(.notConnectedToInternet)
        #expect(await loader.load() == fetched)
        #expect(reader.calls == 2)
        reader.error = nil
        reader.result = nil
        #expect(await loader.load() == fetched)
    }

    @Test("Widget coalesces simultaneous timeline requests")
    func coalescesWidgetRequests() async throws {
        let (shared, clearShared) = try store(); defer { clearShared() }
        let (local, clearLocal) = try store(); defer { clearLocal() }
        let reader = SyncReader()
        reader.result = sample(channel: reader.channel)
        reader.suspended = true
        let loader = CodexWidgetSnapshotLoader(reader: reader, sharedStore: shared, widgetStore: local)
        let first = Task { await loader.load() }
        await reader.started.wait()
        let secondStarted = SyncGate()
        let second = Task { secondStarted.open(); return await loader.load() }
        await secondStarted.wait()
        reader.resume.open()
        #expect(await first.value == reader.result)
        #expect(await second.value == reader.result)
        #expect(reader.calls == 1)
    }

    @Test("A recent app sample avoids an extra widget network request")
    func recentSharedSample() async throws {
        let (shared, clearShared) = try store(); defer { clearShared() }
        let (local, clearLocal) = try store(); defer { clearLocal() }
        let reader = SyncReader()
        let recent = sample(channel: reader.channel, age: 5)
        try shared.save(recent)
        let loader = CodexWidgetSnapshotLoader(reader: reader, sharedStore: shared, widgetStore: local)
        #expect(await loader.load() == recent)
        #expect(reader.calls == 0)
    }

    @Test("Disconnected and replaced pairings cannot reuse a cached account sample")
    func isolatesAccountChanges() async throws {
        let (shared, clearShared) = try store(); defer { clearShared() }
        let (local, clearLocal) = try store(); defer { clearLocal() }
        let reader = SyncReader()
        try shared.save(sample(channel: reader.channel))
        try local.save(sample(channel: reader.channel))
        let loader = CodexWidgetSnapshotLoader(reader: reader, sharedStore: shared, widgetStore: local)
        #expect(loader.cachedStatus() != nil)
        reader.channel = UUID()
        #expect(loader.cachedStatus() == nil)
        reader.channel = nil
        #expect(await loader.load() == nil)
        #expect(reader.calls == 0)
    }

    @Test("A late widget response is discarded after disconnect")
    func rejectsLateWidgetResponse() async throws {
        let (shared, clearShared) = try store(); defer { clearShared() }
        let (local, clearLocal) = try store(); defer { clearLocal() }
        let reader = SyncReader()
        reader.result = sample(channel: reader.channel)
        reader.suspended = true
        let loader = CodexWidgetSnapshotLoader(reader: reader, sharedStore: shared, widgetStore: local)
        let task = Task { await loader.load() }
        await reader.started.wait()
        reader.channel = nil
        reader.resume.open()
        #expect(await task.value == nil)
        #expect(local.loadSaved() == nil)
    }

    @Test("Foreground loop requests 60 seconds, recovers from failure and stops on cancellation")
    func foregroundCadenceAndRecovery() async throws {
        let (store, clear) = try store(); defer { clear() }
        let reader = SyncReader()
        reader.error = URLError(.notConnectedToInternet)
        reader.result = sample(channel: reader.channel)
        let vm = CodexStatusViewModel(parser: CodexStatusParser(), store: store, relayRepository: reader)
        var waits = 0
        await vm.runForegroundRefresh { duration in
            #expect(duration == .seconds(60))
            waits += 1
            if waits == 1 {
                #expect(vm.relaySyncState.isError)
                reader.error = nil
            } else { throw CancellationError() }
        }
        #expect(reader.calls == 2)
        #expect(vm.status == reader.result)
        #expect(!vm.relaySyncState.isError)
    }

    @Test("Overlapping app refreshes do not republish a disconnected account")
    func appDisconnectDuringRefresh() async throws {
        let (store, clear) = try store(); defer { clear() }
        let reader = SyncReader()
        reader.result = sample(channel: reader.channel)
        reader.suspended = true
        let vm = CodexStatusViewModel(parser: CodexStatusParser(), store: store, relayRepository: reader)
        let task = Task { await vm.refreshFromRelay() }
        await reader.started.wait()
        await vm.refreshFromRelay()
        #expect(reader.calls == 1)
        vm.disconnectRelay()
        reader.resume.open()
        await task.value
        #expect(vm.status == nil)
        #expect(store.loadSaved() == nil)
        #expect(vm.relaySyncState == .unpaired)
    }

    @Test("Cancellation is not displayed as a sync error")
    func cancellationPreservesSample() async throws {
        let (store, clear) = try store(); defer { clear() }
        let reader = SyncReader()
        let original = sample(channel: reader.channel)
        try store.save(original)
        reader.error = CancellationError()
        let vm = CodexStatusViewModel(parser: CodexStatusParser(), store: store, relayRepository: reader)
        await vm.refreshFromRelay()
        #expect(vm.status == original)
        #expect(!vm.relaySyncState.isError)
    }

    @Test("Widget refresh policy is 30 minutes and never invents a reset")
    func widgetTimingAndStaleness() {
        let now = Date.now
        let current = sample(channel: UUID(), age: 0)
        #expect(CodexSyncPolicy.nextWidgetRefresh(after: now, status: nil) == now.addingTimeInterval(1_800))
        #expect(!CodexSyncPolicy.isStale(current, at: now))
        #expect(CodexSyncPolicy.isStale(current, at: current.updatedAt.addingTimeInterval(900)))
        let reset = CodexUsageStatus(remainingPercentage: 5, resetDate: now.addingTimeInterval(1), updatedAt: now, sourceText: "fixture")
        #expect(CodexSyncPolicy.nextWidgetRefresh(after: now, status: reset) == now.addingTimeInterval(300))
        #expect(CodexSyncPolicy.isStale(reset, at: now.addingTimeInterval(2)))
        #expect(reset.remainingPercentage == 5)
    }
}

@MainActor
private final class ReaderCredentialFixture: StatusRelayReaderCredentialStoring {
    var value: StatusRelayReaderCredentials?
    func loadReader() throws -> StatusRelayReaderCredentials? { value }
    func saveReader(_ credentials: StatusRelayReaderCredentials) throws { value = credentials }
    func deleteReader() throws { value = nil }
}

// Immutable, URL-selected fixtures: no mutable global handlers shared by parallel tests.
private final class RelayFixtureProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let url = request.url else { return }
        #expect(request.httpMethod == "GET")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-reader")
        let host = url.host ?? ""
        if host == "offline.example" || host == "timeout.example" || host == "cancel.example" {
            let code: URLError.Code = host == "offline.example" ? .notConnectedToInternet : (host == "timeout.example" ? .timedOut : .cancelled)
            client?.urlProtocol(self, didFailWithError: URLError(code))
            return
        }
        let empty = host == "empty.example"
        let denied = host == "denied.example"
        let body = empty ? #"{"error":{"code":"snapshotNotFound","message":"Empty"}}"# :
            denied ? #"{"error":{"code":"unauthorized","message":"Denied"}}"# :
            host == "malformed.example" ? "not json" :
            #"{"protocolVersion":1,"sequence":42,"nonce":"AwMDAwMDAwMDAwMD","ciphertext":"XtzQYDJNMyMsJTEvgjiRLtcNzM3G8PkRRrDu34S1JcrSwhNW-pzAYvS9eCmvvII2QlBSsKu4D0ccGBuTDhy4WNvBTgjLxwB0LafDpe6m_QPNmvlFOlN-ULB4xKEyQdYIufoRJhKAKfU"}"#
        let response = HTTPURLResponse(url: url, statusCode: empty ? 404 : (denied ? 401 : 200), httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@Suite("Reader network contract")
@MainActor
struct ReaderNetworkTests {
    @Test(arguments: ["valid", "empty", "malformed", "denied", "offline", "timeout", "cancel"])
    func readerResponses(variant: String) async throws {
        let configuration = try StatusRelayConfiguration("https://\(variant).example")
        let store = ReaderCredentialFixture()
        store.value = StatusRelayReaderCredentials(protocolVersion: 1, relayOrigin: configuration.origin,
            channelID: UUID(uuidString: "018f47a0-7b52-4c15-9e55-5f0f266b7440")!,
            readerToken: "fixture-reader", encryptionKey: Data(repeating: 7, count: 32))
        let sessionConfiguration = URLSessionConfiguration.ephemeral
        sessionConfiguration.protocolClasses = [RelayFixtureProtocol.self]
        let session = URLSession(configuration: sessionConfiguration)
        defer { session.invalidateAndCancel() }
        let reader = CodexRelayReaderRepository(configuration: configuration, session: session, credentialStore: store, isWidget: true)
        do {
            let result = try await reader.fetchStatus()
            #expect(variant == "valid" || variant == "empty")
            if variant == "valid" {
                #expect(result?.remainingPercentage == 53)
                #expect(result?.relayChannelID == store.value?.channelID)
            } else { #expect(result == nil) }
        } catch {
            switch variant {
            case "cancel": #expect(error is CancellationError)
            case "malformed", "denied", "offline", "timeout": #expect(error is CodexRelayError)
            default: Issue.record(error)
            }
        }
    }
}
