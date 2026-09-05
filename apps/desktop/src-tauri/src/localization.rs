use std::{collections::HashMap, sync::OnceLock};

pub fn resolve_language(primary: &str) -> &'static str {
    if primary
        .trim()
        .split(['-', '_', ':', '.', '@'])
        .next()
        .is_some_and(|s| s.eq_ignore_ascii_case("es"))
    {
        "es"
    } else {
        "en"
    }
}

pub fn language() -> &'static str {
    resolve_language(&sys_locale::get_locale().unwrap_or_default())
}

pub fn text(key: &str) -> String {
    text_for_language(key, language())
}

pub fn text_for_language(key: &str, primary: &str) -> String {
    static SPANISH: OnceLock<HashMap<String, String>> = OnceLock::new();
    if resolve_language(primary) == "es" {
        SPANISH
            .get_or_init(|| {
                serde_json::from_str(include_str!("../../../../localization/messages.json"))
                    .expect("validated localization catalog")
            })
            .get(key)
            .map_or_else(|| key.to_owned(), Clone::clone)
    } else {
        key.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::resolve_language;

    #[test]
    fn primary_language_only_with_english_fallback() {
        for primary in ["es", "es-ES", "es_AR.UTF-8", "ES-mx", "es:en"] {
            assert_eq!(resolve_language(primary), "es");
        }
        for primary in ["en", "en-GB", "fr:es", "pt-BR", "C", "", "espanol"] {
            assert_eq!(resolve_language(primary), "en");
        }
    }
}
