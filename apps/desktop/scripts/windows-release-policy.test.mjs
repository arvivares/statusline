import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { windowsReleasePolicy } from "./windows-release-policy.mjs";

function metadata(mode, overrides = {}) {
  return {
    channel: "beta",
    distribution: {
      githubReleasePlatforms: ["windows", "linux", "macos", "android"],
      publishPrerelease: true,
      windowsSigning: mode,
    },
    ...overrides,
  };
}

describe("Windows release policy", () => {
  it("supports an explicit unsigned beta without weakening signed mode", () => {
    expect(windowsReleasePolicy(metadata("unsigned-preview"))).toBe(
      "unsigned-preview",
    );
    expect(windowsReleasePolicy(metadata("signpath"))).toBe("signpath");
  });

  it.each([undefined, null, false, "", "unsigned", "auto"])(
    "rejects unknown or implicit mode %s",
    (mode) => {
      expect(() => windowsReleasePolicy(metadata(mode))).toThrow(
        "requires explicit",
      );
    },
  );

  it("forbids unsigned installers in stable releases", () => {
    expect(() =>
      windowsReleasePolicy(metadata("unsigned-preview", { channel: "stable" })),
    ).toThrow("restricted to beta prereleases");
    const data = metadata("unsigned-preview");
    data.distribution.publishPrerelease = false;
    expect(() => windowsReleasePolicy(data)).toThrow(
      "restricted to beta prereleases",
    );
  });

  it("rejects an enabled platform also marked deferred", () => {
    const data = metadata("unsigned-preview");
    data.distribution.deferred = { windows: "awaiting-signpath-foundation" };
    expect(() => windowsReleasePolicy(data)).toThrow(
      "both enabled and deferred",
    );
  });

  it("requires no signing override when Windows is not distributed", () => {
    const data = metadata("unsigned-preview");
    data.distribution.githubReleasePlatforms = ["linux", "macos", "android"];
    expect(() => windowsReleasePolicy(data)).toThrow(
      "requires Windows distribution",
    );
    delete data.distribution.windowsSigning;
    expect(windowsReleasePolicy(data)).toBe("disabled");
  });

  it("fails closed when release platforms are missing", () => {
    expect(() => windowsReleasePolicy({})).toThrow(
      "explicit release platforms",
    );
  });

  it("keeps unsigned uploads after signature-status and install smoke checks", async () => {
    const workflow = await readFile(
      new URL(
        "../../../.github/workflows/desktop-installers.yml",
        import.meta.url,
      ),
      "utf8",
    );
    expect(workflow).toContain("uploadWorkflowArtifacts: false");
    const verify = workflow.indexOf(
      "- name: Verify unsigned Windows preview identity",
    );
    const smoke = workflow.indexOf(
      "- name: Smoke test unsigned Windows preview installers",
    );
    const upload = workflow.indexOf(
      "- name: Upload tested unsigned Windows preview installers",
    );
    expect(verify).toBeGreaterThan(0);
    expect(smoke).toBeGreaterThan(verify);
    expect(upload).toBeGreaterThan(smoke);
    expect(workflow).toContain(
      "Windows signing input does not match release.json",
    );
    const verifier = await readFile(
      new URL("./verify-windows-preview.ps1", import.meta.url),
      "utf8",
    );
    expect(verifier).toContain("Get-AuthenticodeSignature");
    expect(verifier).toContain("$signature.Status -ne 'NotSigned'");
  });
});
