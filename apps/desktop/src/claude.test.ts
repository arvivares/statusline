import { describe, expect, it } from "vitest";
import {
  acceptClaudeView,
  claudeConnectFailureCopy,
  claudeHasQuota,
  claudeIsVisible,
  type ClaudeView,
} from "./claude";
import {
  companionProviders,
  providerWatchlist,
  quotaFocus,
} from "./provider-focus";
import { disabledGoogle } from "./antigravity";

const detected: ClaudeView = {
  revision: 1,
  checkedAt: 1900000000,
  installations: { cli: true, desktop: false },
  status: "quotaUnavailable",
  connection: "none",
  quota: null,
  capturedAt: null,
};
const missing: ClaudeView = {
  ...detected,
  installations: { cli: false, desktop: false },
  status: "notFound",
};
// Observed on a real Enterprise seat: five-hour window only, no weekly.
const enterprise: ClaudeView = {
  ...detected,
  status: "ready",
  connection: "connected",
  quota: {
    checkedAt: 1899999000,
    weekly: null,
    shortWindow: { remainingPercent: 48, resetsAt: 1900003000 },
    spendLimit: null,
  },
  capturedAt: 1899999500,
};
const pro: ClaudeView = {
  ...enterprise,
  quota: {
    checkedAt: 1899999000,
    weekly: { remainingPercent: 53, resetsAt: 1900604800 },
    shortWindow: { remainingPercent: 74.5, resetsAt: 1900018000 },
    spendLimit: null,
  },
};
const apiKey: ClaudeView = {
  ...detected,
  status: "noPlanQuota",
  connection: "connected",
  capturedAt: 1899999500,
};
const gateway: ClaudeView = {
  ...apiKey,
  quota: {
    checkedAt: 1899999000,
    weekly: null,
    shortWindow: null,
    spendLimit: { usedPercent: 130, resetsAt: 1900604800 },
  },
};

describe("passive Claude discovery", () => {
  it("adds no placeholder when absent, and no made-up quota when detected", () => {
    expect(claudeIsVisible(null)).toBe(false);
    expect(companionProviders(null, null, disabledGoogle, missing)).toEqual([]);
    const providers = companionProviders(null, null, disabledGoogle, detected);
    expect(providers.map((p) => p.id)).toEqual(["claude"]);
    expect(providers[0]?.status).toBe("unavailable");
    expect(providers[0]?.checkedAt).toBeNull(); // detection is not a sample
    expect(quotaFocus(providers[0]!).window).toBeNull();
    expect(providerWatchlist(providers, "claude")).toEqual([]);
  });
  it("distinguishes desktop from CLI without requiring either to be running", () => {
    for (const installations of [
      { cli: false, desktop: true },
      { cli: true, desktop: false },
      { cli: true, desktop: true },
    ]) {
      expect(
        claudeIsVisible(acceptClaudeView(null, { ...detected, installations })),
      ).toBe(true);
    }
  });
  it("ignores stale events, removes uninstalled services and preserves a failed scan", () => {
    const current = acceptClaudeView(detected, { ...missing, revision: 2 });
    expect(claudeIsVisible(current)).toBe(false);
    expect(acceptClaudeView(current, detected)).toBe(current);
    const failed = acceptClaudeView(detected, {
      ...missing,
      revision: 2,
      status: "discoveryUnavailable",
    });
    expect(claudeIsVisible(failed)).toBe(true);
    expect(failed.status).toBe("discoveryUnavailable");
  });
  it("rejects malformed IPC and never accepts ready without a reported window", () => {
    for (const value of [
      null,
      [],
      { ...detected, status: "ready" },
      { ...detected, status: "ready", quota: gateway.quota, capturedAt: 1 },
      { ...enterprise, capturedAt: null },
      { ...detected, quota: pro.quota }, // windows only travel with ready
      { ...apiKey, capturedAt: null },
      { ...missing, status: ["notFound"] },
      { ...detected, checkedAt: 0 },
      { ...detected, checkedAt: 1900000000.5 },
      { ...detected, revision: -1 },
      { ...detected, connection: "yes" },
      { ...detected, installations: { cli: "true", desktop: false } },
      { ...detected, status: "notFound" },
      { ...missing, status: "quotaUnavailable" },
      {
        ...enterprise,
        quota: {
          ...enterprise.quota,
          shortWindow: { remainingPercent: 101, resetsAt: 1 },
        },
      },
      {
        ...gateway,
        quota: {
          ...gateway.quota,
          spendLimit: { usedPercent: -1, resetsAt: 1 },
        },
      },
    ]) {
      expect(() => acceptClaudeView(detected, value)).toThrow();
    }
  });
  it("drops unrecognized fields instead of carrying private data into UI state", () => {
    const result = acceptClaudeView(null, {
      ...detected,
      path: "/fixture-private",
      token: "fixture-only",
    });
    expect(result).toEqual(detected);
    const ready = acceptClaudeView(null, {
      ...pro,
      quota: { ...pro.quota, transcript: "/fixture-private", cost: 12 },
    });
    expect(ready).toEqual(pro);
  });
});

describe("Claude Code statusline quota", () => {
  it("shows an Enterprise seat's five-hour window without inventing a weekly one", () => {
    expect(claudeHasQuota(enterprise)).toBe(true);
    const providers = companionProviders(
      null,
      null,
      disabledGoogle,
      enterprise,
    );
    const claude = providers[0]!;
    expect(claude.status).toBe("ready");
    expect(claude.checkedAt).toBe(1899999000); // Claude Code's report time
    expect(claude.weekly).toBeNull();
    expect(claude.short).toEqual({
      remainingPercent: 48,
      resetsAt: 1900003000,
      minutes: 300,
    });
    const focus = quotaFocus(claude);
    expect(focus.period).toBe("short");
    expect(focus.alternate).toBeNull();
  });
  it("shows both windows for Pro and Max and prefers the short one by default", () => {
    const claude = companionProviders(null, null, disabledGoogle, pro)[0]!;
    expect(claude.weekly?.minutes).toBe(10080);
    expect(claude.short?.remainingPercent).toBe(74.5);
    expect(quotaFocus(claude).period).toBe("short");
    expect(quotaFocus(claude, "weekly").window?.remainingPercent).toBe(53);
  });
  it("keeps API-key and gateway sessions visible without a quota number", () => {
    for (const view of [apiKey, gateway]) {
      expect(claudeIsVisible(view)).toBe(true);
      expect(claudeHasQuota(view)).toBe(false);
      const claude = companionProviders(null, null, disabledGoogle, view)[0]!;
      expect(claude.status).toBe("unavailable");
      expect(claude.weekly).toBeNull();
      expect(claude.short).toBeNull();
    }
    expect(acceptClaudeView(null, gateway).quota?.spendLimit?.usedPercent).toBe(
      130,
    );
  });
  it("stays visible for a custom installation that only the bridge revealed", () => {
    const custom = acceptClaudeView(null, {
      ...enterprise,
      installations: { cli: false, desktop: false },
    });
    expect(claudeIsVisible(custom)).toBe(true);
    expect(claudeHasQuota(custom)).toBe(true);
  });
  it("maps connect failures to safe copy without echoing backend prose", () => {
    const copies = new Set(
      [
        "invalidSettings",
        "unsupportedPath",
        "storageUnavailable",
        "settingsUnavailable",
        "something else /private/path",
      ].map(claudeConnectFailureCopy),
    );
    expect(copies.size).toBe(4);
    for (const copy of copies) expect(copy).not.toContain("/private/path");
  });
});
