import { describe, expect, it } from "vitest";

import { labelForCodexSource, parseCodexDiagnostic } from "./codex";

describe("parseCodexDiagnostic", () => {
  it("preserves a verified npm launcher", () => {
    expect(
      parseCodexDiagnostic({
        status: "ready",
        path: "C:\\Users\\Ada\\AppData\\Roaming\\npm\\codex.cmd",
        source: "npm",
        version: "codex-cli 0.149.1",
        savedPath: null,
        message: null,
      }),
    ).toEqual({
      status: "ready",
      path: "C:\\Users\\Ada\\AppData\\Roaming\\npm\\codex.cmd",
      source: "npm",
      version: "codex-cli 0.149.1",
      savedPath: null,
      message: null,
    });
  });

  it("rejects unknown sources instead of trusting native payloads", () => {
    expect(() =>
      parseCodexDiagnostic({
        status: "ready",
        path: "/usr/local/bin/codex",
        source: "registry",
        version: "codex-cli 0.149.1",
        savedPath: null,
        message: null,
      }),
    ).toThrow("Unknown Codex source");
  });
});

describe("labelForCodexSource", () => {
  it("uses concise Data Plane labels", () => {
    expect(labelForCodexSource("versionManager")).toBe("VERSION MANAGER");
    expect(labelForCodexSource(null)).toBe("NOT DETECTED");
  });
});
