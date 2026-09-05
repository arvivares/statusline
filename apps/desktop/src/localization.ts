import spanish from "../../../localization/messages.json";

export type Language = "en" | "es";
export type MessageKey = keyof typeof spanish;

// Only the primary language counts: [fr-FR, es-ES] must fall back to English.
export function resolveLanguage(primary: string | null | undefined): Language {
  return primary
    ?.trim()
    .split(/[-_:.@]/)[0]
    ?.toLowerCase() === "es"
    ? "es"
    : "en";
}

let currentLanguage = resolveLanguage(
  typeof navigator === "undefined"
    ? "en"
    : (navigator.languages[0] ?? navigator.language),
);

export function setLanguage(primary: string): void {
  currentLanguage = resolveLanguage(primary);
}

export function language(): Language {
  return currentLanguage;
}

export function t(key: MessageKey, ...args: (string | number)[]): string {
  const template = currentLanguage === "es" ? spanish[key] : key;
  // Single pass: arguments are data, never templates (or HTML).
  return template.replace(/\{(\d+)\}/g, (placeholder, index: string) =>
    String(args[Number(index)] ?? placeholder),
  );
}

export function localizeDocument(root: ParentNode = document): void {
  document.documentElement.lang = currentLanguage;
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n as MessageKey;
    if (Object.hasOwn(spanish, key)) element.textContent = t(key);
  }
  for (const attribute of ["aria-label", "alt", "title"] as const) {
    for (const element of root.querySelectorAll<HTMLElement>(
      `[data-i18n-${attribute}]`,
    )) {
      const key = element.getAttribute(`data-i18n-${attribute}`) as MessageKey;
      if (Object.hasOwn(spanish, key)) element.setAttribute(attribute, t(key));
    }
  }
}

export function relayErrorCopy(code: string): string {
  switch (code) {
    case "pairingExpired":
    case "pairingAlreadyClaimed":
    case "invalidPairingToken":
      return t(
        "The pairing has expired or was already used. Create a new QR in the companion.",
      );
    case "channelNotFound":
    case "channelExpired":
    case "unauthorized":
      return t(
        "The channel has expired or was disconnected. Pair this device again.",
      );
    case "rateLimited":
      return t("Too many requests. Wait a moment before trying again.");
    case "timeout":
      return t("The relay took too long to respond.");
    case "invalidConfiguration":
      return t("The relay URL is invalid.");
    case "secureStorageUnavailable":
      return t("Could not access this device’s secure storage.");
    case "endpointMismatch":
      return t("The pairing belongs to a different Statusline relay.");
    case "encryptionFailed":
      return t("Could not encrypt or decrypt the snapshot.");
    case "invalidResponse":
      return t("The relay returned an unexpected response.");
    default:
      return t(
        "Could not connect to the relay. Check your connection and try again.",
      );
  }
}
