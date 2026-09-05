package inmerzion.statusline.localization

import android.content.Context
import android.content.res.Configuration
import android.content.res.Resources
import android.os.LocaleList
import android.os.Build
import java.util.Locale

internal object LocalizedContext {
    @Suppress("DEPRECATION")
    fun systemLanguage(): String {
        val configuration = Resources.getSystem().configuration
        val primary = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            configuration.locales[0]
        } else {
            configuration.locale
        }
        return primary?.toLanguageTag() ?: "en"
    }

    fun wrap(base: Context): Context {
        val locale = Locale.forLanguageTag(L10n.resolveLanguage(systemLanguage()))
        val configuration = Configuration(base.resources.configuration)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            configuration.setLocales(LocaleList(locale))
        } else {
            configuration.setLocale(locale)
        }
        configuration.setLayoutDirection(locale)
        return base.createConfigurationContext(configuration)
    }
}
