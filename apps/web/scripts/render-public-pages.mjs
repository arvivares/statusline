import {
  publicPageContent,
  publicPageIDs,
  publicPagePath,
  publicSiteOrigin,
} from "../../../content/public-pages.ts";

const labels = {
  en: {
    home: "Back to Statusline",
    language: "Language",
    contents: "ON THIS PAGE",
    privacy: "Privacy",
    support: "Support",
    "delete-data": "Data control",
    skip: "Skip to content",
    independent: "Independent project. Not endorsed by OpenAI.",
  },
  es: {
    home: "Volver a Statusline",
    language: "Idioma",
    contents: "EN ESTA PÁGINA",
    privacy: "Privacidad",
    support: "Soporte",
    "delete-data": "Control de datos",
    skip: "Ir al contenido",
    independent: "Proyecto independiente. No respaldado por OpenAI.",
  },
};
const escapeHTML = (value) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

export function renderPublicPage(id, language) {
  const page = publicPageContent(id, language);
  const copy = labels[language];
  const path = publicPagePath(id, language);
  const sections = [];
  // Headings and HTML come exclusively from the versioned content module.
  const content = page.content.replace(/<h2>([^<]+)<\/h2>/g, (_, heading) => {
    const anchor = `section-${sections.length + 1}`;
    sections.push({ anchor, heading });
    return `<h2 id="${anchor}">${heading}</h2>`;
  });
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="description" content="${escapeHTML(page.summary)}">
  <meta name="referrer" content="no-referrer">
  <title>${escapeHTML(page.title)} — Statusline</title>
  <link rel="canonical" href="${publicSiteOrigin}${path}">
  ${["en", "es"].map((locale) => `<link rel="alternate" hreflang="${locale}" href="${publicSiteOrigin}${publicPagePath(id, locale)}">`).join("\n  ")}
  <link rel="alternate" hreflang="x-default" href="${publicSiteOrigin}${publicPagePath(id, "en")}">
  <link rel="icon" type="image/svg+xml" href="/assets/statusline-mark.svg?v=segmented-s-2026">
  <link rel="stylesheet" href="/information.css">
</head>
<body>
  <a class="skip-link" href="#content">${copy.skip}</a>
  <header class="site-bar">
    <a class="brand" href="${language === "es" ? "/es/" : "/"}" aria-label="${copy.home}"><img src="/assets/statusline-mark.svg" width="32" height="32" alt="">Statusline<span class="brand-divider">/</span><span class="brand-section">${copy[id]}</span></a>
    <nav class="languages" aria-label="${copy.language}">${["en", "es"].map((locale) => `<a href="${publicPagePath(id, locale)}" lang="${locale}" hreflang="${locale}"${language === locale ? ' aria-current="true"' : ""}>${locale.toUpperCase()}</a>`).join("")}</nav>
  </header>
  <main id="content" tabindex="-1">
    <div class="page-heading"><p class="eyebrow">${page.eyebrow}</p><h1>${escapeHTML(page.title)}</h1><p class="summary">${escapeHTML(page.summary)}</p></div>
    <div class="information-layout">
      <nav class="contents" aria-label="${copy.contents}"><p>${copy.contents}</p><ol>${sections.map(({ anchor, heading }) => `<li><a href="#${anchor}">${escapeHTML(heading)}</a></li>`).join("")}</ol></nav>
      <article>${content}</article>
    </div>
  </main>
  <footer><nav aria-label="${language === "es" ? "Información del proyecto" : "Project information"}">${publicPageIDs.map((pageID) => `<a href="${publicPagePath(pageID, language)}"${id === pageID ? ' aria-current="page"' : ""}>${copy[pageID]}</a>`).join("")}</nav><p>${copy.independent}</p><span>STATUSLINE / INMERZION</span></footer>
</body>
</html>`;
}
