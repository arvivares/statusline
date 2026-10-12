package inmerzion.statusline.protocol

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class ClaudeMobileTest {
    private fun fixture(): JSONObject = JSONObject(
        File(requireNotNull(System.getProperty("statusline.claude.fixture"))).readText(),
    )
    private fun decode(wire: JSONObject, sequence: Long = 44): AgentServicesSnapshot =
        RelayProtocol.decodeServicesPayload(wire.toString().toByteArray(), CHANNEL, sequence)

    @Test fun threeProvidersKeepIdentityFocusAndSampleAge() {
        val snapshot = decode(fixture())
        assertEquals(listOf(AgentProviderId.CODEX, AgentProviderId.ANTIGRAVITY, AgentProviderId.CLAUDE), snapshot.providers.map { it.id })
        val claude = requireNotNull(snapshot.focusedProvider(AgentProviderId.CLAUDE))
        assertEquals("Claude Code", claude.id.displayName)
        assertEquals(AgentQuotaPeriod.SHORT_WINDOW, claude.defaultPeriod)
        assertEquals(32, claude.primaryWindow?.remainingPercentage)
        assertEquals(1_899_999_940L, claude.updatedAtEpochSeconds)
        assertNull(claude.resetCredits)
    }

    @Test fun optionalWindowsNeverInventMissingQuota() {
        for (variant in listOf("both", "short-only", "weekly-only", "unavailable", "removed")) {
            val wire = fixture()
            val claude = wire.getJSONArray("providers").getJSONObject(2)
            when (variant) {
                "short-only" -> claude.put("weekly", JSONObject.NULL)
                "weekly-only" -> claude.put("shortWindow", JSONObject.NULL)
                "unavailable" -> claude.put("status", "unavailable").put("weekly", JSONObject.NULL).put("shortWindow", JSONObject.NULL)
            }
            wire.put("providers", org.json.JSONArray(if (variant == "removed") emptyList<JSONObject>() else listOf(claude)))
            val snapshot = decode(wire)
            val focused = snapshot.focusedProvider(AgentProviderId.CLAUDE)
            if (variant == "removed") assertNull(focused)
            else {
                assertEquals(AgentProviderId.CLAUDE, focused?.id)
                assertEquals(if (variant == "weekly-only") 81 else if (variant == "unavailable") null else 32,
                    focused?.primaryWindow?.remainingPercentage)
                assertEquals(if (variant == "weekly-only") 10_080 else if (variant == "unavailable") null else 300,
                    focused?.primaryWindow?.windowMinutes)
            }
        }
    }

    @Test fun malformedKnownClaudeReadingsAreRejected() {
        for (variant in listOf("weekly", "shortWindow", "percentage", "fraction", "timestamp", "missing", "unavailable")) {
            val wire = fixture()
            val claude = wire.getJSONArray("providers").getJSONObject(2)
            when (variant) {
                "weekly", "shortWindow" -> claude.getJSONObject(variant).put("windowMinutes", if (variant == "weekly") 10_079 else 301)
                "percentage" -> claude.getJSONObject("shortWindow").put("remainingPercentage", 101)
                "fraction" -> claude.getJSONObject("shortWindow").put("remainingPercentage", 32.5)
                "timestamp" -> claude.put("updatedAt", 1_900_000_001L)
                "missing" -> claude.put("weekly", JSONObject.NULL).put("shortWindow", JSONObject.NULL)
                "unavailable" -> claude.put("status", "unavailable")
            }
            assertEquals(FailureKind.INVALID_SNAPSHOT,
                assertThrows(StatuslineException::class.java) { decode(wire) }.kind)
        }
    }

    @Test fun removalAndReplayDoNotResurrectClaude() {
        val old = decode(fixture())
        val wire = fixture()
        wire.getJSONArray("providers").remove(2)
        val current = decode(wire, 45)
        assertTrue(current.supersedes(old))
        assertFalse(old.supersedes(current))
        assertEquals(AgentProviderId.CODEX, current.focusedProvider(AgentProviderId.CLAUDE)?.id)
        assertFalse(current.providers.any { it.id == AgentProviderId.CLAUDE })
        assertFalse(current.copy(channelId = "another-channel").supersedes(old))
    }

    companion object { private const val CHANNEL = "018f47a0-7b52-4c15-9e55-5f0f266b7440" }
}
