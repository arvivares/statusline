import { notFoundMessages } from "./not-found-messages.js";

(() => {
  "use strict";

  const storageKey = "statusline-language";
  const switcher = document.querySelector(".language-switch");
  const buttons = document.querySelectorAll("[data-language]");

  function setLanguage(language) {
    const copy = notFoundMessages[language];
    document.documentElement.lang = language;
    document.title = copy.title;
    switcher.setAttribute("aria-label", copy.language);
    document.querySelectorAll("[data-message]").forEach((element) => {
      element.textContent = copy[element.dataset.message];
    });
    document.querySelector('[data-message="back"]').href =
      language === "es" ? "/es/" : "/";
    buttons.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.language === language),
      );
    });
  }

  const spanishPath = /^\/es(?:\/|$)/.test(window.location.pathname);
  let language = spanishPath ? "es" : "en";
  if (!spanishPath) {
    try {
      if (localStorage.getItem(storageKey) === "es") language = "es";
    } catch {
      // Language switching still works when browser storage is unavailable.
    }
  }
  setLanguage(language);

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const selected = button.dataset.language;
      if (selected !== "en" && selected !== "es") return;
      setLanguage(selected);
      try {
        localStorage.setItem(storageKey, selected);
      } catch {
        // Keep the selected language for this page when it cannot be saved.
      }
    });
  });
})();
