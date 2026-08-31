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
const macosConfig = readJson("src-tauri/tauri.macos.conf.json");
const cargoToml = readText("src-tauri/Cargo.toml");
const cargoLock = readText("src-tauri/Cargo.lock");
const capabilities = readJson("src-tauri/capabilities/default.json");
const workflow = readText("../.github/workflows/desktop-installers.yml");
const smokeWorkflow = readText(
  "../.github/workflows/desktop-installer-smoke.yml",
);
const windowsSmokeScript = readText("scripts/smoke-installers-windows.ps1");
const macosSmokeScript = readText("scripts/smoke-installer-macos.sh");
const macosSigningScript = readText("scripts/prepare-macos-signing.sh");
const macosPackageScript = readText("scripts/package-macos-pkg.sh");
const macosNotarizationScript = readText("scripts/notarize-macos-artifact.sh");
const macosSigningCleanupScript = readText("scripts/cleanup-macos-signing.sh");
const checksumScript = readText("scripts/generate-checksums.mjs");
const windowsMsiTemplate = readText(
  "src-tauri/windows/statusline-per-user.wxs",
);
const windowsNsisHooks = readText("src-tauri/windows/nsis-hooks.nsh");
const desktopLibSource = readText("src-tauri/src/lib.rs");
const desktopMainSource = readText("src/main.ts");
const desktopEntrySource = readText("src-tauri/src/main.rs");
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
assertExactTargets(macosConfig.bundle?.targets, ["dmg"], "macOS");
assert(
  windowsConfig.bundle?.windows?.nsis?.installMode === "currentUser" &&
    windowsConfig.bundle?.windows?.nsis?.installerHooks ===
      "windows/nsis-hooks.nsh" &&
    windowsNsisHooks.includes("MUI_FINISHPAGE_RUN_NOTCHECKED"),
  "NSIS must use current-user installation without default installer launch",
);
assert(
  windowsConfig.bundle?.windows?.wix?.template ===
    "windows/statusline-per-user.wxs" &&
    windowsMsiTemplate.includes('InstallScope="perUser"') &&
    windowsMsiTemplate.includes('InstallPrivileges="limited"') &&
    windowsMsiTemplate.includes('<Directory Id="LocalAppDataFolder">') &&
    windowsMsiTemplate.includes('Name="MainExecutable"') &&
    windowsMsiTemplate.includes('Root="HKCU"') &&
    !windowsMsiTemplate.includes("LaunchApplication") &&
    !windowsMsiTemplate.includes("AUTOLAUNCHAPP"),
  "MSI must install in the current user's LocalAppData without launching from Windows Installer",
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
  "scripts/smoke-installer-macos.sh",
  "scripts/prepare-macos-signing.sh",
  "scripts/package-macos-pkg.sh",
  "scripts/notarize-macos-artifact.sh",
  "scripts/cleanup-macos-signing.sh",
  "scripts/prepare-windows-signing.ps1",
  "scripts/cleanup-windows-signing.ps1",
  "src-tauri/windows/statusline-per-user.wxs",
  "src-tauri/windows/nsis-hooks.nsh",
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
assert(
  windowsSmokeScript.includes("--statusline-codex-diagnostic") &&
    windowsSmokeScript.includes("--statusline-window-smoke") &&
    windowsSmokeScript.includes("frontend-ready handshake") &&
    windowsSmokeScript.includes("Assert-CurrentUserInstall") &&
    windowsSmokeScript.includes("Programs\\OpenAI\\Codex\\bin\\codex.exe"),
  "Windows smoke tests must verify Codex discovery and frontend readiness in both installers",
);
assert(
  macosSmokeScript.includes("lipo -archs") &&
    macosSmokeScript.includes("arm64") &&
    macosSmokeScript.includes("x86_64") &&
    macosSmokeScript.includes("--statusline-codex-diagnostic") &&
    macosSmokeScript.includes("pkgutil --payload-files") &&
    macosSmokeScript.includes("Developer ID Installer:"),
  "macOS smoke tests must verify the universal DMG, PKG and Codex discovery",
);
assert(
  macosSigningScript.includes("APPLE_CERTIFICATE") &&
    macosSigningScript.includes("APPLE_INSTALLER_CERTIFICATE") &&
    macosSigningScript.includes("security create-keychain") &&
    macosSigningCleanupScript.includes("security delete-keychain"),
  "macOS signing must use an ephemeral keychain containing both Developer ID identities",
);
assert(
  macosPackageScript.includes("productbuild") &&
    macosPackageScript.includes("APPLE_INSTALLER_SIGNING_IDENTITY") &&
    macosPackageScript.includes("hdiutil attach") &&
    macosPackageScript.includes('xcrun stapler validate "$app_path"') &&
    macosNotarizationScript.includes("notarytool submit") &&
    macosNotarizationScript.includes("stapler staple") &&
    macosNotarizationScript.includes("--type install"),
  "macOS packaging must reuse the stapled app from the DMG, then sign and notarize both distributable formats",
);
assert(
  checksumScript.includes('".pkg"') && !workflow.includes("archive: false"),
  "checksum artifacts must include PKG installers and remain downloadable as standard archives",
);

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
  "APPLE_CERTIFICATE",
  "APPLE_INSTALLER_CERTIFICATE",
  "APPLE_INSTALLER_SIGNING_IDENTITY",
  "STATUSLINE_RELAY_BASE_URL",
  "Validate universal relay service",
  "db:migrate:local",
  "Get-AuthenticodeSignature",
  "Diagnose WiX linker failure",
  "retryAttempts: 0",
  "smoke-installers-windows.ps1",
  "smoke-installers-linux.sh",
  "smoke-installer-macos.sh",
  "package-macos-pkg.sh",
  "notarize-macos-artifact.sh",
  "universal-apple-darwin",
  "generate-checksums.mjs",
  "SHA256SUMS.txt",
]) {
  assert(
    workflow.includes(requiredWorkflowToken),
    `release workflow is missing ${requiredWorkflowToken}`,
  );
}
const nativeBuildStep = workflow.match(
  /\n      - name: Build native installers\n([\s\S]*?)(?=\n      - name: )/u,
)?.[1];
assert(nativeBuildStep, "release workflow is missing the native build step");
assert(
  !/^\s+APPLE_(?:ID|PASSWORD|API_KEY|API_ISSUER):/mu.test(nativeBuildStep),
  "native builds must inherit one selected notarization method instead of receiving empty Apple credential variables",
);
for (const selectedCredentialExport of [
  'echo "APPLE_API_KEY=$APPLE_API_KEY"',
  'echo "APPLE_API_ISSUER=$APPLE_API_ISSUER"',
  'echo "APPLE_API_KEY_PATH=$api_key_path"',
  'echo "APPLE_ID=$APPLE_ID"',
  'echo "APPLE_PASSWORD=$APPLE_PASSWORD"',
]) {
  assert(
    workflow.includes(selectedCredentialExport),
    `release workflow is missing the selected credential export ${selectedCredentialExport}`,
  );
}
for (const requiredSmokeToken of [
  "artifacts_run_id",
  "run-id:",
  "merge-multiple: true",
  "timeout-minutes: 10",
  "Installer checksum manifest",
  "generate-checksums.mjs",
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
  windowsConfig.app?.windows?.[0]?.visible === false &&
    windowsConfig.app?.windows?.[0]?.focus === false &&
    linuxConfig.app?.windows?.[0]?.visible === true,
  "Windows must wait for WebView readiness while Linux stays visible on first launch",
);
assert(
  desktopMainSource.includes('invoke("frontend_ready")') &&
    desktopLibSource.includes("fn frontend_ready") &&
    desktopLibSource.includes("schedule_initial_window_activation") &&
    desktopLibSource.includes("INITIAL_WINDOW_ACTIVATED") &&
    desktopEntrySource.includes("--statusline-window-smoke"),
  "Windows must reveal the main window only after the frontend-ready handshake",
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
  `Release preflight passed: ${expectedProductName} ${version} (Windows + Linux + macOS DMG/PKG).`,
);
