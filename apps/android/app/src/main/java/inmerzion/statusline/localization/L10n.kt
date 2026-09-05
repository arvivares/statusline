package inmerzion.statusline.localization

import java.util.Locale

/** UI-only localization. Protocol fields and stored data are language-independent. */
object L10n {
    private val placeholders = Regex("\\{(\\d+)\\}")
    // Replaced by the Application with the OS locale list, not resource-selected locales.
    internal var primaryLanguage: () -> String = { Locale.getDefault().toLanguageTag() }
    fun resolveLanguage(primary: String?): String =
        if (primary?.trim()?.split('-', '_', ':', '.', '@')?.firstOrNull()?.lowercase(Locale.ROOT) == "es") "es" else "en"

    val locale: Locale get() = Locale.forLanguageTag(resolveLanguage(primaryLanguage()))

    fun text(key: String, vararg arguments: Any): String = translate(key, locale.language, *arguments)

    internal fun translate(key: String, primary: String, vararg arguments: Any): String {
        val template = if (resolveLanguage(primary) == "es") MessageCatalog.spanish[key] ?: key else key
        if (arguments.isEmpty()) return template
        return placeholders.replace(template) { match ->
            arguments.getOrNull(match.groupValues[1].toInt())?.toString() ?: match.value
        }
    }
}
