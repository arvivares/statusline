import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  applyReleaseLabels,
  releaseAssetLabels,
} from "./release-asset-labels.mjs";

function fixture() {
  const pairs = [
    ["windows-nsis", "Statusline.Companion_0.1.26_x64-setup.unsigned.exe"],
    ["windows-msi", "Statusline.Companion_0.1.26_x64_es-ES.unsigned.msi"],
    ["macos-dmg", "Statusline.Companion_0.1.26_universal.dmg"],
    ["macos-pkg", "Statusline.Companion_0.1.26_universal.pkg"],
    ["macos-updater", "Statusline.Companion_0.1.26_universal.app.tar.gz"],
    ["linux-appimage", "Statusline.Companion_0.1.26_amd64.AppImage"],
    ["linux-deb", "Statusline.Companion_0.1.26_amd64.deb"],
    ["linux-rpm", "Statusline.Companion-0.1.26-1.x86_64.rpm"],
    ["android-apk", "Statusline_0.1.26_android.apk"],
    ["android-aab", "Statusline_0.1.26_android.aab"],
  ];
  const assets = pairs.map(([kind, name]) => ({
    kind,
    name,
    ...(kind.startsWith("windows-")
      ? { windowsSigning: "unsigned-preview" }
      : {}),
  }));
  for (const asset of [...assets]) {
    if (asset.kind.startsWith("linux-"))
      assets.push({ name: `${asset.name}.asc`, kind: "linux-signature" });
    if (
      [
        "windows-nsis",
        "windows-msi",
        "macos-updater",
        "linux-appimage",
      ].includes(asset.kind)
    ) {
      assets.push({
        name: `${asset.name}.sig`,
        kind: `${asset.kind}-signature`,
      });
    }
  }
  assets.push({ name: "updater.json", kind: "updater-manifest" });
  return {
    schemaVersion: 1,
    tag: "v0.1.26",
    version: "0.1.26",
    source: { repository: "arvivares/statusline" },
    assets,
  };
}

function fakeGitHub(manifest) {
  const draft = {
    id: 1234,
    tag_name: manifest.tag,
    draft: true,
    assets: [...releaseAssetLabels(manifest).keys()].map((name, index) => ({
      id: index + 1,
      name,
      label: null,
      size: 100 + index,
      digest: `sha256:${"a".repeat(64)}`,
      browser_download_url: `https://github.com/arvivares/statusline/releases/download/${manifest.tag}/${name}`,
    })),
  };
  const patches = [];
  function api(endpoint, body) {
    if (body) {
      expect(endpoint).toMatch(
        /^repos\/arvivares\/statusline\/releases\/assets\/\d+$/u,
      );
      patches.push(body);
      const asset = draft.assets.find(
        (item) => item.id === Number(endpoint.split("/").at(-1)),
      );
      Object.assign(asset, body);
      return structuredClone(asset);
    }
    expect(endpoint).toBe(
      `repos/arvivares/statusline/releases/tags/${manifest.tag}`,
    );
    return structuredClone(draft);
  }
  return { draft, patches, api };
}

