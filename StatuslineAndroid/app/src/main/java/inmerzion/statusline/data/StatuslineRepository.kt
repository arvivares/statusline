package inmerzion.statusline.data

import android.content.Context
import inmerzion.statusline.BuildConfig
import inmerzion.statusline.protocol.FailureKind
import inmerzion.statusline.protocol.ReaderCredentials
import inmerzion.statusline.protocol.RelayConfiguration
import inmerzion.statusline.protocol.RelayProtocol
import inmerzion.statusline.protocol.StatuslineException
import inmerzion.statusline.protocol.UsageStatus
import inmerzion.statusline.security.SecureCredentialStore

class StatuslineRepository(context: Context) {
    private val configuration = RelayConfiguration.parse(
        rawValue = BuildConfig.RELAY_BASE_URL,
        allowLoopbackHttp = BuildConfig.DEBUG,
    )
    private val credentials = SecureCredentialStore(context)
    private val cache = StatusCache(context)
    private val client = RelayHttpClient(configuration)

    val endpoint: String
        get() = configuration.origin

    fun cachedStatus(): UsageStatus? = cache.load()

    fun isPaired(): Boolean = credentials.load() != null

    fun enableDemo(): UsageStatus = DemoStatusFactory.create().also(cache::save)

    fun disableDemo() {
        if (cache.load()?.isDemo == true) {
            cache.clear()
        }
    }

    fun pair(rawValue: String): UsageStatus? {
        val pairing = RelayProtocol.parsePairing(rawValue)
        val readerToken = client.claim(pairing.channelId, pairing.pairingToken)
        val readerCredentials = ReaderCredentials(
            protocolVersion = RelayProtocol.VERSION,
            relayOrigin = configuration.origin,
            channelId = pairing.channelId,
            readerToken = readerToken,
            encryptionKey = pairing.encryptionKey,
        )
        credentials.save(readerCredentials)
        return fetch(readerCredentials)
    }

    fun refresh(): UsageStatus? {
        val readerCredentials = credentials.load() ?: throw StatuslineException(
            FailureKind.NOT_PAIRED,
            "Empareja primero este dispositivo con Statusline Companion.",
        )
        if (readerCredentials.relayOrigin != configuration.origin) {
            throw StatuslineException(
                FailureKind.ENDPOINT_MISMATCH,
                "El vínculo guardado pertenece a otro endpoint de Statusline.",
            )
        }
        return fetch(readerCredentials)
    }

    fun disconnect() {
        credentials.clear()
        cache.clear()
    }

    private fun fetch(readerCredentials: ReaderCredentials): UsageStatus? {
        val envelope = client.fetchSnapshot(
            readerCredentials.channelId,
            readerCredentials.readerToken,
        )
        if (envelope == null) {
            cache.clear()
            return null
        }
        val status = RelayProtocol.decodeStatus(envelope, readerCredentials)
        cache.save(status)
        return status
    }
}
