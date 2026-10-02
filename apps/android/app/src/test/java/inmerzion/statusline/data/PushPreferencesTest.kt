package inmerzion.statusline.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PushPreferencesTest {
    @Test fun legacyCreditScopeDoesNotAutoSubscribeToQuota() {
        val legacy = PushPreferences(resetCredits = true)
        assertTrue(legacy.enabled)
        assertFalse(legacy.quotaAlerts)
        assertFalse(PushPreferences().enabled)
    }

    @Test fun changingOneCategoryPreservesTheOther() {
        listOf(false, true).forEach { credits ->
            listOf(false, true).forEach { quota ->
                val original = PushPreferences(credits, quota)
                listOf(false, true).forEach { enabled ->
                    val quotaChanged = original.withCategory(true, enabled)
                    assertEquals(credits, quotaChanged.resetCredits)
                    assertEquals(enabled, quotaChanged.quotaAlerts)
                    val creditsChanged = original.withCategory(false, enabled)
                    assertEquals(enabled, creditsChanged.resetCredits)
                    assertEquals(quota, creditsChanged.quotaAlerts)
                    assertEquals(credits || enabled, quotaChanged.enabled)
                    assertEquals(enabled || quota, creditsChanged.enabled)
                }
            }
        }
    }
}
