package inmerzion.statusline.data

import android.content.Context
import inmerzion.statusline.protocol.UsageStatus

class StatusCache(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun load(): UsageStatus? {
        if (!preferences.contains(FIELD_REMAINING)) return null
        val remaining = preferences.getInt(FIELD_REMAINING, -1)
        val resetAt = preferences.getLong(FIELD_RESET_AT, -1)
        val updatedAt = preferences.getLong(FIELD_UPDATED_AT, -1)
        return if (remaining in 0..100 && resetAt > 0 && updatedAt > 0) {
            UsageStatus(
                remainingPercentage = remaining,
                resetAtEpochSeconds = resetAt,
                updatedAtEpochSeconds = updatedAt,
                isDemo = preferences.getBoolean(FIELD_IS_DEMO, false),
            )
        } else {
            clear()
            null
        }
    }

    fun save(status: UsageStatus) {
        require(status.remainingPercentage in 0..100)
        require(status.resetAtEpochSeconds > 0 && status.updatedAtEpochSeconds > 0)
        check(
            preferences.edit()
                .putInt(FIELD_REMAINING, status.remainingPercentage)
                .putLong(FIELD_RESET_AT, status.resetAtEpochSeconds)
                .putLong(FIELD_UPDATED_AT, status.updatedAtEpochSeconds)
                .putBoolean(FIELD_IS_DEMO, status.isDemo)
                .commit(),
        ) { "Could not persist the status cache." }
    }

    fun clear() {
        preferences.edit().clear().commit()
    }

    private companion object {
        const val PREFERENCES = "inmerzion.statusline.status.v1"
        const val FIELD_REMAINING = "remainingPercentage"
        const val FIELD_RESET_AT = "resetAt"
        const val FIELD_UPDATED_AT = "updatedAt"
        const val FIELD_IS_DEMO = "isDemo"
    }
}
