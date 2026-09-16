package inmerzion.statusline.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class AgentServicesTest {
    @Test
    fun decryptsTheSharedServicesFixtureAndUsesGeminisFiveHourWindow() {
        val fixture = File(requireNotNull(System.getProperty("statusline.services.fixture"))).readText()
        val credentials = ReaderCredentials(
            protocolVersion = 1,
            relayOrigin = "https://relay.example",
            channelId = fixture.stringField("channelId"),
            readerToken = Base64Url.encode(ByteArray(32) { 8 }),
            encryptionKey = Base64Url.decode(fixture.stringField("key")),
        )
        val envelope = RelayEnvelope(
            protocolVersion = fixture.numberField("protocolVersion").toInt(),
            sequence = fixture.numberField("sequence"),
            nonce = fixture.stringField("nonce"),
            ciphertext = fixture.stringField("ciphertextAndTag"),
            payloadKind = fixture.stringField("payloadKind"),
        )

        val snapshot = RelayProtocol.decodeServices(envelope, credentials)
        val gemini = snapshot.providers.first { it.id == AgentProviderId.ANTIGRAVITY }

        assertEquals(2, snapshot.providers.size)
        assertEquals(AgentQuotaPeriod.SHORT_WINDOW, gemini.defaultPeriod)
        assertEquals(73, gemini.primaryWindow?.remainingPercentage)
        assertEquals(300, gemini.primaryWindow?.windowMinutes)
        assertEquals(42, snapshot.sequence)
        assertFalse(snapshot.isLegacy)
    }

    @Test
    fun ignoresUnknownFutureProvidersWithoutInventingOneInTheUiModel() {
        val snapshot = RelayProtocol.decodeServicesPayload(
            """
            {"schemaVersion":1,"updatedAt":1900000000,"providers":[
              {"id":"codex","status":"ready","updatedAt":1900000000,
               "weekly":{"remainingPercentage":53,"resetAt":2000500000,"windowMinutes":10080},"shortWindow":null},
              {"id":"future-agent","status":"ready","updatedAt":1900000000,
               "weekly":{"remainingPercentage":20,"resetAt":2000500000,"windowMinutes":10080},"shortWindow":null}
            ]}
            """.trimIndent().toByteArray(),
            CHANNEL,
            7,
        )

        assertEquals(listOf(AgentProviderId.CODEX), snapshot.providers.map { it.id })
    }

    @Test
    fun rejectsInvalidAntigravityWindowAndKeepsEmptyInventoryAuthoritative() {
        val invalid = """
            {"schemaVersion":1,"updatedAt":1900000000,"providers":[
              {"id":"antigravity","status":"ready","updatedAt":1900000000,
               "weekly":null,"shortWindow":{"remainingPercentage":73,"resetAt":1900003600,"windowMinutes":301}}
            ]}
        """.trimIndent()
        assertEquals(
            FailureKind.INVALID_SNAPSHOT,
            assertThrows(StatuslineException::class.java) {
                RelayProtocol.decodeServicesPayload(invalid.toByteArray(), CHANNEL, 8)
            }.kind,
        )

        val empty = RelayProtocol.decodeServicesPayload(
            """{"schemaVersion":1,"updatedAt":1900000000,"providers":[]}""".toByteArray(),
            CHANNEL,
            9,
        )
        assertTrue(empty.providers.isEmpty())
        assertNull(empty.focusedProvider(null))
    }

    @Test
    fun legacyCodexProjectionDoesNotDowngradeNewerServices() {
        val legacy = AgentServicesSnapshot.fromLegacy(
            UsageStatus(53, 2_000_500_000, 1_900_000_000),
            CHANNEL,
            42,
        )
        val services = AgentServicesSnapshot(
            providers = listOf(
                AgentProviderReading(
                    AgentProviderId.CODEX,
                    "ready",
                    1_900_000_000,
                    weekly = AgentQuotaWindow(54, 2_000_500_000, 10_080),
                ),
            ),
            updatedAtEpochSeconds = 1_900_000_000,
            channelId = CHANNEL,
            sequence = 43,
        )

        assertTrue(services.supersedes(legacy))
        assertFalse(legacy.supersedes(services))
    }

    private fun String.stringField(name: String): String =
        requireNotNull(Regex("\\\"$name\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"").find(this))
            .groupValues[1]

    private fun String.numberField(name: String): Long =
        requireNotNull(Regex("\\\"$name\\\"\\s*:\\s*(\\d+)").find(this))
            .groupValues[1]
            .toLong()

    private companion object {
        const val CHANNEL = "018f47a0-7b52-4c15-9e55-5f0f266b7440"
    }
}
