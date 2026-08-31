package inmerzion.statusline.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DemoStatusFactoryTest {
    @Test
    fun `creates an explicit local sample with a future reset`() {
        val now = 1_900_000_000L
        val status = DemoStatusFactory.create(now)

        assertEquals(53, status.remainingPercentage)
        assertEquals(now, status.updatedAtEpochSeconds)
        assertTrue(status.isDemo)
        assertTrue(status.resetAtEpochSeconds > now)
        assertTrue(status.resetAtEpochSeconds <= now + 4 * 24 * 60 * 60)
    }
}
