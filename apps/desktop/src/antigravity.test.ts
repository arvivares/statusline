import { describe, expect, it } from "vitest";
import {
  disabledGoogle,
  googleIsVisible,
  newerGoogleView,
  parseGoogleView,
} from "./antigravity";
const sample = () => ({
  revision: 1,
  settings: { source: "desktop", path: null },
  usage: {
    status: "ready",
    source: "desktop",
    checkedAt: 1789477200,
    quota: {
      weekly: { remainingPercent: 53, resetsAt: 1790074800 },
      shortWindow: null,
    },
  },
});
describe("per-user Google service", () => {
  it("ignores late events that could resurrect a removed service", () => {
    const removed = { ...disabledGoogle, revision: 2 };
    expect(newerGoogleView(removed, parseGoogleView(sample()))).toBe(removed);
  });
  it("does not create a placeholder for a disabled or absent service", () => {
    expect(parseGoogleView(disabledGoogle)).toEqual(disabledGoogle);
    expect(googleIsVisible(disabledGoogle)).toBe(false);
  });
  it("accepts automatic discovery while preserving the selected source identity", () => {
    const data = {
      ...sample(),
      settings: { source: "desktop", path: null, automatic: true },
    };
    expect(parseGoogleView(data).settings.automatic).toBe(true);
    expect(googleIsVisible(parseGoogleView(data))).toBe(true);
    const absent = {
      ...disabledGoogle,
      settings: { ...disabledGoogle.settings, automatic: true },
    };
    expect(googleIsVisible(parseGoogleView(absent))).toBe(false);
    expect(() =>
      parseGoogleView({
        ...data,
        settings: { ...data.settings, automatic: "yes" },
      }),
    ).toThrow();
  });
  it("shows only the configured source", () => {
    expect(googleIsVisible(parseGoogleView(sample()))).toBe(true);
    const value = sample();
    value.usage.source = "cli";
    expect(() => parseGoogleView(value)).toThrow();
  });
  it("keeps a configured temporary failure visible, but not an uninstalled service", () => {
    for (const [reason, visible] of [
      ["notFound", false],
      ["timeout", true],
      ["notSignedIn", true],
    ] as const) {
      expect(
        googleIsVisible(
          parseGoogleView({
            ...sample(),
            usage: {
              status: "unavailable",
              source: "desktop",
              checkedAt: 1789477200,
              reason,
            },
          }),
        ),
      ).toBe(visible);
    }
  });
  it("does not turn missing quota into zero or full", () => {
    for (const value of [undefined, null, "53", NaN, -1, 101]) {
      const data = sample();
      Object.assign(data.usage.quota.weekly, { remainingPercent: value });
      expect(() => parseGoogleView(data)).toThrow();
    }
  });
  it("does not leak extra identity or third-party buckets", () => {
    const data = sample();
    Object.assign(data.usage, {
      email: "private@example.invalid",
      claude: { remainingPercent: 99 },
    });
    expect(JSON.stringify(parseGoogleView(data))).not.toMatch(
      /email|claude|private/,
    );
  });
});
