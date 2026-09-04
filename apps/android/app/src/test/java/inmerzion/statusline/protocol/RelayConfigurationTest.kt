package inmerzion.statusline.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class RelayConfigurationTest {
    @Test
    fun normalizesAnHttpsOriginAndBuildsEndpoints() {
        val configuration = RelayConfiguration.parse(
            "https://relay.example.com/",
            allowLoopbackHttp = false,
        )

        assertEquals("https://relay.example.com", configuration.origin)
        assertEquals(
            "https://relay.example.com/v1/channels",
            configuration.endpoint("v1", "channels").toString(),
        )
    }

    @Test
    fun permitsHttpOnlyForDebugLoopback() {
        assertEquals(
            "http://127.0.0.1:8787",
            RelayConfiguration.parse(
                "http://127.0.0.1:8787",
                allowLoopbackHttp = true,
            ).origin,
        )
        assertThrows(StatuslineException::class.java) {
            RelayConfiguration.parse(
                "http://relay.example.com",
                allowLoopbackHttp = true,
            )
        }
        assertThrows(StatuslineException::class.java) {
            RelayConfiguration.parse(
                "http://127.0.0.1:8787",
                allowLoopbackHttp = false,
            )
        }
    }

    @Test
    fun rejectsEmbeddedCredentialsQueriesAndPaths() {
        listOf(
            "https://reader:secret@relay.example.com",
            "https://relay.example.com?token=secret",
            "https://relay.example.com/v1",
        ).forEach { value ->
            assertThrows(StatuslineException::class.java) {
                RelayConfiguration.parse(value, allowLoopbackHttp = false)
            }
        }
    }
}
