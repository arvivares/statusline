#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  configuredUpdaterPublicKey,
  verifyUpdaterSignature,
} from "./updater-artifacts.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export async function signUpdaterFile(
  path,
  { publicKey, env = process.env } = {},
) {
  if (!env.TAURI_SIGNING_PRIVATE_KEY)
    throw new Error("TAURI_SIGNING_PRIVATE_KEY is required");
  if (!(await lstat(path)).isFile())
    throw new Error("Updater payload must be a regular file");
  const declared = JSON.parse(
    await readFile(join(projectRoot, "package.json"), "utf8"),
  );
  const installed = JSON.parse(
    await readFile(
      join(projectRoot, "node_modules/@tauri-apps/cli/package.json"),
      "utf8",
    ),
  );
  if (installed.version !== declared.devDependencies["@tauri-apps/cli"])
    throw new Error("Install the pinned Tauri CLI with npm ci before signing");
  const result = spawnSync(
    process.execPath,
    [
      join(projectRoot, "node_modules/@tauri-apps/cli/tauri.js"),
      "signer",
      "sign",
      resolve(path),
    ],
    {
      cwd: projectRoot,
      env: {
        ...env,
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD:
          env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "",
      },
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  // Never forward signer output or errors: signing subprocesses receive secrets.
  if (result.error || result.status !== 0)
    throw new Error("Tauri updater signing failed (output withheld)");
  await verifyUpdaterSignature(
    path,
    await readFile(`${path}.sig`, "utf8"),
    publicKey ?? (await configuredUpdaterPublicKey()),
  );
}

async function collect(directory, platform) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    // Tauri can retain an AppDir (with symlinks) beside the final AppImage.
    // Only enter the two known installer directories for un-staged Windows.
    if (
      platform === "windows" &&
      entry.isDirectory() &&
      ["nsis", "msi"].includes(entry.name)
    ) {
      result.push(...(await collect(path, "flat")));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      result.push(path); // signUpdaterFile rejects symlink payloads via lstat.
    }
  }
  return result;
}

export async function findUpdaterPayloads(platform, directory) {
  const patterns = {
    linux: [/\.AppImage$/u],
    windows: [/\.exe$/u, /\.msi$/u],
    macos: [/\.app\.tar\.gz$/u],
  }[platform];
  if (!patterns) throw new Error("Unknown updater platform");
  const files = await collect(resolve(directory), platform);
  return patterns.map((pattern) => {
    const matches = files.filter((path) => pattern.test(path));
    if (matches.length !== 1)
      throw new Error(
        `Expected exactly one updater payload matching ${pattern}`,
      );
    return matches[0];
  });
}

export async function signPlatformArtifacts(platform, directory) {
  const metadata = JSON.parse(
    await readFile(new URL("../../../release.json", import.meta.url), "utf8"),
  );
  if (
    process.env.RELEASE_BUILD !== "true" ||
    process.env.GITHUB_REPOSITORY !== "arvivares/statusline" ||
    process.env.GITHUB_EVENT_NAME !== "push" ||
    process.env.GITHUB_REF_TYPE !== "tag" ||
    process.env.GITHUB_REF_NAME !== metadata.tag
  ) {
    throw new Error(
      "Updater signing is restricted to the canonical tag-triggered release workflow",
    );
  }
  const payloads = await findUpdaterPayloads(platform, directory);
  const publicKey = await configuredUpdaterPublicKey();
  for (const path of payloads) await signUpdaterFile(path, { publicKey });
  console.log(
    `Signed and verified ${payloads.length} final ${platform} updater payload(s).`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [, , platform, directory, ...extra] = process.argv;
  if (!platform || !directory || extra.length)
    throw new Error(
      "Usage: sign-updater-artifacts.mjs <linux|windows|macos> <final-payload-directory>",
    );
  await signPlatformArtifacts(platform, directory);
}
