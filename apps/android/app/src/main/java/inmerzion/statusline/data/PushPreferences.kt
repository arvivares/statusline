package inmerzion.statusline.data

/** Missing quota preference intentionally preserves legacy Codex-only scope. */
data class PushPreferences(val resetCredits: Boolean = false, val quotaAlerts: Boolean = false) {
    val enabled: Boolean get() = resetCredits || quotaAlerts

    fun withCategory(quotaCategory: Boolean, enabled: Boolean): PushPreferences =
        if (quotaCategory) copy(quotaAlerts = enabled) else copy(resetCredits = enabled)
}
