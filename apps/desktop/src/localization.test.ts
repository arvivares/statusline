import { beforeEach, describe, expect, it } from "vitest";
import catalog from "../../../localization/messages.json";
import localeCases from "../../../localization/locale-cases.json";
import {
  language,
  resolveLanguage,
  setLanguage,
  t,
  relayErrorCopy,
  type MessageKey,
} from "./localization";
import { copyForState } from "./usage";
import { labelForCodexSource } from "./codex";

beforeEach(() => setLanguage("en"));

describe("system language", () => {
  it.each(localeCases)("$primary → $expected", ({ primary, expected }) => {
    expect(resolveLanguage(primary)).toBe(expected);
  });
  it("does not select a supported secondary language", () => {
    const preferred = ["fr-FR", "es-ES", "en-US"];
    setLanguage(preferred[0]!);
    expect(language()).toBe("en");
    expect(t("WEEKLY LIMIT")).toBe("WEEKLY LIMIT");
  });
  it("falls back to English with missing language information", () => {
    expect(resolveLanguage(undefined)).toBe("en");
    expect(resolveLanguage(null)).toBe("en");
  });
});

describe("messages", () => {
  it("has complete translations and matching interpolation placeholders", () => {
    const placeholders = (s: string) =>
      [...s.matchAll(/\{\d+\}/g)].map(([v]) => v).sort();
    for (const [key, spanish] of Object.entries(catalog)) {
      expect(spanish.trim(), key).not.toBe("");
      expect(placeholders(spanish), key).toEqual(placeholders(key));
      setLanguage("en");
      expect(t(key as MessageKey)).toBe(key);
      setLanguage("es");
      expect(t(key as MessageKey)).toBe(spanish);
    }
  });
  it("does not reinterpret arguments as placeholders or markup", () => {
    setLanguage("es-MX");
    expect(t("{0} percent remaining. Resets {1}", "{1}", "<b>Monday</b>")).toBe(
      "{1} por ciento restante. Reinicia <b>Monday</b>",
    );
  });
  it("localizes errors by code without exposing backend prose", () => {
    setLanguage("es-ES");
    const copy = copyForState({
      status: "error",
      code: "codexNotFound",
      message: "private backend detail",
      checkedAt: 1,
    });
    expect(copy.title).toBe("No se encontró Codex CLI");
    expect(copy.detail).toBe(
      "Abre la configuración de origen para detectar o seleccionar la CLI local.",
    );
    expect(labelForCodexSource("saved")).toBe("RUTA GUARDADA");
    expect(relayErrorCopy("pairingExpired")).toContain("caducado");
    expect(relayErrorCopy("unknown_server_error")).toContain(
      "Comprueba la conexión",
    );
  });
  it("keeps widget-style status labels compact", () => {
    setLanguage("es");
    expect(t("LEFT")).toBe("LIBRE");
    expect(t("CURRENT")).toBe("AL DÍA");
    expect(t("{0} / LEFT", 53)).toBe("53 / LIBRE");
  });
});
