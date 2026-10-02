package inmerzion.statusline.data

import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PushRegistrationCoordinatorTest {
    @Test fun queuedRefreshReadsTheLatestCategories() {
        val coordinator = PushRegistrationCoordinator()
        val preferences = AtomicReference(PushPreferences(resetCredits = true))
        val executor = Executors.newSingleThreadExecutor()
        val callbackReady = CountDownLatch(1)
        try {
            val callback = coordinator.serializeRemote {
                val pending = executor.submit<PushPreferences> {
                    callbackReady.countDown()
                    coordinator.serializeRemote { coordinator.snapshot { preferences.get() }.second }
                }
                assertTrue(callbackReady.await(5, TimeUnit.SECONDS))
                val revision = coordinator.snapshot { preferences.get() }.first
                assertTrue(coordinator.commit(revision) {
                    preferences.set(PushPreferences(quotaAlerts = true))
                })
                pending
            }
            assertEquals(PushPreferences(quotaAlerts = true), callback.get(5, TimeUnit.SECONDS))
        } finally {
            executor.shutdownNow()
        }
    }

    @Test fun optOutDoesNotWaitForNetworkOrAllowAnOldReplyToRestoreConsent() {
        val coordinator = PushRegistrationCoordinator()
        val preferences = AtomicReference(PushPreferences(resetCredits = true))
        val requestStarted = CountDownLatch(1)
        val releaseRequest = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val registration = executor.submit<Boolean> {
                coordinator.serializeRemote {
                    val revision = coordinator.snapshot { preferences.get() }.first
                    requestStarted.countDown()
                    assertTrue(releaseRequest.await(5, TimeUnit.SECONDS))
                    coordinator.commit(revision) { preferences.set(PushPreferences(quotaAlerts = true)) }
                }
            }
            assertTrue(requestStarted.await(5, TimeUnit.SECONDS))
            executor.submit {
                coordinator.invalidate { preferences.set(PushPreferences()) }
            }.get(5, TimeUnit.SECONDS)
            assertFalse(preferences.get().enabled)
            releaseRequest.countDown()
            assertFalse(registration.get(5, TimeUnit.SECONDS))
            assertFalse(preferences.get().enabled)
        } finally {
            releaseRequest.countDown()
            executor.shutdownNow()
        }
    }
}
