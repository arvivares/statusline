import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { prepareReleaseAssets } from "./prepare-release-assets.mjs";

const version = "0.1.10";
const fixtureNames = [
  `Statusline Companion_${version}_amd64.deb`,
  `Statusline Companion-${version}-1.x86_64.rpm`,
  `Statusline Companion_${version}_amd64.AppImage`,
  `Statusline Companion_${version}_universal.dmg`,
  `Statusline Companion_${version}_universal.pkg`,
  `Statusline_${version}_android.apk`,
  `Statusline_${version}_android.aab`,
];
const windowsFixtureNames = [
  `Statusline Companion_${version}_x64-setup.exe`,
  `Statusline Companion_${version}_x64.msi`,
];

let testRoot;

afterEach(async () => {
  if (testRoot !== undefined) {
    await rm(testRoot, { recursive: true, force: true });
    testRoot = undefined;
  }
});

async function makeFixture({ includeWindows = false } = {}) {
  testRoot = await mkdtemp(join(tmpdir(), "statusline-release-assets-"));
  const input = join(testRoot, "input");
  const output = join(testRoot, "output");
  await mkdir(input);
  const names = includeWindows
    ? [...fixtureNames, ...windowsFixtureNames]
    : fixtureNames;
  for (const name of names) {
    await writeFile(join(input, name), name);
    if (/\.(?:deb|rpm|AppImage)$/u.test(name)) {
      await writeFile(join(input, `${name}.asc`), `signature:${name}`);
    }
  }
  return { input, output };
}

function context(overrides = {}) {
  return {
    repository: "arvivares/statusline",
    commit: "a".repeat(40),
    tag: `v${version}`,
    runId: "12345",
    runAttempt: "1",
    workflowUrl: "https://github.com/arvivares/statusline/actions/runs/12345",
    ...overrides,
  };
}

describe("prepareReleaseAssets", () => {
  it("stages one complete cross-platform release and records provenance", async () => {
    const { input, output } = await makeFixture();

    const manifest = await prepareReleaseAssets({
      inputDirectory: input,
      outputDirectory: output,
      context: context(),
    });

    expect(manifest.version).toBe(version);
    expect(manifest.assets).toHaveLength(10);
    expect(manifest.source.commit).toBe("a".repeat(40));
    expect(
      manifest.assets.every((asset) => /^[0-9a-f]{64}$/u.test(asset.sha256)),
    ).toBe(true);
    const persisted = JSON.parse(
      await readFile(join(output, "RELEASE-MANIFEST.json"), "utf8"),
    );
    expect(persisted.workflow.runId).toBe(12345);
    expect(persisted.workflow.runAttempt).toBe(1);
    expect(persisted.distribution.githubReleasePlatforms).toEqual([
      "linux",
      "macos",
      "android",
    ]);
    expect(manifest.assets.every((asset) => !asset.name.includes(" "))).toBe(
      true,
    );
    expect(manifest.assets.map((asset) => asset.name)).toContain(
      `Statusline.Companion_${version}_universal.dmg`,
    );
  });

  it("fails closed when a required installer is absent", async () => {
    const { input, output } = await makeFixture();
    await rm(join(input, `Statusline Companion_${version}_universal.pkg`));

    await expect(
      prepareReleaseAssets({
        inputDirectory: input,
        outputDirectory: output,
        context: context(),
      }),
    ).rejects.toThrow("expected exactly one macos-pkg");
  });

  it("rejects assets from a different product version", async () => {
    const { input, output } = await makeFixture();
    const oldName = `Statusline_${version}_android.apk`;
    const wrongName = "Statusline_0.1.9_android.apk";
    await writeFile(join(input, wrongName), "old");
    await rm(join(input, oldName));

    await expect(
      prepareReleaseAssets({
        inputDirectory: input,
        outputDirectory: output,
        context: context(),
      }),
    ).rejects.toThrow("does not include product version");
  });

  it("rejects filenames that a release host could rewrite", async () => {
    const { input, output } = await makeFixture();
    const originalName = `Statusline_${version}_android.apk`;
    const unsafeName = `Statusline_${version}_android(backup).apk`;
    await writeFile(join(input, unsafeName), "unsafe");
    await rm(join(input, originalName));

    await expect(
      prepareReleaseAssets({
        inputDirectory: input,
        outputDirectory: output,
        context: context(),
      }),
    ).rejects.toThrow("filename is not portable across release hosts");
  });

  it("rejects a tag that does not match the release manifest", async () => {
    const { input, output } = await makeFixture();

    await expect(
      prepareReleaseAssets({
        inputDirectory: input,
        outputDirectory: output,
        context: context({ tag: "v0.1.11" }),
      }),
    ).rejects.toThrow(`tag must be v${version}`);
  });

  it("rejects an incomplete Linux signature set", async () => {
    const { input, output } = await makeFixture();
    await rm(join(input, `Statusline Companion_${version}_amd64.AppImage.asc`));

    await expect(
      prepareReleaseAssets({
        inputDirectory: input,
        outputDirectory: output,
        context: context(),
      }),
    ).rejects.toThrow("expected one detached signature");
  });

  it("rejects symbolic links in downloaded workflow artifacts", async () => {
    const { input, output } = await makeFixture();
    await symlink(
      join(input, `Statusline_${version}_android.apk`),
      join(input, "unexpected-link"),
    );

    await expect(
      prepareReleaseAssets({
        inputDirectory: input,
        outputDirectory: output,
        context: context(),
      }),
    ).rejects.toThrow("symbolic links are not allowed");
  });

  it("rejects malformed workflow provenance", async () => {
    const { input, output } = await makeFixture();

    await expect(
      prepareReleaseAssets({
        inputDirectory: input,
        outputDirectory: output,
        context: context({ runAttempt: "retry" }),
      }),
    ).rejects.toThrow("run attempt must be numeric");
  });

  it("rejects an artifact from a deferred platform", async () => {
    const { input, output } = await makeFixture({ includeWindows: true });

    await expect(
      prepareReleaseAssets({
        inputDirectory: input,
        outputDirectory: output,
        context: context(),
      }),
    ).rejects.toThrow("belongs to a platform not enabled");
  });

  it("supports the full inventory once Windows distribution is enabled", async () => {
    const { input, output } = await makeFixture({ includeWindows: true });
    const metadataPath = join(testRoot, "full-release.json");
    await writeFile(
      metadataPath,
      JSON.stringify({
        schemaVersion: 1,
        product: "Statusline",
        version,
        channel: "beta",
        tag: `v${version}`,
        distribution: {
          githubReleasePlatforms: ["windows", "linux", "macos", "android"],
          publishPrerelease: true,
        },
        components: {},
      }),
    );

    const manifest = await prepareReleaseAssets({
      inputDirectory: input,
      outputDirectory: output,
      metadataPath,
      context: context(),
    });

    expect(manifest.assets).toHaveLength(12);
  });
});
