package inmerzion.statusline.data

import inmerzion.statusline.protocol.UsageStatus
import java.util.Calendar

internal object DemoStatusFactory {
    fun create(nowEpochSeconds: Long = System.currentTimeMillis() / 1_000): UsageStatus {
        val reset = Calendar.getInstance().apply {
            timeInMillis = nowEpochSeconds * 1_000
            add(Calendar.DAY_OF_YEAR, 3)
            set(Calendar.HOUR_OF_DAY, 9)
            set(Calendar.MINUTE, 2)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        return UsageStatus(
            remainingPercentage = 53,
            resetAtEpochSeconds = reset.timeInMillis / 1_000,
            updatedAtEpochSeconds = nowEpochSeconds,
            isDemo = true,
        )
    }
}
