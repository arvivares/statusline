#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  throw new Error(`Release preflight failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function readText(relativePath) {
  return readFileSync(join(projectRoot, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function cargoPackageField(contents, field) {
  const packageSection = contents.match(
    /\[package\]([\s\S]*?)(?:\n\[|$)/u,
  )?.[1];
  const value = packageSection?.match(
    new RegExp(`^${field}\\s*=\\s*"([^"]+)"`, "mu"),
  )?.[1];
  if (!value) {
    fail(`Cargo.toml is missing package.${field}`);
  }
  return value;
}

function lockedPackageVersion(contents, packageName) {
  const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const packageBlock = contents.match(
    new RegExp(
      `\\[\\[package\\]\\]\\nname = "${escapedName}"\\nversion = "([^"]+)"`,
      "u",
    ),
  );
  if (!packageBlock) {
    fail(`Cargo.lock is missing ${packageName}`);
  }
  return packageBlock[1];
}

function assertExactTargets(actual, expected, platform) {
  assert(Array.isArray(actual), `${platform} bundle targets must be an array`);
  assert(
    actual.length === expected.length &&
      expected.every((target, index) => actual[index] === target),
    `${platform} bundle targets must be ${expected.join(", ")}`,
  );
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const windowsConfig = readJson("src-tauri/tauri.windows.conf.json");
const linuxConfig = readJson("src-tauri/tauri.linux.conf.json");
const cargoToml = readText("src-tauri/Cargo.toml");
const cargoLock = readText("src-tauri/Cargo.lock");
const capabilities = readJson("src-tauri/capabilities/default.json");
const workflow = readText("../.github/workflows/desktop-installers.yml");
const smokeWorkflow = readText(
  "../.github/workflows/desktop-installer-smoke.yml",
);
const windowsSmokeScript = readText("scripts/smoke-installers-windows.ps1");
const universalRelaySource = readText("src-tauri/src/universal_relay.rs");
const relayProtocolSource = readText("src-tauri/src/relay_protocol.rs");

const expectedName = "statusline-desktop";
const expectedProductName = "Statusline Companion";
const expectedIdentifier = "inmerzion.statusline.desktop";
const cargoName = cargoPackageField(cargoToml, "name");
const cargoVersion = cargoPackageField(cargoToml, "version");
const versions = {
  "package.json": packageJson.version,
  "package-lock.json": packageLock.version,
  "package-lock root package": packageLock.packages?.[""]?.version,
  "tauri.conf.json": tauriConfig.version,
  "Cargo.toml": cargoVersion,
  "Cargo.lock": lockedPackageVersion(cargoLock, expectedName),
};

assert(
  packageJson.name === expectedName,
  `package name must be ${expectedName}`,
);
assert(
  packageLock.name === expectedName &&
    packageLock.packages?.[""]?.name === expectedName,
  `package-lock name must be ${expectedName}`,
);
assert(
  cargoName === expectedName,
  `Cargo package name must be ${expectedName}`,
);
assert(
  tauriConfig.productName === expectedProductName,
  `product name must be ${expectedProductName}`,
);
assert(
  tauriConfig.identifier === expectedIdentifier,
  `Tauri identifier must be ${expectedIdentifier}`,
);
assert(tauriConfig.bundle?.active === true, "Tauri bundling must stay enabled");
assert(
  packageJson.author === "Inmerzion" &&
    cargoToml.includes('authors = ["Inmerzion"]'),
  "npm and Cargo publisher metadata must identify Inmerzion",
);
assert(
  packageJson.homepage === "https://github.com/arvivares/statusline" &&
    tauriConfig.bundle?.homepage === packageJson.homepage,
  "homepage metadata must point to the Statusline repository",
);
assert(
  tauriConfig.bundle?.publisher === "Inmerzion" &&
    tauriConfig.bundle?.category === "Utility" &&
    typeof tauriConfig.bundle?.copyright === "string",
  "native bundle publisher, category and copyright metadata are required",
);
assert(
  packageJson.dependencies?.["@tauri-apps/plugin-dialog"] === "2.7.2" &&
    cargoToml.includes('tauri-plugin-dialog = "=2.7.2"'),
  "the native Codex executable selector must stay version-pinned",
);
assert(
  capabilities.permissions?.includes("dialog:allow-open"),
  "the main window must explicitly allow the native open dialog",
);
assert(
  cargoToml.includes('keyring = "=4.2.0"') &&
    cargoToml.includes('reqwest = { version = "=0.13.4"') &&
    cargoToml.includes('base64 = "=0.22.1"') &&
    cargoToml.includes('ring = "=0.17.14"') &&
    cargoToml.includes('uuid = { version = "=1.26.0"'),
  "the universal encrypted relay dependencies must stay version-pinned",
);
assert(
  universalRelaySource.includes("STATUSLINE_RELAY_BASE_URL") &&
    universalRelaySource.includes("https") &&
    relayProtocolSource.includes("AES_256_GCM") &&
    relayProtocolSource.includes("statusline.snapshot.v1"),
  "the universal relay must enforce its configured endpoint and AES-GCM protocol",
);

const uniqueVersions = new Set(Object.values(versions));
assert(
  uniqueVersions.size === 1 && !uniqueVersions.has(undefined),
  `versions differ: ${Object.entries(versions)
    .map(([source, version]) => `${source}=${version}`)
    .join(", ")}`,
);

assertExactTargets(windowsConfig.bundle?.targets, ["nsis", "msi"], "Windows");
assertExactTargets(
  linuxConfig.bundle?.targets,
  ["deb", "rpm", "appimage"],
  "Linux",
);
assert(
  windowsConfig.bundle?.windows?.nsis?.installMode === "currentUser",
  "NSIS must use current-user installation",
);
assert(
  windowsConfig.bundle?.windows?.webviewInstallMode?.type ===
    "embedBootstrapper",
  "Windows must embed the WebView2 bootstrapper",
);
assert(
  linuxConfig.bundle?.linux?.appimage?.bundleMediaFramework === false,
  "AppImage must not bundle unused multimedia frameworks",
);

for (const relativePath of [
  "scripts/generate-checksums.mjs",
  "scripts/smoke-installers-windows.ps1",
  "scripts/smoke-installers-linux.sh",
  "scripts/prepare-windows-signing.ps1",
  "scripts/cleanup-windows-signing.ps1",
  "../.github/workflows/desktop-installer-smoke.yml",
  "../PRIVACY.md",
  "../SUPPORT.md",
  "../docs/release/public-beta-checklist.md",
]) {
  assert(
    existsSync(join(projectRoot, relativePath)),
    `${relativePath} is required`,
  );
}

const actionReferences = [workflow, smokeWorkflow].flatMap((contents) =>
  [...contents.matchAll(/^\s*uses:\s*([^\s#]+)/gmu)].map((match) => match[1]),
);
assert(
  actionReferences.length >= 12,
  "release workflow action references are missing",
);
assert(
  actionReferences.every((reference) => /@[0-9a-f]{40}$/u.test(reference)),
  "every release action must be pinned to an immutable commit SHA",
);
for (const requiredWorkflowToken of [
  "WINDOWS_CERTIFICATE",
  "WINDOWS_CERTIFICATE_PASSWORD",
  "WINDOWS_TIMESTAMP_URL",
  "STATUSLINE_RELAY_BASE_URL",
  "Validate universal relay service",
  "db:migrate:local",
  "Get-AuthenticodeSignature",
  "smoke-installers-windows.ps1",
  "smoke-installers-linux.sh",
  "generate-checksums.mjs",
  "SHA256SUMS.txt",
]) {
  assert(
    workflow.includes(requiredWorkflowToken),
    `release workflow is missing ${requiredWorkflowToken}`,
  );
}
for (const requiredSmokeToken of [
  "artifacts_run_id",
  "run-id:",
  "merge-multiple: true",
  "timeout-minutes: 10",
]) {
  assert(
    smokeWorkflow.includes(requiredSmokeToken),
    `installer revalidation workflow is missing ${requiredSmokeToken}`,
  );
}
for (const requiredProcessToken of [
  "ArgumentList.Add",
  "WaitForExit",
  "TimeoutSeconds",
]) {
  assert(
    windowsSmokeScript.includes(requiredProcessToken),
    `Windows smoke test is missing ${requiredProcessToken}`,
  );
}
assert(
  windowsConfig.app?.windows?.[0]?.visible === true &&
    linuxConfig.app?.windows?.[0]?.visible === true,
  "installed desktop apps must be visible on first launch",
);

const version = packageJson.version;
const releaseTag =
  process.env.GITHUB_REF_TYPE === "tag"
    ? process.env.GITHUB_REF_NAME
    : process.env.STATUSLINE_RELEASE_TAG;
if (releaseTag) {
  assert(
    releaseTag === `desktop-v${version}`,
    `tag ${releaseTag} must match desktop-v${version}`,
  );
}

console.log(
  `Release preflight passed: ${expectedProductName} ${version} (Windows + Linux).`,
);
