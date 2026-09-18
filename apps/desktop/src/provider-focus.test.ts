import { describe, expect, it } from "vitest";
import {
  companionProviders,
  providerWatchlist,
  quotaFocus,
} from "./provider-focus";
import { disabledGoogle, parseGoogleView } from "./antigravity";
import type { UsageState } from "./usage";

const window = {
  remainingPercent: 53,
  usedPercent: 47,
  resetsAt: 1790074800,
  windowDurationMins: 10080,
  label: "weekly",
};
const codex: UsageState = {
  status: "ready",
  weekly: window,
  shortWindow: { ...window, remainingPercent: 74, windowDurationMins: 300 },
  checkedAt: 1789477200,
  accountType: "chatgpt",
  plan: "plus",
  limitCount: 1,
};
const google = parseGoogleView({
  revision: 1,
  settings: { source: "desktop", path: null, automatic: true },
  usage: {
    status: "ready",
    source: "desktop",
    checkedAt: 1789477200,
    quota: {
      weekly: { remainingPercent: 78, resetsAt: 1790074800 },
      shortWindow: { remainingPercent: 24, resetsAt: 1789495200 },
    },
  },
});

describe("Still Signature focus and watchlist", () => {
  it("places a detected Claude beside real Codex and Gemini without fabricating a third quota", () => {
    const providers = companionProviders(codex, null, google, {
      revision: 1,
      checkedAt: 1900000000,
      installations: { cli: false, desktop: true },
      status: "quotaUnavailable",
      connection: "none",
      quota: null,
      capturedAt: null,
    });
    expect(providers.map((p) => p.id)).toEqual(["codex", "google", "claude"]);
    expect(providerWatchlist(providers, "google").map((p) => p.name)).toEqual([
      "Codex",
      "Claude",
    ]);
    expect(providers[2]?.weekly).toBeNull();
    expect(providers[2]?.short).toBeNull();
    expect(providers.slice(0, 2)).toEqual(
      companionProviders(codex, null, google),
    );
  });
  it("does not create absent providers or a static Claude slot", () => {
    expect(companionProviders(null, null, disabledGoogle)).toEqual([]);
    const providers = companionProviders(codex, null, disabledGoogle);
    expect(providers.map((p) => p.id)).toEqual(["codex"]);
    expect(providerWatchlist(providers, "codex")).toEqual([]);
  });
  it("shows AGY automatically without Codex when Codex is missing", () => {
    const providers = companionProviders(
      {
        status: "error",
        code: "codexNotFound",
        message: "",
        checkedAt: 1789477200,
      },
      null,
      google,
    );
    expect(providers.map((p) => p.id)).toEqual(["google"]);
    expect(quotaFocus(providers[0]!).window?.remainingPercent).toBe(24);
  });
  it("keeps one focus and the other providers in open rows, not tabs", () => {
    const providers = companionProviders(codex, null, google);
    expect(providerWatchlist(providers, "google").map((p) => p.name)).toEqual([
      "Codex",
    ]);
    expect(providerWatchlist(providers, "codex").map((p) => p.name)).toEqual([
      "Gemini",
    ]);
    expect(quotaFocus(providers[0]!).period).toBe("weekly");
    expect(quotaFocus(providers[1]!).period).toBe("short");
  });
  it("changes the local focus window without changing the Codex relay projection", () => {
    const before = JSON.stringify(codex);
    const providers = companionProviders(codex, null, google);
    expect(quotaFocus(providers[0]!, "short").window?.remainingPercent).toBe(
      74,
    );
    expect(quotaFocus(providers[1]!, "weekly").window?.remainingPercent).toBe(
      78,
    );
    expect(JSON.stringify(codex)).toBe(before);
  });
  it("uses the same layout model for future registered adapters, without inventing them", () => {
    const providers = companionProviders(codex, null, google);
    const future = {
      ...providers[0]!,
      id: "future-adapter",
      name: "Test adapter",
    };
    expect(
      providerWatchlist([...providers, future], "google").map((p) => p.id),
    ).toEqual(["codex", "future-adapter"]);
    expect(companionProviders(codex, null, google)).toHaveLength(2);
  });
  it("retains unavailable detected sources but never manufactures quota", () => {
    const failed = parseGoogleView({
      ...google,
      usage: {
        status: "unavailable",
        source: "desktop",
        checkedAt: 1789477200,
        reason: "timeout",
      },
    });
    const provider = companionProviders(codex, null, failed)[1]!;
    expect(provider.status).toBe("unavailable");
    expect(quotaFocus(provider).window).toBeNull();
  });
  it("does not relabel the only available window", () => {
    const provider = companionProviders(null, null, google)[0]!;
    expect(quotaFocus({ ...provider, short: null }).period).toBe("weekly");
  });
});
