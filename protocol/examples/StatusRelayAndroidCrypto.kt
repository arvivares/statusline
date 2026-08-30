package statusline.protocol

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.Locale
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

data class StatusRelayPairing(
    val channelId: String,
    val pairingToken: String,
    val encryptionKey: ByteArray,
)

data class StatusRelayEnvelope(
    val protocolVersion: Int,
    val sequence: Long,
    val nonce: String,
    val ciphertext: String,
)

object StatusRelayAndroidCrypto {
    private val channelPattern = Regex(
        "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    )
    private val secretPattern = Regex("^[A-Za-z0-9_-]{43}$")

    fun parsePairing(raw: String): StatusRelayPairing {
        val uri = URI(raw)
        require(uri.scheme == "statusline" && uri.host == "pair")
        require(uri.userInfo == null && uri.fragment == null)
        val pairs = requireNotNull(uri.rawQuery).split("&")
        require(pairs.size == 4)
        val values = pairs.associate { field ->
            val parts = field.split("=", limit = 2)
            require(parts.size == 2)
            URLDecoder.decode(parts[0], "UTF-8") to
                URLDecoder.decode(parts[1], "UTF-8")
        }
        require(values.size == 4 && values.keys == setOf("v", "channel", "pairing", "key"))
        require(values["v"] == "1")
        val channel = requireNotNull(values["channel"])
        val pairing = requireNotNull(values["pairing"])
        val key = requireNotNull(values["key"])
        require(channelPattern.matches(channel))
        require(secretPattern.matches(pairing) && secretPattern.matches(key))
        val decodedKey = decodeBase64URL(key)
        require(decodedKey.size == 32)
        return StatusRelayPairing(channel, pairing, decodedKey)
    }

    fun decrypt(
        envelope: StatusRelayEnvelope,
        pairing: StatusRelayPairing,
    ): ByteArray {
        require(envelope.protocolVersion == 1 && envelope.sequence > 0)
        val nonce = decodeBase64URL(envelope.nonce)
        val encryptedAndTag = decodeBase64URL(envelope.ciphertext)
        require(nonce.size == 12 && encryptedAndTag.size > 16)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(pairing.encryptionKey, "AES"),
            GCMParameterSpec(128, nonce),
        )
        val aad = "statusline.snapshot.v1|" +
            pairing.channelId.lowercase(Locale.ROOT)
        cipher.updateAAD(aad.toByteArray(StandardCharsets.UTF_8))
        return cipher.doFinal(encryptedAndTag)
    }

    private fun decodeBase64URL(value: String): ByteArray =
        Base64.getUrlDecoder().decode(value)
}
