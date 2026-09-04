package inmerzion.statusline.protocol

import java.net.URI
import java.util.Locale

data class RelayConfiguration(
    val baseUri: URI,
    val origin: String,
) {
    fun endpoint(vararg pathComponents: String): URI {
        require(pathComponents.all { it.isNotEmpty() && '/' !in it })
        return baseUri.resolve(pathComponents.joinToString("/", postfix = ""))
    }

    companion object {
        fun parse(rawValue: String, allowLoopbackHttp: Boolean): RelayConfiguration {
            try {
                val uri = URI(rawValue.trim())
                val scheme = uri.scheme?.lowercase(Locale.ROOT)
                val host = uri.host?.lowercase(Locale.ROOT)
                require(host != null)
                require(uri.userInfo == null && uri.query == null && uri.fragment == null)
                require(uri.path.isNullOrEmpty() || uri.path == "/")

                val isHttps = scheme == "https"
                val isLoopbackHttp = allowLoopbackHttp && scheme == "http" &&
                    host in setOf("localhost", "127.0.0.1", "::1")
                require(isHttps || isLoopbackHttp)

                val normalized = URI(scheme, null, host, uri.port, "/", null, null)
                return RelayConfiguration(
                    baseUri = normalized,
                    origin = normalized.toString().removeSuffix("/"),
                )
            } catch (error: Exception) {
                throw StatuslineException(
                    FailureKind.INVALID_CONFIGURATION,
                    "Este build no tiene configurado un endpoint HTTPS válido para el relay.",
                    error,
                )
            }
        }
    }
}
