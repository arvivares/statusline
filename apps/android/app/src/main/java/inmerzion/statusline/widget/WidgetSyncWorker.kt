package inmerzion.statusline.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import inmerzion.statusline.data.StatuslineRepository
import java.util.concurrent.TimeUnit

class WidgetSyncWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {
    override fun doWork(): Result {
        val repository by lazy { StatuslineRepository(applicationContext) }
        val operation = WidgetRefreshOperation(
            hasWidgets = { !isStopped && WidgetSyncScheduler.hasWidgets(applicationContext) },
            isPaired = { repository.isPaired() },
            isDemo = { repository.cachedServices()?.isDemo == true },
            refresh = { repository.refresh() },
            render = { if (!isStopped) StatuslineWidgetProvider.updateAll(applicationContext) },
        )
        return when (operation.run(runAttemptCount)) {
            WidgetRefreshOutcome.RETRY -> Result.retry()
            WidgetRefreshOutcome.UPDATED, WidgetRefreshOutcome.SKIPPED -> Result.success()
        }
    }
}

internal object WidgetSyncScheduler {
    const val WORK_NAME = "statusline.widget.relay-sync"

    fun hasWidgets(context: Context): Boolean = AppWidgetManager.getInstance(context)
        .getAppWidgetIds(ComponentName(context, StatuslineWidgetProvider::class.java)).isNotEmpty()

    fun reconcile(context: Context) {
        val appContext = context.applicationContext
        val enabled = runCatching {
            if (!hasWidgets(appContext)) false else {
                val repository = StatuslineRepository(appContext)
                WidgetRefreshPolicy.shouldSync(true, repository.isPaired(), repository.cachedServices()?.isDemo == true)
            }
        }.getOrDefault(false)
        val manager = WorkManager.getInstance(appContext)
        if (!enabled) {
            manager.cancelUniqueWork(WORK_NAME)
            return
        }
        val request = PeriodicWorkRequestBuilder<WidgetSyncWorker>(
            WidgetRefreshPolicy.INTERVAL_MINUTES, TimeUnit.MINUTES,
        )
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
            .addTag(WORK_NAME)
            .build()
        // Repeated app/widget callbacks must not reset the interval or spawn duplicate jobs.
        manager.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context.applicationContext).cancelUniqueWork(WORK_NAME)
    }
}
