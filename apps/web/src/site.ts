export type Language = "en" | "es";
export type Platform = "macos" | "linux" | "windows" | "android" | "ios";

export const siteOrigin = "https://statusline.inmerzion.io";
export const repository = "https://github.com/arvivares/statusline";
export const languagePaths: Record<Language, string> = { en: "/", es: "/es/" };

export function languageFromPath(path: string): Language {
  return path === "/es" || path.startsWith("/es/") ? "es" : "en";
}

export function pageMetadata(language: Language) {
  return {
    canonical: `${siteOrigin}${languagePaths[language]}`,
    locale: language === "en" ? "en_US" : "es_ES",
    alternateLocale: language === "en" ? "es_ES" : "en_US",
    image: `${siteOrigin}/assets/${language === "en" ? "social-card-en.png" : "social-card.png"}`,
  };
}

// Only facts published in the project and visible on the website. No invented
// ratings, release dates, store availability, offers or corporate details.
export function structuredData(
  language: Language,
  title: string,
  description: string,
) {
  const canonical = pageMetadata(language).canonical;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteOrigin}/#publisher`,
        name: "Inmerzion",
        url: "https://inmerzion.io/",
      },
      {
        "@type": "WebSite",
        "@id": `${siteOrigin}/#website`,
        name: "Statusline",
        url: `${siteOrigin}/`,
        inLanguage: ["en", "es"],
        publisher: { "@id": `${siteOrigin}/#publisher` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteOrigin}/#software`,
        name: "Statusline",
        url: `${siteOrigin}/`,
        description,
        applicationCategory: "DeveloperApplication",
        isAccessibleForFree: true,
        license: `${repository}/blob/main/LICENSE`,
        sameAs: [repository],
        image: `${siteOrigin}/assets/statusline-mark.svg`,
        publisher: { "@id": `${siteOrigin}/#publisher` },
      },
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: title,
        description,
        inLanguage: language,
        isPartOf: { "@id": `${siteOrigin}/#website` },
        mainEntity: { "@id": `${siteOrigin}/#software` },
      },
    ],
  };
}
