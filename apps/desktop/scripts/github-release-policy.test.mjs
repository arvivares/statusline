import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { githubReleasePolicy } from "./github-release-policy.mjs";

function runStep(workflow, name) {
  return workflow
    .split(`      - name: ${name}\n`)[1]
    .split("\n      - name:")[0]
    .split("        run: |\n")[1]
    .replace(/^ {10}/gm, "");
}

describe("GitHub release visibility", () => {
  // These finalizer jobs run on Ubuntu. Windows still runs the pure policy tests.
  it
    .skipIf(process.platform === "win32")
    .each(["release.yml", "recover-release.yml"])(
    "%s passes the intended flags to gh without a real publication",
    async (name) => {
      const workflow = await readFile(
        new URL(`../../../.github/workflows/${name}`, import.meta.url),
        "utf8",
      );
      const script = runStep(
        workflow,
        name === "release.yml"
          ? "Publish verified release"
          : "Publish recovered release",
      );
      for (const prerelease of [true, false]) {
        const result = spawnSync(
          "bash",
          [
            "-c",
            `node() { printf '%s\\n' "$TEST_POLICY"; }; gh() { printf '%s\\n' "$@"; }; ${script}`,
          ],
          {
            encoding: "utf8",
            timeout: 5000,
            env: {
              PATH: process.env.PATH,
              GITHUB_REF_NAME: "v0.1.26",
              RELEASE_TAG: "v0.1.26",
              GITHUB_REPOSITORY: "arvivares/statusline",
              TEST_POLICY: JSON.stringify(
                githubReleasePolicy({
                  distribution: { publishPrerelease: prerelease },
                }),
              ),
            },
          },
        );
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout.trim().split("\n")).toEqual([
          "release",
          "edit",
          "v0.1.26",
          "--repo",
          "arvivares/statusline",
          "--draft=false",
          `--prerelease=${prerelease}`,
          `--latest=${!prerelease}`,
        ]);
      }
    },
  );
  it("makes an explicitly public release eligible for Latest without claiming stability or signing", () => {
    const metadata = {
      channel: "beta",
      distribution: {
        publishPrerelease: false,
        windowsSigning: "unsigned-preview",
      },
    };
    expect(githubReleasePolicy(metadata)).toEqual({
      prerelease: false,
      latest: true,
    });
    expect(metadata.channel).toBe("beta");
    expect(metadata.distribution.windowsSigning).toBe("unsigned-preview");
  });
  it("preserves historical and opt-in prereleases", () => {
    expect(
      githubReleasePolicy({ distribution: { publishPrerelease: true } }),
    ).toEqual({ prerelease: true, latest: false });
  });
  it.each([undefined, null, "false", "true", 0, 1])(
    "rejects implicit or malformed visibility %s",
    (value) => {
      expect(() =>
        githubReleasePolicy({ distribution: { publishPrerelease: value } }),
      ).toThrow("explicit publishPrerelease");
    },
  );
  it.each(["release.yml", "recover-release.yml"])(
    "%s publishes only after byte verification and honors metadata",
    async (name) => {
      const workflow = await readFile(
        new URL(`../../../.github/workflows/${name}`, import.meta.url),
        "utf8",
      );
      const publish = workflow.indexOf(
        name === "release.yml"
          ? "- name: Publish verified release"
          : "- name: Publish recovered release",
      );
      expect(publish).toBeGreaterThan(
        workflow.indexOf("verify-release-download.mjs"),
      );
      expect(workflow.indexOf("verify-release-download.mjs")).toBeGreaterThan(
        0,
      );
      const finalizer = workflow.slice(publish);
      expect(finalizer).toContain("github-release-policy.mjs");
      expect(finalizer).toContain('--prerelease="$prerelease"');
      expect(finalizer).toContain('--latest="$latest"');
      expect(finalizer).not.toContain("--latest=false");
      expect(finalizer).toContain("repos/$GITHUB_REPOSITORY/releases/latest");
      expect(workflow).toContain(
        "Release must remain a draft prerelease until verification completes.",
      );
    },
  );
});
