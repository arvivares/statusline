interface Plausible {
  (...args: unknown[]): void;
  q?: unknown[][];
  o?: Record<string, unknown>;
  init?: (options?: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    plausible?: Plausible;
  }
}

// Public site configuration, not a credential. Forks must use their own script.
export const plausibleScriptUrl =
  "https://plausible.inmerzion.io/js/pa-I8pQQow2mmhcCJBQvq-7n.js";
const scriptId = "plausible-analytics";

export function initializeAnalytics(production: boolean, siteOrigin: string) {
  if (!production || window.location.origin !== siteOrigin) return;
  if (document.getElementById(scriptId)) return;

  // Keep the official queue/init contract inside our bundle: no inline script
  // or extra dependency. Initialize before inserting the async remote script.
  const plausible: Plausible =
    window.plausible ||
    ((...args: unknown[]) => {
      (plausible.q ??= []).push(args);
    });
  plausible.init ??= (options) => {
    plausible.o = options || {};
  };
  window.plausible = plausible;
  plausible.init();

  const script = document.createElement("script");
  script.id = scriptId;
  script.async = true;
  script.src = plausibleScriptUrl;
  document.head.append(script);
  // Plausible tracks pushState/popstate itself (EN/ES). Do not send a second
  // manual pageview or enable hash routing for in-page section links.
}
