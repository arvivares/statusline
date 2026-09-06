import { staticMessages } from "./static-messages";
import { interfaceMessages, platformMessages } from "./messages";
import {
  languageFromPath,
  languagePaths,
  pageMetadata,
  structuredData,
  type Language,
  type Platform,
} from "./site";
import type { PlatformContent } from "./messages";

export type { Language, Platform } from "./site";
const storageKey = "statusline-language";
const catalogs: Record<
  Language,
  Readonly<Record<keyof typeof staticMessages.en, string>>
> = staticMessages;

let language: Language = "en";
const listeners = new Set<() => void>();

function isLanguage(value: string | null): value is Language {
  return value === "en" || value === "es";
}

export function uiText(
  key: keyof typeof interfaceMessages.en,
  values: Record<string, string | number> = {},
): string {
  return interfaceMessages[language][key].replace(
    /\{(\w+)\}/g,
    (match, name: string) => (name in values ? String(values[name]) : match),
  );
}

export function platformContent(platform: Platform): PlatformContent {
  return platformMessages[language][platform];
}

export function onLanguageChange(listener: () => void) {
  listeners.add(listener);
}

function applyLanguage(next: Language, persist: boolean) {
  language = next;
  document.documentElement.lang = next;
  const messages: Readonly<Record<string, string>> = catalogs[next];
  const bindings = [
    ["data-i18n", "text"],
    ["data-i18n-html", "html"],
    ["data-i18n-aria-label", "aria-label"],
    ["data-i18n-content", "content"],
    ["data-i18n-title", "title"],
    ["data-i18n-alt", "alt"],
  ] as const;

  for (const [binding, target] of bindings) {
    document
      .querySelectorAll<HTMLElement>(`[${binding}]`)
      .forEach((element) => {
        const key = element.getAttribute(binding)!;
        const message = messages[key];
        if (message === undefined) {
          if (import.meta.env.DEV)
            console.error(`Missing ${next} translation: ${key}`);
          return;
        }
        if (target === "text") element.textContent = message;
        // Rich text comes exclusively from the versioned, authored message catalog.
        else if (target === "html") element.innerHTML = message;
        else element.setAttribute(target, message);
      });
  }

  const metadata = pageMetadata(next);
  document
    .querySelector('link[rel="canonical"]')
    ?.setAttribute("href", metadata.canonical);
  for (const [selector, content] of [
    ['meta[property="og:url"]', metadata.canonical],
    ['meta[property="og:locale"]', metadata.locale],
    ['meta[property="og:locale:alternate"]', metadata.alternateLocale],
    ['meta[property="og:image"]', metadata.image],
    ['meta[name="twitter:image"]', metadata.image],
  ])
    document.querySelector(selector)?.setAttribute("content", content);
  const schema = document.getElementById("structured-data");
  if (schema)
    schema.textContent = JSON.stringify(
      structuredData(
        next,
        messages["meta.title"],
        messages["meta.description"],
      ),
    );
  document
    .querySelectorAll<HTMLAnchorElement>("[data-language]")
    .forEach((link) => {
      if (link.dataset.language === next)
        link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });

  if (persist) {
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      /* Persistence is optional. */
    }
  }
  listeners.forEach((listener) => listener());
}

export function initializeLanguage() {
  // The URL is authoritative for people and crawlers, including when a stored
  // preference differs. No automatic locale redirects or browser sniffing.
  applyLanguage(languageFromPath(window.location.pathname), false);

  const announcement = document.createElement("span");
  announcement.className = "sr-only";
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", "polite");
  document.querySelector(".site-header")?.append(announcement);

  document
    .querySelectorAll<HTMLAnchorElement>("[data-language]")
    .forEach((link) => {
      link.addEventListener("click", (event) => {
        // Preserve native link behavior for new tabs, keyboard modifiers and
        // browsers where progressive enhancement is unavailable.
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        const next = link.dataset.language ?? null;
        if (!isLanguage(next)) return;
        const target = `${languagePaths[next]}${window.location.search}${window.location.hash}`;
        try {
          if (next !== language) window.history.pushState(null, "", target);
        } catch {
          return; // Fall back to the server-rendered link destination.
        }
        event.preventDefault();
        applyLanguage(next, true);
        refreshLanguageLinks();
        announcement.textContent = uiText("languageChanged");
      });
    });

  function refreshLanguageLinks() {
    document
      .querySelectorAll<HTMLAnchorElement>("[data-language]")
      .forEach((link) => {
        const next = link.dataset.language ?? null;
        if (isLanguage(next))
          link.href = `${languagePaths[next]}${window.location.search}${window.location.hash}`;
      });
  }
  refreshLanguageLinks();
  window.addEventListener("hashchange", refreshLanguageLinks);
  window.addEventListener("popstate", () => {
    const next = languageFromPath(window.location.pathname);
    if (next !== language) {
      applyLanguage(next, true);
      announcement.textContent = uiText("languageChanged");
    }
    refreshLanguageLinks();
  });
}
