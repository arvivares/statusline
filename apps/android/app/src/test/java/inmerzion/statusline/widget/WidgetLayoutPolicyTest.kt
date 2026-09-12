package inmerzion.statusline.widget

import org.junit.Assert.assertEquals
import org.junit.Test

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
}
