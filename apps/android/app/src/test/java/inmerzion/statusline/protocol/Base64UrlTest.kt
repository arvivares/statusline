package inmerzion.statusline.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class Base64UrlTest {
    @Test
    fun roundTripsBinaryDataWithoutPadding() {
        val source = ByteArray(256) { it.toByte() }
        val encoded = Base64Url.encode(source)

        assertArrayEquals(source, Base64Url.decode(encoded))
        assertEquals(false, encoded.contains('='))
    }

    @Test
    fun rejectsPaddingAndNonCanonicalTrailingBits() {
        assertThrows(IllegalArgumentException::class.java) {
            Base64Url.decode("AA==")
        }
        assertThrows(IllegalArgumentException::class.java) {
            Base64Url.decode("AB")
        }
    }
}
