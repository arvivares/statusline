package inmerzion.statusline.data

/** Serialize relay writes across Repository instances, without blocking opt-out
 * on a network request. An invalidated response cannot restore consent. */
internal class PushRegistrationCoordinator {
    private val remoteLock = Any()
    private val stateLock = Any()
    private var revision = 0L

    fun <T> serializeRemote(block: () -> T): T = synchronized(remoteLock, block)

    fun <T> snapshot(block: () -> T): Pair<Long, T> = synchronized(stateLock) {
        revision to block()
    }

    fun invalidate(block: () -> Unit) = synchronized(stateLock) {
        revision += 1
        block()
    }

    fun commit(expectedRevision: Long, block: () -> Unit): Boolean = synchronized(stateLock) {
        if (revision != expectedRevision) {
            false
        } else {
            block()
            true
        }
    }
}
