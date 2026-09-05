package inmerzion.statusline.localization

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class L10nTest {
    @Test fun regionalSpanishAndUnsupportedLanguages() {
        listOf("es", "es-ES", "ES_mx", "es_AR.UTF-8", " es-419 ").forEach {
            assertEquals("es", L10n.resolveLanguage(it))
        }
        listOf("en-US", "fr-FR", "fr:es", "pt-BR", "ar", "C", "espanol", "", null).forEach {
            assertEquals("en", L10n.resolveLanguage(it))
        }
    }

    @Test fun interfaceAndWidgetUseTheSameMessages() {
        assertEquals("53 / LIBRE", L10n.translate("{0} / LEFT", "es-MX", 53))
        assertEquals("AL DÍA", L10n.translate("CURRENT", "es"))
        assertEquals("WEEKLY LIMIT", L10n.translate("WEEKLY LIMIT", "fr-FR"))
    }

    @Test fun placeholdersAreNonRecursive() {
        assertEquals("{1} por ciento restante. Reinicia Monday",
            L10n.translate("{0} percent remaining. Resets {1}", "es", "{1}", "Monday"))
    }

    @Test fun everyTranslationHasTheSamePlaceholders() {
        fun placeholders(value: String) = Regex("\\{\\d+\\}").findAll(value).map { it.value }.sorted().toList()
        MessageCatalog.spanish.forEach { (key, value) ->
            assertTrue(key, value.isNotBlank())
            assertEquals(key, placeholders(key), placeholders(value))
        }
    }
}
