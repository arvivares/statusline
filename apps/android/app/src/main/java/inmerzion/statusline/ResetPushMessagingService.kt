package inmerzion.statusline

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import inmerzion.statusline.data.StatuslineRepository
import inmerzion.statusline.localization.L10n

class ResetPushMessagingService : FirebaseMessagingService() {
    override fun onRegistered(installationId: String) {
        if (!StatuslineApplication.isPushConfigured()) return
        runCatching {
            val repository = StatuslineRepository(applicationContext)
            if (repository.anyNotificationsEnabled() && repository.isPaired()) {
                repository.registerResetNotifications(installationId, L10n.locale.language)
            }
        }
    }

    override fun onUnregistered(installationId: String) = Unit

    override fun onMessageReceived(message: RemoteMessage) {
        val repository = runCatching { StatuslineRepository(applicationContext) }.getOrNull() ?: return
        val quota = message.data["alertCategory"] == "quota"
        val enabled = if (quota) repository.quotaNotificationsEnabled() else repository.resetNotificationsEnabled()
        if (!enabled || !repository.isPaired()) return
        val content = message.notification ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return
        }

        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, StatuslineApplication.RESET_NOTIFICATION_CHANNEL)
        } else {
            Notification.Builder(this)
        }
        val notification = builder
            .setSmallIcon(R.drawable.ic_stat_statusline)
            .setContentTitle(content.title ?: L10n.text("A Codex reset is available"))
            .setContentText(content.body ?: L10n.text("Open Statusline to see your reset count and expiry."))
            .setCategory(Notification.CATEGORY_STATUS)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()

        runCatching {
            getSystemService(NotificationManager::class.java)
                .notify(if (quota) "${message.data["provider"]}-${message.data["kind"]}-${message.data["window"]}" else RESET_NOTIFICATION_TAG,
                    RESET_NOTIFICATION_ID, notification)
        }
    }

    private companion object {
        const val RESET_NOTIFICATION_TAG = "codex-reset-credit"
        const val RESET_NOTIFICATION_ID = 1
    }
}
