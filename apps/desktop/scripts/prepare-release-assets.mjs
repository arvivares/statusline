#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../..");

const availableKinds = new Map([
  ["windows-nsis", ".exe"],
  ["windows-msi", ".msi"],
  ["linux-deb", ".deb"],
  ["linux-rpm", ".rpm"],
  ["linux-appimage", ".appimage"],
  ["macos-dmg", ".dmg"],
  ["macos-pkg", ".pkg"],
  ["android-apk", ".apk"],
  ["android-aab", ".aab"],
]);

const extensionToKind = new Map(
  [...availableKinds].map(([kind, extension]) => [extension, kind]),
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Release asset validation failed: ${message}`);
  }
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `symbolic links are not allowed: ${path}`);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function classify(path) {
  return extensionToKind.get(extname(path).toLowerCase());
}

function platformFor(kind) {
  return kind.split("-", 1)[0];
}

function sha256(path) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", rejectHash);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function validateContext(context, metadata) {
  assert(/^[0-9a-f]{40}$/u.test(context.commit), "commit must be a full SHA");
  assert(/^\d+$/u.test(context.runId), "run ID must be numeric");
  assert(/^\d+$/u.test(context.runAttempt), "run attempt must be numeric");
  assert(context.tag === metadata.tag, `tag must be ${metadata.tag}`);
  assert(
    context.repository === "arvivares/statusline",
    "release provenance must originate from arvivares/statusline",
  );
  assert(
    context.workflowUrl ===
      `https://github.com/${context.repository}/actions/runs/${context.runId}`,
    "workflow URL does not match repository and run ID",
  );
}

export async function prepareReleaseAssets({
  inputDirectory,
  outputDirectory,
  metadataPath = join(repositoryRoot, "release.json"),
  context,
}) {
  const input = resolve(inputDirectory);
  const output = resolve(outputDirectory);
  assert(input !== output, "input and output directories must differ");

  const metadata = JSON.parse(await readFile(resolve(metadataPath), "utf8"));
  validateContext(context, metadata);
  const releasePlatforms = metadata.distribution?.githubReleasePlatforms;
  assert(
    Array.isArray(releasePlatforms) && releasePlatforms.length > 0,
    "release.json must declare at least one GitHub Release platform",
  );
  assert(
    new Set(releasePlatforms).size === releasePlatforms.length,
    "GitHub Release platforms must be unique",
  );
  const expectedKinds = new Map(
    [...availableKinds].filter(([kind]) =>
      releasePlatforms.includes(platformFor(kind)),
    ),
  );
  assert(
    expectedKinds.size > 0 &&
      releasePlatforms.every((platform) =>
        [...availableKinds].some(([kind]) => platformFor(kind) === platform),
      ),
    "release.json contains an unsupported GitHub Release platform",
  );

  await mkdir(output, { recursive: true });
  const existingOutput = await readdir(output);
  assert(existingOutput.length === 0, "output directory must be empty");

  const files = await collectFiles(input);
  const distributables = files.filter((path) => classify(path) !== undefined);
  const byKind = new Map();
  const seenNames = new Set();

  for (const path of distributables) {
    const name = basename(path);
    const kind = classify(path);
    assert(!seenNames.has(name), `duplicate filename: ${name}`);
    assert(
      expectedKinds.has(kind),
      `${name} belongs to a platform not enabled for ${metadata.tag}`,
    );
    assert(
      name.includes(metadata.version),
      `${name} does not include product version ${metadata.version}`,
    );
    seenNames.add(name);
    const matching = byKind.get(kind) ?? [];
    matching.push(path);
    byKind.set(kind, matching);
  }

  for (const [kind] of expectedKinds) {
    const matches = byKind.get(kind) ?? [];
    assert(
      matches.length === 1,
      `expected exactly one ${kind}, found ${matches.length}`,
    );
  }
  assert(
    distributables.length === expectedKinds.size,
    `expected ${expectedKinds.size} distributables, found ${distributables.length}`,
  );

  const linuxInstallers = distributables.filter((path) =>
    classify(path).startsWith("linux-"),
  );
  const signatures = [];
  for (const installer of linuxInstallers) {
    const signatureName = `${basename(installer)}.asc`;
    const matches = files.filter((path) => basename(path) === signatureName);
    assert(
      matches.length === 1,
      `expected one detached signature for ${basename(installer)}, found ${matches.length}`,
    );
    signatures.push(matches[0]);
  }

  const assetRecords = [];
  const stagedNames = new Set();
  for (const source of [...distributables, ...signatures].sort((left, right) =>
    basename(left).localeCompare(basename(right), "en"),
  )) {
    const name = basename(source);
    assert(!stagedNames.has(name), `duplicate filename: ${name}`);
    stagedNames.add(name);
    const destination = join(output, name);
    await copyFile(source, destination);
    const fileStat = await stat(destination);
    const kind = classify(source) ?? "linux-signature";
    assetRecords.push({
      name,
      platform: kind === "linux-signature" ? "linux" : platformFor(kind),
      kind,
      bytes: fileStat.size,
      sha256: await sha256(destination),
    });
  }

  const manifest = {
    schemaVersion: 1,
    product: metadata.product,
    version: metadata.version,
    channel: metadata.channel,
    tag: context.tag,
    distribution: metadata.distribution,
    components: metadata.components,
    source: {
      repository: context.repository,
      commit: context.commit,
    },
    workflow: {
      runId: Number(context.runId),
      runAttempt: Number(context.runAttempt),
      url: context.workflowUrl,
    },
    assets: assetRecords,
  };

  const manifestPath = join(output, "RELEASE-MANIFEST.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

async function main() {
  const [, , inputDirectory, outputDirectory] = process.argv;
  if (!inputDirectory || !outputDirectory) {
    throw new Error(
      "Usage: node prepare-release-assets.mjs <input-directory> <output-directory>",
    );
  }

  const context = {
    repository: process.env.GITHUB_REPOSITORY ?? "",
    commit: process.env.GITHUB_SHA ?? "",
    tag: process.env.GITHUB_REF_NAME ?? "",
    runId: process.env.GITHUB_RUN_ID ?? "",
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "1",
    workflowUrl: `https://github.com/${process.env.GITHUB_REPOSITORY ?? ""}/actions/runs/${process.env.GITHUB_RUN_ID ?? ""}`,
  };
  const manifest = await prepareReleaseAssets({
    inputDirectory,
    outputDirectory,
    context,
  });
  console.log(
    `Prepared ${manifest.assets.length} verified assets for ${manifest.tag}.`,
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
