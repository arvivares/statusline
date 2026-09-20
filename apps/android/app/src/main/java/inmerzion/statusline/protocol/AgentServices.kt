package inmerzion.statusline.protocol

enum class AgentProviderId(val wireId: String, val displayName: String) {
    CODEX("codex", "Codex"),
    ANTIGRAVITY("antigravity", "Antigravity");

    companion object {
        fun fromWire(value: String): AgentProviderId? = values().firstOrNull { it.wireId == value }
    }
}

enum class AgentQuotaPeriod {
    WEEKLY,
    SHORT_WINDOW,
}

data class AgentQuotaWindow(
    val remainingPercentage: Int,
    val resetAtEpochSeconds: Long,
    val windowMinutes: Int,
)

data class AgentProviderReading(
    val id: AgentProviderId,
    val status: String,
    val updatedAtEpochSeconds: Long,
    val weekly: AgentQuotaWindow? = null,
    val shortWindow: AgentQuotaWindow? = null,
) {
    val defaultPeriod: AgentQuotaPeriod
        get() = if (id == AgentProviderId.ANTIGRAVITY) {
            AgentQuotaPeriod.SHORT_WINDOW
        } else {
            AgentQuotaPeriod.WEEKLY
        }

    val primaryWindow: AgentQuotaWindow? get() = window()

    fun window(period: AgentQuotaPeriod = defaultPeriod): AgentQuotaWindow? = when (period) {
        AgentQuotaPeriod.WEEKLY -> weekly ?: shortWindow
        AgentQuotaPeriod.SHORT_WINDOW -> shortWindow ?: weekly
    }

    fun usageStatus(isDemo: Boolean = false): UsageStatus? = primaryWindow?.let {
        UsageStatus(it.remainingPercentage, it.resetAtEpochSeconds, updatedAtEpochSeconds, isDemo)
    }
}

data class AgentServicesSnapshot(
    val providers: List<AgentProviderReading>,
    val updatedAtEpochSeconds: Long,
    val channelId: String? = null,
    val sequence: Long = 0,
    val isDemo: Boolean = false,
    val isLegacy: Boolean = false,
) {
    fun focusedProvider(preferred: AgentProviderId?): AgentProviderReading? =
        providers.firstOrNull { it.id == preferred }
            ?: providers.firstOrNull { it.id == AgentProviderId.CODEX }
            ?: providers.firstOrNull()

    fun supersedes(previous: AgentServicesSnapshot): Boolean {
        if (channelId != previous.channelId) return false
        // Legacy v1 does not authenticate its outer sequence.
        if (isLegacy && !previous.isLegacy && updatedAtEpochSeconds <= previous.updatedAtEpochSeconds) return false
        return if (sequence > 0 && previous.sequence > 0) sequence > previous.sequence
        else updatedAtEpochSeconds > previous.updatedAtEpochSeconds
    }

    companion object {
        fun fromLegacy(status: UsageStatus, channelId: String? = null, sequence: Long = 0) =
            AgentServicesSnapshot(
                listOf(AgentProviderReading(AgentProviderId.CODEX, "ready", status.updatedAtEpochSeconds,
                    weekly = AgentQuotaWindow(status.remainingPercentage, status.resetAtEpochSeconds, 10_080))),
                status.updatedAtEpochSeconds, channelId, sequence, status.isDemo, isLegacy = true,
            )
    }
}
