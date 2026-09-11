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

import { prepareReleaseAssets as prepare } from "./prepare-release-assets.mjs";
import { updaterTestKey } from "./updater-test-fixtures.mjs";
import { buildUpdaterVerifier } from "./build-updater-verifier.mjs";

buildUpdaterVerifier();
const updaterKey = updaterTestKey();
function prepareReleaseAssets(options) {
  return prepare({ ...options, publicKey: updaterKey.pubkey });
}

const { version } = JSON.parse(
  await readFile(new URL("../../../release.json", import.meta.url), "utf8"),
);
const fixtureNames = [
  `Statusline Companion_${version}_amd64.deb`,
  `Statusline Companion-${version}-1.x86_64.rpm`,
  `Statusline Companion_${version}_amd64.AppImage`,
  `Statusline Companion_${version}_universal.dmg`,
  `Statusline Companion_${version}_universal.pkg`,
  `Statusline Companion_${version}_universal.app.tar.gz`,
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

async function makeFixture({ includeWindows = true } = {}) {
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
    if (/\.(?:AppImage|exe|msi|app\.tar\.gz)$/u.test(name)) {
      await writeFile(join(input, `${name}.sig`), updaterKey.signature(name));
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
    expect(manifest.assets).toHaveLength(18);
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
      "windows",
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

  it("rejects a version that only contains the expected version as a prefix", async () => {
    const { input, output } = await makeFixture();
    const oldName = `Statusline_${version}_android.apk`;
    await rm(join(input, oldName));
    await writeFile(
      join(input, `Statusline_${version}0_android.apk`),
      "wrong version",
    );
    await expect(
      prepareReleaseAssets({
        inputDirectory: input,
        outputDirectory: output,
        context: context(),
      }),
    ).rejects.toThrow("does not include product version");
  });

  it("rejects a tag that does not match the release manifest", async () => {
    const { input, output } = await makeFixture();

    await expect(
      prepareReleaseAssets({
        inputDirectory: input,
        outputDirectory: output,
        context: context({ tag: `v${version}-mismatch` }),
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
    const metadataPath = join(testRoot, "unix-release.json");
    await writeFile(
      metadataPath,
      JSON.stringify({
        version,
        tag: `v${version}`,
        distribution: { githubReleasePlatforms: ["linux", "macos", "android"] },
      }),
    );

    await expect(
      prepareReleaseAssets({
        inputDirectory: input,
        outputDirectory: output,
        metadataPath,
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
          windowsSigning: "signpath",
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

    expect(manifest.assets).toHaveLength(18);
    expect(
      manifest.assets
        .filter((asset) => asset.platform === "windows")
        .every(
          (asset) =>
            asset.windowsSigning === "signpath" &&
            !asset.name.includes(".unsigned."),
        ),
    ).toBe(true);
  });

  it("labels only Windows preview assets and records the unsigned policy", async () => {
    const { input, output } = await makeFixture();
    const manifest = await prepareReleaseAssets({
      inputDirectory: input,
      outputDirectory: output,
      context: context(),
    });
    const windows = manifest.assets.filter(
      (asset) => asset.platform === "windows",
    );
    expect(windows.map((asset) => asset.name).sort()).toEqual([
      `Statusline.Companion_${version}_x64-setup.unsigned.exe`,
      `Statusline.Companion_${version}_x64-setup.unsigned.exe.sig`,
      `Statusline.Companion_${version}_x64.unsigned.msi`,
      `Statusline.Companion_${version}_x64.unsigned.msi.sig`,
    ]);
    expect(
      windows.every((asset) => asset.windowsSigning === "unsigned-preview"),
    ).toBe(true);
    expect(
      manifest.assets
        .filter((asset) => asset.platform !== "windows")
        .every(
          (asset) =>
            asset.windowsSigning === undefined &&
            !asset.name.includes(".unsigned."),
        ),
    ).toBe(true);
  });

  it("preserves unsigned filenames when recovering an already staged candidate", async () => {
    const { input, output } = await makeFixture();
    const first = await prepareReleaseAssets({
      inputDirectory: input,
      outputDirectory: output,
      context: context(),
    });
    const recovered = await prepareReleaseAssets({
      inputDirectory: output,
      outputDirectory: join(testRoot, "recovered"),
      context: context(),
    });
    expect(recovered).toEqual(first);
  });

  it("refuses to relabel unsigned preview assets as a signed release", async () => {
    const { input, output } = await makeFixture();
    await prepareReleaseAssets({
      inputDirectory: input,
      outputDirectory: output,
      context: context(),
    });
    const metadataPath = join(testRoot, "signed-release.json");
    const metadata = JSON.parse(
      await readFile(new URL("../../../release.json", import.meta.url), "utf8"),
    );
    metadata.distribution.windowsSigning = "signpath";
    await writeFile(metadataPath, JSON.stringify(metadata));
    await expect(
      prepareReleaseAssets({
        inputDirectory: output,
        outputDirectory: join(testRoot, "signed"),
        metadataPath,
        context: context(),
      }),
    ).rejects.toThrow(
      "unsigned preview filenames cannot enter a signed Windows release",
    );
  });

  it("requires both Windows installers in preview mode", async () => {
    const { input, output } = await makeFixture();
    await rm(join(input, windowsFixtureNames[1]));
    await expect(
      prepareReleaseAssets({
        inputDirectory: input,
        outputDirectory: output,
        context: context(),
      }),
    ).rejects.toThrow("expected exactly one windows-msi");
  });

  it("creates only the five supported updater targets with final portable names and inline signatures", async () => {
    const { input, output } = await makeFixture();
    const manifest = await prepareReleaseAssets({
      inputDirectory: input,
      outputDirectory: output,
      context: context(),
    });
    const updater = JSON.parse(
      await readFile(join(output, "updater.json"), "utf8"),
    );
    expect(updater.version).toBe(version);
    expect(updater.channel).toBe("beta");
    expect(Object.keys(updater.platforms)).toEqual([
      "darwin-aarch64",
      "darwin-x86_64",
      "windows-x86_64-nsis",
      "windows-x86_64-msi",
      "linux-x86_64-appimage",
    ]);
    expect(updater.platforms["darwin-aarch64"]).toEqual(
      updater.platforms["darwin-x86_64"],
    );
    expect(updater.platforms["windows-x86_64-msi"].url).toBe(
      `https://github.com/arvivares/statusline/releases/download/v${version}/Statusline.Companion_${version}_x64.unsigned.msi`,
    );
    for (const entry of Object.values(updater.platforms)) {
      const name = new URL(entry.url).pathname.split("/").at(-1);
      expect(entry.signature).toBe(
        await readFile(join(output, `${name}.sig`), "utf8"),
      );
    }
    expect(
      manifest.assets.some(
        (asset) =>
          asset.name === "updater.json" && asset.kind === "updater-manifest",
      ),
    ).toBe(true);
  });

  it("does not publish an updater manifest when any signature is missing", async () => {
    const { input, output } = await makeFixture();
    await rm(join(input, `${windowsFixtureNames[0]}.sig`));
    await expect(
      prepareReleaseAssets({
        inputDirectory: input,
        outputDirectory: output,
        context: context(),
      }),
    ).rejects.toThrow("expected one updater signature");
    await expect(readFile(join(output, "updater.json"))).rejects.toThrow();
  });

  it("rejects signatures copied to a different asset name and leaves the updater unpublished", async () => {
    const { input, output } = await makeFixture();
    await writeFile(
      join(input, `${windowsFixtureNames[1]}.sig`),
      await readFile(join(input, `${windowsFixtureNames[0]}.sig`)),
    );
    await expect(
      prepareReleaseAssets({
        inputDirectory: input,
        outputDirectory: output,
        context: context(),
      }),
    ).rejects.toThrow("signature verification failed");
    await expect(readFile(join(output, "updater.json"))).rejects.toThrow();
  });

  it("rejects orphan updater signatures", async () => {
    const { input, output } = await makeFixture();
    await writeFile(join(input, "orphan.exe.sig"), "unused");
    await expect(
      prepareReleaseAssets({
        inputDirectory: input,
        outputDirectory: output,
        context: context(),
      }),
    ).rejects.toThrow("orphan updater signature");
  });

  it("rejects recovery when updater metadata disagrees with its verified artifacts", async () => {
    const { input, output } = await makeFixture();
    await prepareReleaseAssets({
      inputDirectory: input,
      outputDirectory: output,
      context: context(),
    });
    const updater = JSON.parse(
      await readFile(join(output, "updater.json"), "utf8"),
    );
    updater.platforms["windows-x86_64-msi"].url =
      "https://example.com/other.msi";
    await writeFile(
      join(output, "updater.json"),
      `${JSON.stringify(updater, null, 2)}\n`,
    );
    await expect(
      prepareReleaseAssets({
        inputDirectory: output,
        outputDirectory: join(testRoot, "recovered"),
        context: context(),
      }),
    ).rejects.toThrow("recovered updater manifest differs");
  });
});
