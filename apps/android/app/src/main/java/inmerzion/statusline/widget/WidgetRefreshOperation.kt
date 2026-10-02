package inmerzion.statusline.widget

import inmerzion.statusline.protocol.FailureKind
import inmerzion.statusline.protocol.StatuslineException

internal enum class WidgetRefreshOutcome { UPDATED, SKIPPED, RETRY }

internal object WidgetRefreshPolicy {
    const val INTERVAL_MINUTES = 30L
    const val MAX_RETRIES = 3

    fun shouldSync(hasWidgets: Boolean, isPaired: Boolean, isDemo: Boolean): Boolean =
        hasWidgets && isPaired && !isDemo

    fun shouldRetry(kind: FailureKind?, runAttemptCount: Int): Boolean =
        runAttemptCount < MAX_RETRIES && kind in setOf(
            FailureKind.NETWORK, FailureKind.TIMEOUT, FailureKind.RATE_LIMITED,
        )
}

/** Shared by the real Worker and deterministic tests; no credential enters WorkManager's database. */
internal class WidgetRefreshOperation(
    private val hasWidgets: () -> Boolean,
    private val isPaired: () -> Boolean,
    private val isDemo: () -> Boolean,
    private val refresh: () -> Unit,
    private val render: () -> Unit,
) {
    fun run(runAttemptCount: Int): WidgetRefreshOutcome = try {
        if (!hasWidgets() || !isPaired() || isDemo()) {
            WidgetRefreshOutcome.SKIPPED
        } else {
            refresh()
            render()
            WidgetRefreshOutcome.UPDATED
        }
    } catch (error: Exception) {
        // Keep the last verified cache; never log response bodies, tokens or raw exceptions.
        if (WidgetRefreshPolicy.shouldRetry((error as? StatuslineException)?.kind, runAttemptCount)) {
            WidgetRefreshOutcome.RETRY
        } else {
            WidgetRefreshOutcome.SKIPPED
        }
    }
}
