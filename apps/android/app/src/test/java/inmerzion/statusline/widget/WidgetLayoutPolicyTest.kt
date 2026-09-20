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
