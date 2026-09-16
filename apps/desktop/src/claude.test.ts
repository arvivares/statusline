import { describe, expect, it } from "vitest";
import { acceptClaudeView, claudeIsVisible, type ClaudeView } from "./claude";
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
};
const missing: ClaudeView = {
  ...detected,
  installations: { cli: false, desktop: false },
  status: "notFound",
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
  it("rejects malformed IPC and never accepts ready from passive detection", () => {
    for (const value of [
      null,
      [],
      { ...detected, status: "ready" },
      { ...missing, status: ["notFound"] },
      { ...detected, checkedAt: 0 },
      { ...detected, checkedAt: 1900000000.5 },
      { ...detected, revision: -1 },
      { ...detected, installations: { cli: "true", desktop: false } },
      { ...detected, status: "notFound" },
      { ...missing, status: "quotaUnavailable" },
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
  });
});
