package inmerzion.statusline.data

import inmerzion.statusline.protocol.FailureKind
import inmerzion.statusline.protocol.RelayConfiguration
import inmerzion.statusline.protocol.RelayEnvelope
import inmerzion.statusline.protocol.RelayProtocol
import inmerzion.statusline.protocol.StatuslineException
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.nio.charset.StandardCharsets

class RelayHttpClient(private val configuration: RelayConfiguration) {
    fun claim(channelId: String, pairingToken: String): String {
        val response = perform(
            method = "POST",
            path = arrayOf("v1", "channels", channelId, "claim"),
            token = pairingToken,
        )
        requireStatus(response, setOf(HttpURLConnection.HTTP_CREATED))
        try {
            val body = JSONObject(response.bodyAsText())
            require(body.getInt("protocolVersion") == RelayProtocol.VERSION)
            require(body.getLong("expiresAt") > 0)
            return body.getString("readerToken").also {
                require(RelayProtocol.validateReaderToken(it))
            }
        } catch (error: StatuslineException) {
            throw error
        } catch (error: Exception) {
            throw invalidResponse(error)
        }
    }

    fun fetchSnapshot(channelId: String, readerToken: String): RelayEnvelope? {
        val response = perform(
            method = "GET",
            path = arrayOf("v1", "channels", channelId, "snapshot"),
            token = readerToken,
        )
        if (response.statusCode == HttpURLConnection.HTTP_NOT_FOUND) {
            val errorCode = response.apiErrorCode()
            if (errorCode == "snapshotNotFound") return null
        }
        requireStatus(response, setOf(HttpURLConnection.HTTP_OK))
        try {
            val body = JSONObject(response.bodyAsText())
            return RelayEnvelope(
                protocolVersion = body.getInt("protocolVersion"),
                sequence = body.getLong("sequence"),
                nonce = body.getString("nonce"),
                ciphertext = body.getString("ciphertext"),
            )
        } catch (error: Exception) {
            throw invalidResponse(error)
        }
    }

    private fun perform(
        method: String,
        path: Array<String>,
        token: String,
    ): HttpResponse {
        val connection = configuration.endpoint(*path).toURL().openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.instanceFollowRedirects = false
            connection.useCaches = false
            connection.connectTimeout = CONNECT_TIMEOUT_MILLIS
            connection.readTimeout = READ_TIMEOUT_MILLIS
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Authorization", "Bearer $token")
            if (method == "POST") {
                connection.doOutput = true
                connection.setFixedLengthStreamingMode(0)
                connection.outputStream.use { }
            }

            val statusCode = connection.responseCode
            val declaredLength = connection.contentLength
            if (declaredLength > MAXIMUM_RESPONSE_BYTES) throw invalidResponse()
            val stream = if (statusCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream
            }
            return HttpResponse(statusCode, stream?.use(::readLimited) ?: byteArrayOf())
        } catch (error: StatuslineException) {
            throw error
        } catch (error: SocketTimeoutException) {
            throw StatuslineException(
                FailureKind.TIMEOUT,
                "El relay tardó demasiado en responder.",
                error,
            )
        } catch (error: IOException) {
            throw StatuslineException(
                FailureKind.NETWORK,
                "No se pudo conectar con el relay universal.",
                error,
            )
        } finally {
            connection.disconnect()
        }
    }

    private fun readLimited(stream: InputStream): ByteArray {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(4_096)
        while (true) {
            val count = stream.read(buffer)
            if (count < 0) break
            if (output.size() + count > MAXIMUM_RESPONSE_BYTES) throw invalidResponse()
            output.write(buffer, 0, count)
        }
        return output.toByteArray()
    }

    private fun requireStatus(response: HttpResponse, allowed: Set<Int>) {
        if (response.statusCode in allowed) return
        val body = runCatching { JSONObject(response.bodyAsText()).getJSONObject("error") }
            .getOrNull()
        val code = body?.optString("code").orEmpty()
        val fallback = body?.optString("message").orEmpty()
        throw serverFailure(code, fallback)
    }

    private fun serverFailure(code: String, fallback: String): StatuslineException = when (code) {
        "pairingExpired" -> StatuslineException(
            FailureKind.CHANNEL_EXPIRED,
            "El vínculo de emparejamiento caducó. Crea uno nuevo en el companion.",
        )
        "channelExpired", "channelNotFound" -> StatuslineException(
            FailureKind.CHANNEL_EXPIRED,
            "El canal ya no está disponible. Vuelve a emparejar este dispositivo.",
        )
        "rateLimited" -> StatuslineException(
            FailureKind.RATE_LIMITED,
            "El relay recibió demasiadas solicitudes. Inténtalo de nuevo en un minuto.",
        )
        else -> StatuslineException(
            FailureKind.UNKNOWN,
            fallback.ifBlank { "El relay devolvió una respuesta inesperada." },
        )
    }

    private fun invalidResponse(cause: Throwable? = null) = StatuslineException(
        FailureKind.INVALID_RESPONSE,
        "El relay universal devolvió una respuesta inesperada.",
        cause,
    )

    private data class HttpResponse(
        val statusCode: Int,
        val body: ByteArray,
    ) {
        fun bodyAsText(): String = String(body, StandardCharsets.UTF_8)

        fun apiErrorCode(): String? = runCatching {
            JSONObject(bodyAsText()).getJSONObject("error").getString("code")
        }.getOrNull()
    }

    private companion object {
        const val CONNECT_TIMEOUT_MILLIS = 20_000
        const val READ_TIMEOUT_MILLIS = 30_000
        const val MAXIMUM_RESPONSE_BYTES = 64 * 1_024
    }
}
