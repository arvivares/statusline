package inmerzion.statusline

import android.app.Application
import android.content.res.Configuration
import inmerzion.statusline.localization.L10n
import inmerzion.statusline.localization.LocalizedContext
import inmerzion.statusline.widget.StatuslineWidgetProvider

class StatuslineApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        L10n.primaryLanguage = LocalizedContext::systemLanguage
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        StatuslineWidgetProvider.updateAll(this)
    }
}
