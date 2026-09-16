#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repository = "arvivares/statusline";
const installers = new Map([
  ["windows-nsis", "WINDOWS · EXE installer · x64"],
  ["windows-msi", "WINDOWS · MSI installer · x64"],
  ["macos-dmg", "macOS · DMG installer · Apple Silicon + Intel"],
  ["macos-pkg", "macOS · PKG installer · Apple Silicon + Intel"],
  ["macos-updater", "macOS · Automatic updater archive · Not an installer"],
  ["linux-appimage", "LINUX · AppImage · x64"],
  ["linux-deb", "LINUX · DEB package · x64 · Debian / Ubuntu"],
  ["linux-rpm", "LINUX · RPM package · x64 · Fedora / RPM-based"],
  ["android-apk", "ANDROID · APK installer"],
  ["android-aab", "ANDROID · AAB for Google Play · Not directly installable"],
]);
const verification = new Map([
  [
    "RELEASE-MANIFEST.json",
    "VERIFY · RELEASE-MANIFEST.json · Build provenance",
  ],
  ["SHA256SUMS.txt", "VERIFY · SHA256SUMS.txt · File checksums"],
  ["SHA256SUMS.txt.asc", "VERIFY · SHA256SUMS.txt.asc · Checksum signature"],
  [
    "statusline-release-signing-key.asc",
    "VERIFY · Release signing public key (.asc)",
  ],
]);

function assert(condition, message) {
  if (!condition) throw new Error(`Release labels: ${message}`);
}

export function releaseAssetLabels(manifest) {
  assert(
    manifest.schemaVersion === 1 &&
      manifest.source?.repository === repository &&
      /^v\d+\.\d+\.\d+$/u.test(manifest.tag) &&
      manifest.tag === `v${manifest.version}`,
    "unsupported manifest or repository",
  );
  assert(
    Array.isArray(manifest.assets) && manifest.assets.length > 0,
    "empty inventory",
  );
  const assets = new Map();
  for (const asset of manifest.assets) {
    assert(
      typeof asset.name === "string" &&
        /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(asset.name) &&
        !assets.has(asset.name) &&
        !verification.has(asset.name),
      "invalid or duplicate asset name",
    );
    assets.set(asset.name, asset);
  }
  function installerLabel(asset) {
    const label = installers.get(asset.kind);
    assert(label, `unsupported installer kind: ${asset.kind}`);
    if (asset.kind.startsWith("windows-")) {
      assert(
        ["unsigned-preview", "signpath"].includes(asset.windowsSigning),
        "missing Windows signing policy",
      );
      if (asset.windowsSigning === "unsigned-preview")
        return `${label} · Unsigned`;
    }
    return label;
  }
  const labels = new Map();
  for (const asset of assets.values()) {
    let label;
    if (asset.kind === "updater-manifest") {
      assert(asset.name === "updater.json", "unexpected updater manifest name");
      label = "UPDATE · updater.json · Companion update manifest";
    } else if (asset.kind.endsWith("-signature")) {
      const suffix = asset.kind === "linux-signature" ? ".asc" : ".sig";
      assert(asset.name.endsWith(suffix), "unexpected signature extension");
      const parent = assets.get(asset.name.slice(0, -suffix.length));
      assert(
        parent &&
          (asset.kind === "linux-signature"
            ? parent.kind.startsWith("linux-") && installers.has(parent.kind)
            : asset.kind === `${parent.kind}-signature`),
        "orphan or mismatched signature",
      );
      label = `VERIFY · ${installerLabel(parent)} · ${suffix} signature`;
    } else {
      label = installerLabel(asset);
    }
    labels.set(asset.name, label);
  }
  return new Map([...labels, ...verification]);
}

function githubAPI(endpoint, body) {
  const args = ["api", "--hostname", "github.com", endpoint];
  if (body) args.push("--method", "PATCH", "--input", "-");
  return JSON.parse(
    execFileSync("gh", args, {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      ...(body ? { input: JSON.stringify(body) } : {}),
    }),
  );
}

// Labels are presentation metadata only. Never send `name`, replace a payload,
// regenerate signatures, or change updater.json while applying them.
export function applyReleaseLabels(manifest, api = githubAPI) {
  const labels = releaseAssetLabels(manifest);
  const releasesEndpoint = `repos/${repository}/releases?per_page=100`;
  function readDraft() {
    const releases = api(releasesEndpoint);
    assert(Array.isArray(releases), "GitHub returned an invalid release list");
    const matches = releases.filter(
      (release) => release.tag_name === manifest.tag,
    );
    assert(matches.length === 1, "expected exactly one matching draft release");
    const [release] = matches;
    assert(
      Number.isSafeInteger(release.id) &&
        release.id > 0 &&
        release.draft === true,
      "labels can only be applied to the matching draft release",
    );
    assert(
      Array.isArray(release.assets) && release.assets.length === labels.size,
      "remote inventory differs from the verified candidate",
    );
    const names = new Set();
    const ids = new Set();
    for (const asset of release.assets) {
      assert(
        labels.has(asset.name) &&
          !names.has(asset.name) &&
          Number.isSafeInteger(asset.id) &&
          asset.id > 0 &&
          !ids.has(asset.id) &&
          asset.browser_download_url ===
            `https://github.com/${repository}/releases/download/${manifest.tag}/${asset.name}`,
        "unexpected asset identity or download URL",
      );
      names.add(asset.name);
      ids.add(asset.id);
    }
    return release;
  }
  const draft = readDraft();
  for (const asset of draft.assets) {
    const label = labels.get(asset.name);
    if (asset.label === label) continue;
    const updated = api(`repos/${repository}/releases/assets/${asset.id}`, {
      label,
    });
    assert(updated.label === label, "GitHub did not save the expected label");
    for (const field of [
      "id",
      "name",
      "browser_download_url",
      "size",
      "digest",
    ]) {
      assert(updated[field] === asset[field], `label update changed ${field}`);
    }
  }
  const finalDraft = readDraft();
  assert(finalDraft.id === draft.id, "release identity changed");
  for (const asset of finalDraft.assets) {
    const previous = draft.assets.find((item) => item.name === asset.name);
    assert(
      asset.label === labels.get(asset.name),
      "remote label verification failed",
    );
    for (const field of [
      "id",
      "name",
      "browser_download_url",
      "size",
      "digest",
    ]) {
      assert(
        asset[field] === previous[field],
        `asset changed during labeling: ${field}`,
      );
    }
  }
  return labels.size;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [, , path, ...extra] = process.argv;
  assert(
    path && extra.length === 0,
    "usage: release-asset-labels.mjs <RELEASE-MANIFEST.json>",
  );
  const manifest = JSON.parse(await readFile(path, "utf8"));
  console.log(
    `Verified ${applyReleaseLabels(manifest)} display labels; filename and URLs unchanged.`,
  );
}
