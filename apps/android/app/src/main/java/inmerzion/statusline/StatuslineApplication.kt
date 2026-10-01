package inmerzion.statusline

import android.app.Application
import android.content.res.Configuration
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import inmerzion.statusline.localization.L10n
import inmerzion.statusline.localization.LocalizedContext
import inmerzion.statusline.widget.StatuslineWidgetProvider

class StatuslineApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        L10n.primaryLanguage = LocalizedContext::systemLanguage
        configurePush()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        StatuslineWidgetProvider.updateAll(this)
    }

    private fun configurePush() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                RESET_NOTIFICATION_CHANNEL,
                L10n.text("Codex reset alerts"),
                NotificationManager.IMPORTANCE_DEFAULT,
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
        if (BuildConfig.FIREBASE_API_KEY.isBlank() || BuildConfig.FIREBASE_PROJECT_ID.isBlank() ||
            BuildConfig.FIREBASE_SENDER_ID.isBlank() || BuildConfig.FIREBASE_ANDROID_APP_ID.isBlank()) {
            return
        }
        if (FirebaseApp.getApps(this).none { it.name == FirebaseApp.DEFAULT_APP_NAME }) {
            val options = FirebaseOptions.Builder()
                .setApiKey(BuildConfig.FIREBASE_API_KEY)
                .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
                .setApplicationId(BuildConfig.FIREBASE_ANDROID_APP_ID)
                .build()
            FirebaseApp.initializeApp(this, options)
        }
        FirebaseApp.getInstance().let { app ->
            FirebaseMessaging.getInstance(app).isAutoInitEnabled = false
        }
    }

    companion object {
        const val RESET_NOTIFICATION_CHANNEL = "reset_alerts"

        fun isPushConfigured(): Boolean = BuildConfig.FIREBASE_API_KEY.isNotBlank() &&
            BuildConfig.FIREBASE_PROJECT_ID.isNotBlank() &&
            BuildConfig.FIREBASE_SENDER_ID.isNotBlank() &&
            BuildConfig.FIREBASE_ANDROID_APP_ID.isNotBlank()
    }
}
