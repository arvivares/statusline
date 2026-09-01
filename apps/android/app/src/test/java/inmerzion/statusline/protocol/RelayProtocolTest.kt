package inmerzion.statusline.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.File

class RelayProtocolTest {
    @Test
    fun parsesTheNormativePairingShape() {
        val token = Base64Url.encode(ByteArray(32) { 9 })
        val key = Base64Url.encode(ByteArray(32) { 7 })
        val pairing = RelayProtocol.parsePairing(
            "statusline://pair?v=1&channel=$CHANNEL&pairing=$token&key=$key",
        )

        assertEquals(CHANNEL, pairing.channelId)
        assertEquals(token, pairing.pairingToken)
        assertArrayEquals(ByteArray(32) { 7 }, pairing.encryptionKey)
    }

    @Test
    fun rejectsDuplicateFieldsAndNonCanonicalChannels() {
        val token = Base64Url.encode(ByteArray(32) { 9 })
        val duplicate =
            "statusline://pair?v=1&channel=$CHANNEL&pairing=$token&pairing=$token"
        assertEquals(
            FailureKind.INVALID_PAIRING,
            assertThrows(StatuslineException::class.java) {
                RelayProtocol.parsePairing(duplicate)
            }.kind,
        )

        val uppercase =
            "statusline://pair?v=1&channel=${CHANNEL.uppercase()}&pairing=$token&key=$token"
        assertEquals(
            FailureKind.INVALID_PAIRING,
            assertThrows(StatuslineException::class.java) {
                RelayProtocol.parsePairing(uppercase)
            }.kind,
        )
    }

    @Test
    fun decryptsTheSharedAesGcmFixture() {
        val fixture = File(requireNotNull(System.getProperty("statusline.fixture"))).readText()
        val channel = fixture.stringField("channelId")
        val envelope = RelayEnvelope(
            protocolVersion = fixture.numberField("protocolVersion").toInt(),
            sequence = fixture.numberField("sequence"),
            nonce = fixture.stringField("nonce"),
            ciphertext = fixture.stringField("ciphertextAndTag"),
        )

        val plaintext = RelayProtocol.decrypt(
            envelope = envelope,
            channelId = channel,
            encryptionKey = Base64Url.decode(fixture.stringField("key")),
        )

        assertEquals(
            "{\"schemaVersion\":1,\"remainingPercentage\":53," +
                "\"resetAt\":2000500000,\"updatedAt\":1900000000}",
            plaintext.decodeToString(),
        )
    }

    @Test
    fun rejectsAnEnvelopeWithATamperedAuthenticationTag() {
        val fixture = File(requireNotNull(System.getProperty("statusline.fixture"))).readText()
        val ciphertext = Base64Url.decode(fixture.stringField("ciphertextAndTag"))
        ciphertext[ciphertext.lastIndex] = (ciphertext.last().toInt() xor 1).toByte()
        val envelope = RelayEnvelope(
            protocolVersion = 1,
            sequence = 42,
            nonce = fixture.stringField("nonce"),
            ciphertext = Base64Url.encode(ciphertext),
        )

        assertEquals(
            FailureKind.INVALID_SNAPSHOT,
            assertThrows(StatuslineException::class.java) {
                RelayProtocol.decrypt(
                    envelope,
                    fixture.stringField("channelId"),
                    Base64Url.decode(fixture.stringField("key")),
                )
            }.kind,
        )
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
