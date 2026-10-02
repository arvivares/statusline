package inmerzion.statusline.data

import inmerzion.statusline.protocol.FailureKind
import inmerzion.statusline.protocol.StatuslineException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class SnapshotRefreshCoordinatorTest {
    @Test fun aDisconnectedOrReplacedPairingRejectsAnInFlightResponse() {
        val coordinator = SnapshotRefreshCoordinator()
        var cached = "original"
        val (revision, _) = coordinator.snapshot { Unit }
        coordinator.invalidate { cached = "cleared or new channel" }
        val error = assertThrows(StatuslineException::class.java) {
            coordinator.commit(revision) { cached = "old response" }
        }
        assertEquals(FailureKind.NOT_PAIRED, error.kind)
        assertEquals("cleared or new channel", cached)
    }

    @Test fun simultaneousResponsesCompareAndWriteAtomicallyWithoutRewindingSequence() {
        val coordinator = SnapshotRefreshCoordinator()
        val (revision, _) = coordinator.snapshot { Unit }
        var sequence = 1
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val tasks = listOf(2, 3).map { incoming ->
                executor.submit {
                    ready.countDown()
                    assertTrue(start.await(5, TimeUnit.SECONDS))
                    coordinator.commit(revision) {
                        if (incoming > sequence) sequence = incoming
                    }
                }
            }
            assertTrue(ready.await(5, TimeUnit.SECONDS))
            start.countDown()
            tasks.forEach { it.get(5, TimeUnit.SECONDS) }
            assertEquals(3, sequence)
        } finally {
            start.countDown()
            executor.shutdownNow()
        }
    }

    @Test fun localDemoChangeInvalidatesNetworkResponsesButAnOrdinaryCommitDoesNot() {
        val coordinator = SnapshotRefreshCoordinator()
        val (revision, _) = coordinator.snapshot { Unit }
        coordinator.commit(revision) {}
        coordinator.commit(revision) {}
        coordinator.invalidate {}
        assertThrows(StatuslineException::class.java) { coordinator.commit(revision) {} }
        val (newRevision, _) = coordinator.snapshot { Unit }
        assertEquals("new response", coordinator.commit(newRevision) { "new response" })
    }
}
