import { describe, expect, it } from "vitest";

import { labelForCodexSource, parseCodexDiagnostic } from "./codex";

describe("parseCodexDiagnostic", () => {
  it("accepts a runtime embedded in the desktop app", () => {
    const result = parseCodexDiagnostic({
      status: "ready",
      path: "/Applications/ChatGPT.app/Contents/Resources/codex",
      source: "desktopApp",
      version: "codex-cli 0.151.0-alpha.7.2",
      savedPath: null,
      message: null,
    });
    expect(result.source).toBe("desktopApp");
    expect(labelForCodexSource(result.source)).toBe("Desktop app");
  });
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
  it("uses concise Still Signature labels", () => {
    expect(labelForCodexSource("versionManager")).toBe("Version manager");
    expect(labelForCodexSource(null)).toBe("Not detected");
  });
});