describe("release asset display labels", () => {
  it("labels all 22 assets without changing the manifest or updater filenames", () => {
    const manifest = fixture();
    const before = JSON.stringify(manifest);
    const labels = releaseAssetLabels(manifest);
    expect(labels.size).toBe(22);
    expect(
      labels.get("Statusline.Companion_0.1.26_x64-setup.unsigned.exe"),
    ).toBe("WINDOWS · EXE installer · x64 · Unsigned");
    expect(labels.get("Statusline.Companion_0.1.26_universal.dmg")).toContain(
      "Apple Silicon + Intel",
    );
    expect(labels.get("Statusline_0.1.26_android.aab")).toContain(
      "Not directly installable",
    );
    expect(
      labels.get("Statusline.Companion_0.1.26_amd64.AppImage.asc"),
    ).toContain("VERIFY · LINUX");
    expect(
      labels.get("Statusline.Companion_0.1.26_amd64.AppImage.sig"),
    ).toContain(".sig signature");
    expect(new Set(labels.values()).size).toBe(labels.size);
    expect(JSON.stringify(manifest)).toBe(before);
  });

  it("sends only label in PATCH, preserves payload identities, and is idempotent", () => {
    const manifest = fixture();
    const remote = fakeGitHub(manifest);
    const before = structuredClone(remote.draft.assets);
    expect(applyReleaseLabels(manifest, remote.api)).toBe(22);
    expect(remote.patches).toHaveLength(22);
    expect(
      remote.patches.every((body) => Object.keys(body).join() === "label"),
    ).toBe(true);
    expect(
      remote.draft.assets.map((asset) => ({ ...asset, label: null })),
    ).toEqual(before);
    expect(applyReleaseLabels(manifest, remote.api)).toBe(22);
    expect(remote.patches).toHaveLength(22);
  });

  it("does not label signed Windows installers as unsigned previews", () => {
    const manifest = fixture();
    for (const asset of manifest.assets)
      if (asset.windowsSigning) asset.windowsSigning = "signpath";
    expect(
      [...releaseAssetLabels(manifest).values()].some((label) =>
        label.includes("Unsigned"),
      ),
    ).toBe(false);
  });

  it.each([
    (m) => {
      m.source.repository = "someone/else";
    },
    (m) => {
      m.tag = "v0.1.25";
    },
    (m) => {
      m.assets[0].name = "../../bad.exe";
    },
    (m) => {
      m.assets.push(m.assets[0]);
    },
    (m) => {
      m.assets[0].kind = "unknown";
    },
    (m) => {
      delete m.assets[0].windowsSigning;
    },
    (m) => {
      m.assets = m.assets.filter((asset) => asset.kind !== "windows-nsis");
    },
  ])("rejects invalid manifests before calling GitHub (%#)", (mutate) => {
    const manifest = fixture();
    mutate(manifest);
    let calls = 0;
    expect(() =>
      applyReleaseLabels(manifest, () => {
        calls++;
      }),
    ).toThrow();
    expect(calls).toBe(0);
  });

  it.each([
    (r) => {
      r.draft = false;
    },
    (r) => {
      r.tag_name = "v0.1.25";
    },
    (r) => {
      r.assets.pop();
    },
    (r) => {
      r.assets[0].browser_download_url = "https://example.org/file.exe";
    },
    (r) => {
      r.assets[0].id = r.assets[1].id;
    },
    (r) => {
      r.assets[0] = structuredClone(r.assets[1]);
    },
  ])(
    "rejects published or mismatched releases without mutations (%#)",
    (mutate) => {
      const manifest = fixture();
      const remote = fakeGitHub(manifest);
      mutate(remote.draft);
      expect(() => applyReleaseLabels(manifest, remote.api)).toThrow();
      expect(remote.patches).toHaveLength(0);
    },
  );

  it.each(["name", "browser_download_url", "size", "digest", "id"])(
    "fails if GitHub changes %s while saving labels",
    (field) => {
      const manifest = fixture();
      const remote = fakeGitHub(manifest);
      expect(() =>
        applyReleaseLabels(manifest, (endpoint, body) => {
          const response = remote.api(endpoint, body);
          if (body) response[field] = "changed";
          return response;
        }),
      ).toThrow(`label update changed ${field}`);
    },
  );

  it("verifies persisted labels after all writes", () => {
    const manifest = fixture();
    const remote = fakeGitHub(manifest);
    let reads = 0;
    expect(() =>
      applyReleaseLabels(manifest, (endpoint, body) => {
        const response = remote.api(endpoint, body);
        if (!body && ++reads === 2) response.assets[0].label = null;
        return response;
      }),
    ).toThrow("remote label verification failed");
  });

  it.each(["release.yml", "recover-release.yml"])(
    "%s verifies labels after bytes and before publication",
    async (name) => {
      const workflow = await readFile(
        new URL(`../../../.github/workflows/${name}`, import.meta.url),
        "utf8",
      );
      const step = workflow.indexOf(
        "node apps/desktop/scripts/release-asset-labels.mjs",
      );
      expect(step).toBeGreaterThan(
        workflow.indexOf(
          "node apps/desktop/scripts/verify-release-download.mjs",
        ),
      );
      expect(step).toBeLessThan(
        workflow.indexOf(
          name === "release.yml"
            ? "- name: Publish verified release"
            : "- name: Publish recovered release",
        ),
      );
    },
  );
});
