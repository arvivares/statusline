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
import java.util.UUID

class StatuslineRepository(context: Context) {
    private val configuration = RelayConfiguration.parse(
        rawValue = BuildConfig.RELAY_BASE_URL,
        allowLoopbackHttp = BuildConfig.DEBUG,
    )
    private val credentials = SecureCredentialStore(context)
    private val legacyCache = StatusCache(context)
    private val servicesCache = AgentServicesCache(context)
    private val client = RelayHttpClient(configuration)
    private val notificationPreferences = context.applicationContext.getSharedPreferences(
        RESET_PUSH_PREFERENCES,
        Context.MODE_PRIVATE,
    )

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

    fun resetNotificationsEnabled(): Boolean =
        notificationPreferences.getBoolean(RESET_PUSH_ENABLED, false)

    fun quotaNotificationsEnabled(): Boolean = notificationPreferences.getBoolean(QUOTA_PUSH_ENABLED, false)
    fun anyNotificationsEnabled(): Boolean = resetNotificationsEnabled() || quotaNotificationsEnabled()

    fun supportsResetPush(): Boolean = client.supportsResetPush()
    fun supportsQuotaAlerts(): Boolean = client.supportsResetPush("quota-alerts-v1")

    fun registerResetNotifications(fid: String, language: String,
                                   resetCredits: Boolean? = null,
                                   quotaAlerts: Boolean? = null) = PUSH_COORDINATOR.serializeRemote {
        // Resolve refresh preferences inside the serialized operation, not at
        // invocation time: a queued Firebase callback must use the latest choice.
        val (revision, registration) = PUSH_COORDINATOR.snapshot {
            val reader = credentials.load() ?: throw StatuslineException(
                FailureKind.NOT_PAIRED,
                "Pair this device with Statusline Companion first.",
            )
            val desired = PushPreferences(
                resetCredits ?: resetNotificationsEnabled(),
                quotaAlerts ?: quotaNotificationsEnabled(),
            )
            val deviceId = notificationPreferences.getString(RESET_PUSH_DEVICE_ID, null)
                ?.takeIf(RelayProtocol::validateChannelId)
                ?: UUID.randomUUID().toString().lowercase().also {
                    notificationPreferences.edit().putString(RESET_PUSH_DEVICE_ID, it).apply()
                }
            Triple(reader, desired, deviceId)
        }
        val (reader, desired, deviceId) = registration
        if (!desired.enabled) return@serializeRemote
        client.registerPushDevice(
            reader.channelId,
            reader.readerToken,
            deviceId,
            fid,
            if (language == "es") "es" else "en",
            desired.resetCredits,
            desired.quotaAlerts,
        )
        check(PUSH_COORDINATOR.commit(revision) {
            val current = credentials.load()
            check(current?.channelId == reader.channelId && current.readerToken == reader.readerToken)
            notificationPreferences.edit()
                .putBoolean(RESET_PUSH_ENABLED, desired.resetCredits)
                .putBoolean(QUOTA_PUSH_ENABLED, desired.quotaAlerts)
                .putBoolean(RESET_PUSH_REMOVE_PENDING, false)
                .apply()
        }) { "Notification preferences changed before registration completed." }
    }

    fun beginResetNotificationRemoval() = PUSH_COORDINATOR.invalidate {
        notificationPreferences.edit()
            .putBoolean(RESET_PUSH_ENABLED, false)
            .putBoolean(QUOTA_PUSH_ENABLED, false)
            .putBoolean(RESET_PUSH_REMOVE_PENDING, true)
            .apply()
    }

    fun unregisterResetNotifications() {
        beginResetNotificationRemoval()
        PUSH_COORDINATOR.serializeRemote {
            val (revision, reader) = PUSH_COORDINATOR.snapshot { credentials.load() }
            if (reader != null) {
                client.unregisterPushDevice(reader.channelId, reader.readerToken)
            }
            PUSH_COORDINATOR.commit(revision) {
                notificationPreferences.edit().putBoolean(RESET_PUSH_REMOVE_PENDING, false).apply()
            }
        }
    }

    fun retryResetNotificationRemoval() {
        if (notificationPreferences.getBoolean(RESET_PUSH_REMOVE_PENDING, false)) {
            runCatching { unregisterResetNotifications() }
        }
    }

