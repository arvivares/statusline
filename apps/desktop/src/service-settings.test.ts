import { describe, expect, it } from "vitest";
import { serviceSettings } from "./service-settings";
import { disabledGoogle, type GoogleView } from "./antigravity";
import type { ClaudeView } from "./claude";
import type { CodexDiagnostic } from "./codex";

const codex: CodexDiagnostic = {
  status: "ready",
  path: "/opt/bin/codex",
  source: "path",
  version: "codex-cli 1.0",
  savedPath: null,
  message: null,
};
const missing: CodexDiagnostic = {
  ...codex,
  status: "missing",
  path: null,
  source: null,
};
const google: GoogleView = {
  revision: 1,
  settings: { source: "desktop", path: null, automatic: true },
  usage: {
    status: "unavailable",
    source: "desktop",
    checkedAt: 1000,
    reason: "notSignedIn",
  },
};
const claude: ClaudeView = {
  revision: 1,
  checkedAt: 1000,
  installations: { cli: true, desktop: false },
  status: "quotaUnavailable",
  connection: "none",
  quota: null,
  capturedAt: null,
};

describe("service settings presentation", () => {
  it("does not present absent or disabled agents as detected services", () => {
    const rows = serviceSettings(missing, null, disabledGoogle, {
      ...claude,
      installations: { cli: false, desktop: false },
      status: "notFound",
    });
    expect(rows.filter((row) => row.present)).toEqual([]);
    expect(rows.map((row) => row.label)).toEqual([
      "Not detected",
      "Disabled",
      "Not detected",
    ]);
  });

  it("keeps a Codex-only install free of unrelated service rows", () => {
    const rows = serviceSettings(
      codex,
      { status: "loading" },
      disabledGoogle,
      null,
    );
    expect(rows.filter((row) => row.present).map((row) => row.id)).toEqual([
      "codex",
    ]);
    expect(rows[0]?.label).toBe("Detected");
  });

  it("separates installation discovery, sign-in and Claude's explicit connection", () => {
    const rows = serviceSettings(
      codex,
      { status: "unavailable", reason: "notSignedIn", checkedAt: 1000 },
      google,
      claude,
    );
    expect(rows.every((row) => row.present)).toBe(true);
    expect(rows.map((row) => row.label)).toEqual([
      "Sign in required",
      "Sign in required",
      "Connect to read quota",
    ]);
    expect(rows.every((row) => row.tone !== "ready")).toBe(true);
  });

  it("keeps broken manually configured sources available to repair", () => {
    const rows = serviceSettings(
      { ...missing, savedPath: "/old/codex" },
      null,
      {
        ...google,
        settings: { ...google.settings, path: "/old/agy", automatic: false },
        usage: {
          ...google.usage,
          status: "unavailable",
          source: "desktop",
          checkedAt: 1000,
          reason: "invalidPath",
        },
      },
      null,
    );
    expect(rows.slice(0, 2).map((row) => [row.present, row.label])).toEqual([
      [true, "Needs attention"],
      [true, "Needs attention"],
    ]);
  });

  it("keeps a connected Claude bridge manageable when installation discovery is unavailable", () => {
    const row = serviceSettings(null, null, null, {
      ...claude,
      installations: { cli: false, desktop: false },
      connection: "connected",
      status: "discoveryUnavailable",
    })[2];
    expect(row).toMatchObject({
      present: true,
      label: "Needs attention",
      tone: "attention",
    });
  });

  it("does not confuse a connected bridge with an available quota sample", () => {
    const connected = { ...claude, connection: "connected" as const };
    expect(serviceSettings(null, null, null, connected)[2]?.label).toBe(
      "Waiting for a response",
    );
    expect(
      serviceSettings(null, null, null, {
        ...connected,
        status: "noPlanQuota",
      })[2]?.label,
    ).toBe("No plan quota");
    expect(
      serviceSettings(null, null, null, {
        ...connected,
        status: "ready",
        capturedAt: 1000,
        quota: {
          checkedAt: 1000,
          weekly: null,
          shortWindow: { remainingPercent: 0, resetsAt: 2000 },
          spendLimit: null,
        },
      })[2],
    ).toMatchObject({ label: "Quota available", tone: "ready" });
  });

  it("does not claim successful discovery while providers are still initializing", () => {
    expect(
      serviceSettings(null, null, null, null).map((row) => [
        row.present,
        row.label,
      ]),
    ).toEqual([
      [false, "Checking…"],
      [false, "Checking…"],
      [false, "Checking…"],
    ]);
  });
});
