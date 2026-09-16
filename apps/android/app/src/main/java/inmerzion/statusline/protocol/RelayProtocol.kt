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
    const val SERVICES_KIND = "services-v1"
    const val SERVICES_ACCEPT = "application/vnd.statusline.services-v1+json"
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
            encryptionKey.size != 32 ||
            envelope.payloadKind !in listOf(null, SERVICES_KIND)
        ) {
            throw invalidSnapshot()
        }

        try {
            val nonce = Base64Url.decode(envelope.nonce)
            val ciphertextAndTag = Base64Url.decode(envelope.ciphertext)
            require(nonce.size == 12 && ciphertextAndTag.size > 16)
            require(ciphertextAndTag.size <= 4_096 + 16)

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                SecretKeySpec(encryptionKey, "AES"),
                GCMParameterSpec(128, nonce),
            )
            val aad = if (envelope.payloadKind == SERVICES_KIND) {
                "statusline.services.v1|${channelId.lowercase(Locale.ROOT)}|${envelope.sequence}"
            } else SNAPSHOT_AAD_PREFIX + channelId.lowercase(Locale.ROOT)
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
        if (envelope.payloadKind != null) throw invalidSnapshot()
        val plaintext = decrypt(
            envelope = envelope,
            channelId = credentials.channelId,
            encryptionKey = credentials.encryptionKey,
        )
        try {
            val body = JSONObject(String(plaintext, StandardCharsets.UTF_8))
            require(body.strictLong("schemaVersion") == 1L)
            val remaining = body.strictLong("remainingPercentage")
            val resetAt = body.strictLong("resetAt")
            val updatedAt = body.strictLong("updatedAt")
            require(remaining in 0..100 && validTimestamp(resetAt) && validTimestamp(updatedAt))
            return UsageStatus(remaining.toInt(), resetAt, updatedAt)
        } catch (error: Exception) {
            throw invalidSnapshot(error)
        }
    }

    fun decodeServices(envelope: RelayEnvelope, credentials: ReaderCredentials): AgentServicesSnapshot {
        if (envelope.payloadKind == null) return AgentServicesSnapshot.fromLegacy(
            decodeStatus(envelope, credentials), credentials.channelId, envelope.sequence,
        )
        return decodeServicesPayload(decrypt(envelope, credentials.channelId, credentials.encryptionKey),
            credentials.channelId, envelope.sequence)
    }

    internal fun decodeServicesPayload(data: ByteArray, channelId: String?, sequence: Long): AgentServicesSnapshot {
        try {
            require(data.size <= 4_096)
            val body = JSONObject(data.decodeToString(throwOnInvalidSequence = true))
            require(body.strictLong("schemaVersion") == 1L)
            val updatedAt = body.strictLong("updatedAt")
            require(validTimestamp(updatedAt))
            val values = body.getJSONArray("providers")
            require(values.length() <= 16)
            val seen = mutableSetOf<String>()
            val providers = buildList {
                for (index in 0 until values.length()) {
                    val value = values.getJSONObject(index)
                    val wireId = value.get("id") as? String ?: error("Invalid provider ID")
                    require(Regex("^[a-z0-9-]{1,64}$").matches(wireId) && seen.add(wireId))
                    // Do not impose today's known-provider schema on future adapters.
                    val id = AgentProviderId.fromWire(wireId) ?: continue
                    val sampleTime = value.strictLong("updatedAt")
                    require(validTimestamp(sampleTime) && sampleTime <= updatedAt)
                    val status = value.get("status") as? String
                    require(status == "ready" || status == "unavailable")
                    fun window(key: String): AgentQuotaWindow? {
                        if (value.isNull(key)) return null
                        val raw = value.getJSONObject(key)
                        val remaining = raw.strictLong("remainingPercentage")
                        val reset = raw.strictLong("resetAt")
                        val minutes = raw.strictLong("windowMinutes")
                        require(remaining in 0..100 && validTimestamp(reset) && minutes in 1..11_520)
                        require(if (key == "weekly") minutes in 8_640..11_520 else minutes < 8_640)
                        if (id == AgentProviderId.ANTIGRAVITY) require(minutes == if (key == "weekly") 10_080L else 300L)
                        return AgentQuotaWindow(remaining.toInt(), reset, minutes.toInt())
                    }
                    val weekly = window("weekly")
                    val short = window("shortWindow")
                    require(if (status == "ready") weekly != null || short != null else weekly == null && short == null)
                    add(AgentProviderReading(id, requireNotNull(status), sampleTime, weekly, short))
                }
            }
            return AgentServicesSnapshot(providers, updatedAt, channelId, sequence)
        } catch (error: Exception) {
            throw invalidSnapshot(error)
        }
    }

    internal fun JSONObject.strictLong(key: String): Long = when (val value = get(key)) {
        is Int -> value.toLong()
        is Long -> value
        else -> throw invalidSnapshot()
    }

    private fun validTimestamp(value: Long) = value in 1..253_402_300_799L

    private fun invalidSnapshot(cause: Throwable? = null) = StatuslineException(
        FailureKind.INVALID_SNAPSHOT,
        "El snapshot recibido no tiene un formato válido.",
        cause,
    )
}
