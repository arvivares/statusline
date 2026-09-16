package inmerzion.statusline.data

import android.content.Context
import inmerzion.statusline.protocol.AgentProviderId
import inmerzion.statusline.protocol.AgentProviderReading
import inmerzion.statusline.protocol.AgentQuotaWindow
import inmerzion.statusline.protocol.AgentServicesSnapshot
import org.json.JSONObject

/**
 * Stores the public projection received from Companion.
 *
 * The relay payload is already end-to-end encrypted. This cache contains only
 * the decrypted quota projection and never credentials, tokens or encryption
 * keys. An explicit initialized marker is important: an empty services list is
 * authoritative and must not fall back to an old Codex-only cache after a
 * provider was removed.
 */
class AgentServicesCache(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    val isInitialized: Boolean
        get() = preferences.getBoolean(FIELD_INITIALIZED, false)

    fun load(): AgentServicesSnapshot? {
        if (!isInitialized) return null
        val encoded = preferences.getString(FIELD_SNAPSHOT, null) ?: return null
        return runCatching { decode(JSONObject(encoded)) }
            .getOrElse {
                clear()
                null
            }
    }

    fun save(snapshot: AgentServicesSnapshot) {
        require(snapshot.updatedAtEpochSeconds > 0)
        require(snapshot.providers.size <= MAX_PROVIDERS)
        val saved = preferences.edit()
            .putBoolean(FIELD_INITIALIZED, true)
            .putString(FIELD_SNAPSHOT, encode(snapshot).toString())
            .commit()
        check(saved) { "Could not persist the services cache." }
    }

    fun clear() {
        val cleared = preferences.edit()
            .clear()
            .putBoolean(FIELD_INITIALIZED, true)
            .commit()
        check(cleared) { "Could not clear the services cache." }
    }

    fun focusedProvider(): AgentProviderId? = preferences.getString(FIELD_FOCUS, null)
        ?.let { wireId -> AgentProviderId.fromWire(wireId) }

    fun focus(provider: AgentProviderId) {
        check(
            preferences.edit()
                .putString(FIELD_FOCUS, provider.wireId)
                .commit(),
        ) { "Could not persist the focused provider." }
    }

    private fun encode(snapshot: AgentServicesSnapshot): JSONObject = JSONObject()
        .put("updatedAt", snapshot.updatedAtEpochSeconds)
        .put("channelId", snapshot.channelId)
        .put("sequence", snapshot.sequence)
        .put("isDemo", snapshot.isDemo)
        .put("isLegacy", snapshot.isLegacy)
        .put("providers", snapshot.providers.map(::encode).let { values ->
            org.json.JSONArray(values)
        })

    private fun encode(provider: AgentProviderReading): JSONObject = JSONObject()
        .put("id", provider.id.wireId)
        .put("status", provider.status)
        .put("updatedAt", provider.updatedAtEpochSeconds)
        .put("weekly", provider.weekly?.let(::encode) ?: JSONObject.NULL)
        .put("shortWindow", provider.shortWindow?.let(::encode) ?: JSONObject.NULL)

    private fun encode(window: AgentQuotaWindow): JSONObject = JSONObject()
        .put("remainingPercentage", window.remainingPercentage)
        .put("resetAt", window.resetAtEpochSeconds)
        .put("windowMinutes", window.windowMinutes)

    private fun decode(body: JSONObject): AgentServicesSnapshot {
        val providersJson = body.getJSONArray("providers")
        require(providersJson.length() <= MAX_PROVIDERS)
        val providers = buildList {
            for (index in 0 until providersJson.length()) {
                val provider = providersJson.getJSONObject(index)
                val id = AgentProviderId.fromWire(provider.getString("id"))
                    ?: continue
                add(
                    AgentProviderReading(
                        id = id,
                        status = provider.getString("status"),
                        updatedAtEpochSeconds = provider.getLong("updatedAt"),
                        weekly = decodeWindow(provider, "weekly"),
                        shortWindow = decodeWindow(provider, "shortWindow"),
                    ),
                )
            }
        }
        return AgentServicesSnapshot(
            providers = providers,
            updatedAtEpochSeconds = body.getLong("updatedAt"),
            channelId = if (body.has("channelId") && !body.isNull("channelId")) {
                body.getString("channelId")
            } else {
                null
            },
            sequence = body.optLong("sequence", 0),
            isDemo = body.optBoolean("isDemo", false),
            isLegacy = body.optBoolean("isLegacy", false),
        )
    }

    private fun decodeWindow(provider: JSONObject, key: String): AgentQuotaWindow? {
        if (provider.isNull(key)) return null
        val window = provider.getJSONObject(key)
        return AgentQuotaWindow(
            remainingPercentage = window.getInt("remainingPercentage"),
            resetAtEpochSeconds = window.getLong("resetAt"),
            windowMinutes = window.getInt("windowMinutes"),
        )
    }

    private companion object {
        const val PREFERENCES = "inmerzion.statusline.services.v1"
        const val FIELD_INITIALIZED = "initialized"
        const val FIELD_SNAPSHOT = "snapshot"
        const val FIELD_FOCUS = "focusedProvider"
        const val MAX_PROVIDERS = 16
    }
}
