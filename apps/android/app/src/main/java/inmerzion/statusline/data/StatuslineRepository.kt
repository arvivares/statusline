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
import inmerzion.statusline.protocol.AgentProviderId
import inmerzion.statusline.protocol.AgentServicesSnapshot

class StatuslineRepository(context: Context) {
    private val configuration = RelayConfiguration.parse(
        rawValue = BuildConfig.RELAY_BASE_URL,
        allowLoopbackHttp = BuildConfig.DEBUG,
    )
    private val credentials = SecureCredentialStore(context)
    private val legacyCache = StatusCache(context)
    private val servicesCache = AgentServicesCache(context)
    private val client = RelayHttpClient(configuration)

    val endpoint: String
        get() = configuration.origin

    fun cachedServices(): AgentServicesSnapshot? {
        servicesCache.load()?.let { return it }
        if (servicesCache.isInitialized) return null

        // Migrate a pre-services Codex cache once. Keeping this fallback means
        // existing installs do not lose their last local reading on upgrade.
        val legacy = legacyCache.load() ?: return null
        return AgentServicesSnapshot.fromLegacy(legacy).also {
            runCatching { servicesCache.save(it) }
        }
    }

    fun cachedStatus(): UsageStatus? {
        if (servicesCache.isInitialized) {
            val snapshot = servicesCache.load() ?: return null
            return snapshot.focusedProvider(servicesCache.focusedProvider())?.usageStatus(snapshot.isDemo)
        }
        return legacyCache.load()
    }

    fun focusedProviderId(): AgentProviderId? = servicesCache.focusedProvider()

    fun selectProvider(provider: AgentProviderId) {
        servicesCache.focus(provider)
    }

    fun isPaired(): Boolean = credentials.load() != null

    fun enableDemo(): AgentServicesSnapshot {
        val status = DemoStatusFactory.create()
        val snapshot = AgentServicesSnapshot.fromLegacy(status).copy(isDemo = true)
        servicesCache.save(snapshot)
        legacyCache.save(status)
        return snapshot
    }

    fun disableDemo() {
        if (cachedServices()?.isDemo == true) {
            servicesCache.clear()
            legacyCache.clear()
        }
    }

    fun pair(rawValue: String): AgentServicesSnapshot? {
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
        // A newly claimed channel must never display the previous channel's
        // quota while waiting for its first encrypted publication.
        servicesCache.clear()
        legacyCache.clear()
        return fetch(readerCredentials)
    }

    fun refresh(): AgentServicesSnapshot? {
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
        servicesCache.clear()
        legacyCache.clear()
    }

    private fun fetch(readerCredentials: ReaderCredentials): AgentServicesSnapshot? {
        val envelope = client.fetchSnapshot(
            readerCredentials.channelId,
            readerCredentials.readerToken,
        )
        // A new channel can legitimately have no sample yet. Preserve an
        // existing same-channel sample during a refresh; a fresh pair has no
        // cache and therefore remains in WAITING_FOR_DESKTOP.
        if (envelope == null) return cachedServices()

        val incoming = RelayProtocol.decodeServices(envelope, readerCredentials)
        val current = servicesCache.load()
        if (current != null && current.channelId == incoming.channelId && !incoming.supersedes(current)) {
            return current
        }

        servicesCache.save(incoming)
        incoming.focusedProvider(servicesCache.focusedProvider())?.usageStatus(incoming.isDemo)?.let(legacyCache::save)
        return incoming
    }
}
