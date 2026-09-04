package inmerzion.statusline.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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
    fun `renders the same full and partial cells as the iOS meter`() {
        val cells = (0 until 20).map { index ->
            WidgetLayoutPolicy.segmentFill(index, 53)
        }

        assertEquals(10, cells.count { it == WidgetSegmentFill.FULL })
        assertEquals(1, cells.count { it == WidgetSegmentFill.PARTIAL })
        assertEquals(9, cells.count { it == WidgetSegmentFill.EMPTY })
        assertEquals(WidgetSegmentFill.PARTIAL, cells[10])
    }

    @Test
    fun `keeps zero and one hundred percent on exact segment boundaries`() {
        val empty = (0 until 20).map { WidgetLayoutPolicy.segmentFill(it, 0) }
        val full = (0 until 20).map { WidgetLayoutPolicy.segmentFill(it, 100) }

        assertTrue(empty.all { it == WidgetSegmentFill.EMPTY })
        assertTrue(full.all { it == WidgetSegmentFill.FULL })
    }
}
