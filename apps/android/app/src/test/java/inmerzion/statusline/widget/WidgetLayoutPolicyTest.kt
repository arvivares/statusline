package inmerzion.statusline.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import inmerzion.statusline.protocol.AgentProviderId
import inmerzion.statusline.protocol.AgentProviderReading
import inmerzion.statusline.protocol.AgentQuotaWindow
import inmerzion.statusline.protocol.AgentServicesSnapshot

class WidgetLayoutPolicyTest {
    @Test
    fun `three services need room for two rows and respect system font scaling`() {
        assertEquals(WidgetLayoutSize.SMALL, WidgetLayoutPolicy.layoutSize(276f, 149f, 3))
        assertEquals(WidgetLayoutSize.MEDIUM, WidgetLayoutPolicy.layoutSize(276f, 150f, 3))
        assertEquals(WidgetLayoutSize.SMALL, WidgetLayoutPolicy.layoutSize(276f, 200f, 3, 1.5f))
        assertEquals(WidgetLayoutSize.MEDIUM, WidgetLayoutPolicy.layoutSize(276f, 225f, 3, 1.5f))
        assertEquals(WidgetLayoutSize.COMPACT, WidgetLayoutPolicy.layoutSize(276f, 50f, 3))
        assertEquals(40f, WidgetLayoutPolicy.numberSizeSp(WidgetLayoutSize.MEDIUM, 276f, 150f, true, 2))
    }

    @Test
    fun `three services show a Claude focus and two watchlist rows only in medium widgets`() {
        val snapshot = AgentServicesSnapshot(
            listOf(
                AgentProviderReading(AgentProviderId.CODEX, "ready", 1_900_000_000,
                    weekly = AgentQuotaWindow(53, 1_900_500_000, 10_080)),
                AgentProviderReading(AgentProviderId.ANTIGRAVITY, "ready", 1_900_000_000,
                    shortWindow = AgentQuotaWindow(73, 1_900_010_000, 300)),
                AgentProviderReading(AgentProviderId.CLAUDE, "ready", 1_899_999_940,
                    weekly = AgentQuotaWindow(81, 1_900_400_000, 10_080),
                    shortWindow = AgentQuotaWindow(32, 1_900_007_200, 300)),
            ), 1_900_000_000, sequence = 44,
        )
        val medium = WidgetPresentationPolicy.present(snapshot, AgentProviderId.CLAUDE, WidgetLayoutSize.MEDIUM)
        assertEquals("Claude Code · 5h", medium.focused?.heading)
        assertEquals(32, medium.focused?.remainingPercentage)
        assertEquals(listOf(AgentProviderId.CODEX, AgentProviderId.ANTIGRAVITY), medium.watchlist.map { it.id })
        for (size in listOf(WidgetLayoutSize.SMALL, WidgetLayoutSize.COMPACT)) {
            val result = WidgetPresentationPolicy.present(snapshot, AgentProviderId.CLAUDE, size)
            assertEquals("Claude Code · 5h", result.focused?.heading)
            assertEquals(0, result.watchlist.size)
        }
    }

    @Test
    fun `uses the one row composition below the tall height boundary`() {
        assertEquals(
            WidgetLayoutSize.COMPACT,
            WidgetLayoutPolicy.layoutSize(widthDp = 276f, heightDp = 50f),
        )
        assertEquals(
            WidgetLayoutSize.COMPACT,
            WidgetLayoutPolicy.layoutSize(widthDp = 360f, heightDp = 109.9f),
        )
    }

    @Test
    fun `switches between small and medium only for tall widgets`() {
        assertEquals(
            WidgetLayoutSize.SMALL,
            WidgetLayoutPolicy.layoutSize(widthDp = 269.9f, heightDp = 110f),
        )
        assertEquals(
            WidgetLayoutSize.MEDIUM,
            WidgetLayoutPolicy.layoutSize(widthDp = 270f, heightDp = 110f),
        )
        assertEquals(
            WidgetLayoutSize.MEDIUM,
            WidgetLayoutPolicy.layoutSize(widthDp = 360f, heightDp = 200f),
        )
    }

    @Test
    fun `keeps a white terminal stripe including exact percentages`() {
        assertEquals(26, WidgetLayoutPolicy.terminalStripe(53, 300f))
        assertEquals(24, WidgetLayoutPolicy.terminalStripe(50, 300f))
        assertEquals(49, WidgetLayoutPolicy.terminalStripe(100, 300f))
        assertEquals(0, WidgetLayoutPolicy.terminalStripe(1, 300f))
        assertEquals(50, WidgetLayoutPolicy.terminalStripe(120, 301f))
    }

    @Test
    fun `leaves empty readings unmarked and supports narrow widget stripes`() {
        assertEquals(-1, WidgetLayoutPolicy.terminalStripe(0, 300f))
        assertEquals(-1, WidgetLayoutPolicy.terminalStripe(-1, 300f))
        assertEquals(-1, WidgetLayoutPolicy.terminalStripe(53, 0f))
        assertEquals(26, WidgetLayoutPolicy.terminalStripe(53, 150f, 3f))
    }

    @Test
    fun `renders tool names for companion services and keeps antigravity on its five hour window`() {
        val snapshot = AgentServicesSnapshot(
            providers = listOf(
                AgentProviderReading(
                    id = AgentProviderId.CODEX,
                    status = "ready",
                    updatedAtEpochSeconds = 1_900_000_000,
                    weekly = AgentQuotaWindow(53, 2_000_500_000, 10_080),
                ),
                AgentProviderReading(
                    id = AgentProviderId.ANTIGRAVITY,
                    status = "ready",
                    updatedAtEpochSeconds = 1_900_000_000,
                    shortWindow = AgentQuotaWindow(73, 1_900_003_600, 300),
                ),
            ),
            updatedAtEpochSeconds = 1_900_000_000,
            channelId = "018f47a0-7b52-4c15-9e55-5f0f266b7440",
            sequence = 42,
        )

        val medium = WidgetPresentationPolicy.present(snapshot, AgentProviderId.CODEX, WidgetLayoutSize.MEDIUM)
        val small = WidgetPresentationPolicy.present(snapshot, AgentProviderId.CODEX, WidgetLayoutSize.SMALL)
        val antigravity = WidgetPresentationPolicy.present(snapshot, AgentProviderId.ANTIGRAVITY, WidgetLayoutSize.MEDIUM)

        assertEquals("Codex · Weekly", medium.focused?.heading)
        assertEquals(listOf(AgentProviderId.ANTIGRAVITY), medium.watchlist.map { it.id })
        assertEquals("Antigravity · 5h", medium.watchlist.single().heading)
        assertEquals(73, medium.watchlist.single().remainingPercentage)
        assertEquals(0, small.watchlist.size)
        assertEquals("Antigravity · 5h", antigravity.focused?.heading)
        assertEquals("Codex · Weekly", antigravity.watchlist.single().heading)
    }

    @Test
    fun `does not invent a provider for an explicit empty inventory`() {
        val presentation = WidgetPresentationPolicy.present(
            AgentServicesSnapshot(emptyList(), 1_900_000_000, sequence = 4),
            preferred = AgentProviderId.ANTIGRAVITY,
            size = WidgetLayoutSize.MEDIUM,
        )

        assertNull(presentation.focused)
        assertEquals(0, presentation.watchlist.size)
    }
}
