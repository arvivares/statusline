package inmerzion.statusline.data

import inmerzion.statusline.protocol.FailureKind
import inmerzion.statusline.protocol.StatuslineException

/** Network I/O stays outside this lock; pairing/mode changes invalidate pending responses. */
internal class SnapshotRefreshCoordinator {
    private val lock = Any()
    private var revision = 0L

    fun <T> snapshot(read: () -> T): Pair<Long, T> = synchronized(lock) { revision to read() }

    fun <T> invalidate(change: () -> T): T = synchronized(lock) {
        revision += 1
        change()
    }

    fun <T> commit(expectedRevision: Long, write: () -> T): T = synchronized(lock) {
        if (revision != expectedRevision) {
            throw StatuslineException(FailureKind.NOT_PAIRED, "The pairing or local mode changed during refresh.")
        }
        write()
    }
}
