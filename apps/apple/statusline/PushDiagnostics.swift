import Foundation
import OSLog

/// Only fixed stage/result labels and numeric error codes may cross into logs.
/// Never pass token, FID, URL, channel, userInfo or localizedDescription here.
enum PushDiagnostics {
    enum Stage: String { case preferences, permission, apns, firebase, relay, cleanup }
    enum Event: String { case started, ready, reused, cancelled, pending, failed }

    private static let logger = Logger(subsystem: "inmerzion.statusline", category: "PushRegistration")

    static func record(_ stage: Stage, _ event: Event) {
        logger.notice("push stage=\(stage.rawValue, privacy: .public) result=\(event.rawValue, privacy: .public)")
    }

    static func failure(_ stage: Stage, _ error: Error) {
        if error is CancellationError {
            record(stage, .cancelled)
            return
        }
        let code = (error as NSError).code
        logger.error("push stage=\(stage.rawValue, privacy: .public) result=failed code=\(code, privacy: .public)")
    }
}