    fun disconnect() = PUSH_COORDINATOR.serializeRemote {
        if (anyNotificationsEnabled() ||
            notificationPreferences.getBoolean(RESET_PUSH_REMOVE_PENDING, false)) {
            unregisterResetNotifications()
        }
        SNAPSHOT_COORDINATOR.invalidate {
            credentials.clear()
            servicesCache.clear()
            legacyCache.clear()
        }
    }

    fun enableDemo(): AgentServicesSnapshot = SNAPSHOT_COORDINATOR.invalidate {
        val status = DemoStatusFactory.create()
        val snapshot = AgentServicesSnapshot.fromLegacy(status).copy(isDemo = true)
        servicesCache.save(snapshot)
        legacyCache.save(status)
        snapshot
    }

    fun disableDemo() = SNAPSHOT_COORDINATOR.invalidate {
        if (cachedServices()?.isDemo == true) {
            servicesCache.clear()
            legacyCache.clear()
        }
    }

    fun pair(rawValue: String): AgentServicesSnapshot? = PUSH_COORDINATOR.serializeRemote {
        val pairing = RelayProtocol.parsePairing(rawValue)
        credentials.load()
            ?.takeIf { it.channelId != pairing.channelId && anyNotificationsEnabled() }
            ?.let { previous ->
                client.unregisterPushDevice(previous.channelId, previous.readerToken)
            }
        val readerToken = client.claim(pairing.channelId, pairing.pairingToken)
        val readerCredentials = ReaderCredentials(
            protocolVersion = RelayProtocol.VERSION,
            relayOrigin = configuration.origin,
            channelId = pairing.channelId,
            readerToken = readerToken,
            encryptionKey = pairing.encryptionKey,
        )
        val revision = SNAPSHOT_COORDINATOR.invalidate {
            credentials.save(readerCredentials)
            // A newly claimed channel must never display the previous channel's quota.
            servicesCache.clear()
            legacyCache.clear()
            SNAPSHOT_COORDINATOR.snapshot { Unit }.first
        }
        fetch(readerCredentials, revision)
    }

    fun refresh(): AgentServicesSnapshot? {
        val (revision, storedReader) = SNAPSHOT_COORDINATOR.snapshot { credentials.load() }
        val readerCredentials = storedReader ?: throw StatuslineException(
            FailureKind.NOT_PAIRED,
            "Empareja primero este dispositivo con Statusline Companion.",
        )
        if (readerCredentials.relayOrigin != configuration.origin) {
            throw StatuslineException(
                FailureKind.ENDPOINT_MISMATCH,
                "El vínculo guardado pertenece a otro endpoint de Statusline.",
            )
        }
        return fetch(readerCredentials, revision)
    }

    private fun fetch(readerCredentials: ReaderCredentials, revision: Long): AgentServicesSnapshot? {
        val envelope = client.fetchSnapshot(
            readerCredentials.channelId,
            readerCredentials.readerToken,
        )
        // A new channel can legitimately have no sample yet. Preserve an
        // existing same-channel sample during a refresh; a fresh pair has no
        // cache and therefore remains in WAITING_FOR_DESKTOP.
        if (envelope == null) return SNAPSHOT_COORDINATOR.commit(revision) { cachedServices() }

        val incoming = RelayProtocol.decodeServices(envelope, readerCredentials)
        return SNAPSHOT_COORDINATOR.commit(revision) {
            val current = servicesCache.load()
            if (current != null && current.channelId == incoming.channelId && !incoming.supersedes(current)) {
                return@commit current
            }

            servicesCache.save(incoming)
            incoming.focusedProvider(servicesCache.focusedProvider())?.usageStatus(incoming.isDemo)?.let(legacyCache::save)
            incoming
        }
    }

    private companion object {
        val PUSH_COORDINATOR = PushRegistrationCoordinator()
        val SNAPSHOT_COORDINATOR = SnapshotRefreshCoordinator()
        const val RESET_PUSH_PREFERENCES = "statusline.resetPush"
        const val RESET_PUSH_ENABLED = "enabled"
        const val QUOTA_PUSH_ENABLED = "quotaAlerts"
        const val RESET_PUSH_DEVICE_ID = "deviceId"
        const val RESET_PUSH_REMOVE_PENDING = "removePending"
    }
}
