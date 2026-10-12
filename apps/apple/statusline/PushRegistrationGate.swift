import Foundation

/// Coalesces registration requests and prevents an old timeout/callback from
/// completing a later attempt. All state belongs to the UI registration actor.
@MainActor
final class PushRegistrationGate<Value: Sendable> {
    private(set) var attempt: UUID?
    private var waiters: [CheckedContinuation<Value, Error>] = []
    private var timeoutTask: Task<Void, Never>?
    private let sleep: (Duration) async throws -> Void

    init(sleep: @escaping (Duration) async throws -> Void = { try await Task.sleep(for: $0) }) {
        self.sleep = sleep
    }

    func wait(timeout: Duration, start: (UUID) -> Void) async throws -> Value {
        try Task.checkCancellation()
        return try await withCheckedThrowingContinuation { continuation in
            waiters.append(continuation)
            guard attempt == nil else { return }
            let id = UUID()
            attempt = id
            timeoutTask = Task { [weak self, sleep] in
                do { try await sleep(timeout) } catch { return }
                self?.finish(id, with: .failure(ResetPushError.installationIDUnavailable))
            }
            start(id)
        }
    }

    func finish(_ id: UUID, with result: Result<Value, Error>) {
        guard attempt == id else { return }
        attempt = nil
        timeoutTask?.cancel()
        timeoutTask = nil
        let pending = waiters
        waiters.removeAll()
        for waiter in pending { waiter.resume(with: result) }
    }

    func cancel() {
        guard let attempt else { return }
        finish(attempt, with: .failure(CancellationError()))
    }
}
