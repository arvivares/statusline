#!/usr/bin/env node

import { readFileSync } from "node:fs";
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
