package inmerzion.statusline.protocol

import org.json.JSONObject
import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.Locale
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

object RelayProtocol {
    const val VERSION = 1
    const val SNAPSHOT_AAD_PREFIX = "statusline.snapshot.v1|"
    private val channelPattern = Regex(
        "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    )
    private val secretPattern = Regex("^[A-Za-z0-9_-]{43}$")

    fun parsePairing(rawValue: String): RelayPairing {
        try {
            val uri = URI(rawValue.trim())
            require(uri.scheme == "statusline" && uri.host == "pair")
            require(uri.userInfo == null && uri.fragment == null)

            val fields = requireNotNull(uri.rawQuery).split("&")
            require(fields.size == 4)
            val values = linkedMapOf<String, String>()
            fields.forEach { field ->
                val parts = field.split("=", limit = 2)
                require(parts.size == 2)
                val name = URLDecoder.decode(parts[0], StandardCharsets.UTF_8.name())
                val value = URLDecoder.decode(parts[1], StandardCharsets.UTF_8.name())
                require(values.put(name, value) == null)
            }

            require(values.keys == setOf("v", "channel", "pairing", "key"))
            require(values["v"] == VERSION.toString())
            val channel = requireNotNull(values["channel"])
            val pairingToken = requireNotNull(values["pairing"])
            val encodedKey = requireNotNull(values["key"])
            require(channelPattern.matches(channel))
            require(secretPattern.matches(pairingToken))
            require(Base64Url.decode(pairingToken).size == 32)
            require(secretPattern.matches(encodedKey))
            val encryptionKey = Base64Url.decode(encodedKey)
            require(encryptionKey.size == 32)

            return RelayPairing(channel, pairingToken, encryptionKey)
        } catch (error: StatuslineException) {
            throw error
        } catch (error: Exception) {
            throw StatuslineException(
                FailureKind.INVALID_PAIRING,
                "El QR o vínculo de emparejamiento no es válido.",
                error,
            )
        }
    }

    fun validateReaderToken(value: String): Boolean =
        secretPattern.matches(value) && runCatching { Base64Url.decode(value).size == 32 }
            .getOrDefault(false)

    fun validateChannelId(value: String): Boolean = channelPattern.matches(value)

    fun decrypt(
        envelope: RelayEnvelope,
        channelId: String,
        encryptionKey: ByteArray,
    ): ByteArray {
        if (
            envelope.protocolVersion != VERSION ||
            envelope.sequence <= 0 ||
            !validateChannelId(channelId) ||
            encryptionKey.size != 32
        ) {
            throw invalidSnapshot()
        }

        try {
            val nonce = Base64Url.decode(envelope.nonce)
            val ciphertextAndTag = Base64Url.decode(envelope.ciphertext)
            require(nonce.size == 12 && ciphertextAndTag.size > 16)

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                SecretKeySpec(encryptionKey, "AES"),
                GCMParameterSpec(128, nonce),
            )
            val aad = SNAPSHOT_AAD_PREFIX + channelId.lowercase(Locale.ROOT)
            cipher.updateAAD(aad.toByteArray(StandardCharsets.UTF_8))
            return cipher.doFinal(ciphertextAndTag)
        } catch (error: AEADBadTagException) {
            throw StatuslineException(
                FailureKind.INVALID_SNAPSHOT,
                "No se pudo autenticar el snapshot cifrado.",
                error,
            )
        } catch (error: StatuslineException) {
            throw error
        } catch (error: Exception) {
            throw invalidSnapshot(error)
        }
    }

    fun decodeStatus(
        envelope: RelayEnvelope,
        credentials: ReaderCredentials,
    ): UsageStatus {
        val plaintext = decrypt(
            envelope = envelope,
            channelId = credentials.channelId,
            encryptionKey = credentials.encryptionKey,
        )
        try {
            val body = JSONObject(String(plaintext, StandardCharsets.UTF_8))
            require(body.getInt("schemaVersion") == 1)
            val remaining = body.getInt("remainingPercentage")
            val resetAt = body.getLong("resetAt")
            val updatedAt = body.getLong("updatedAt")
            require(remaining in 0..100 && resetAt > 0 && updatedAt > 0)
            return UsageStatus(remaining, resetAt, updatedAt)
        } catch (error: Exception) {
            throw invalidSnapshot(error)
        }
    }

    private fun invalidSnapshot(cause: Throwable? = null) = StatuslineException(
        FailureKind.INVALID_SNAPSHOT,
        "El snapshot recibido no tiene un formato válido.",
        cause,
    )
}
