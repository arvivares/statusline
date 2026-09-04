#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
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

function cargoDependencySpec(contents, dependency) {
  const escapedDependency = dependency.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const dependencySpec = contents.match(
    new RegExp(`^${escapedDependency}\\s*=\\s*(.+)$`, "mu"),
  )?.[1];
  if (!dependencySpec) {
    fail(`Cargo.toml is missing dependency ${dependency}`);
  }
  return dependencySpec.trim();
}

function exactCargoDependencyVersion(contents, dependency) {
  const dependencySpec = cargoDependencySpec(contents, dependency);
  const version =
    dependencySpec.match(/^"=([^"]+)"$/u)?.[1] ??
    dependencySpec.match(/\bversion\s*=\s*"=([^"]+)"/u)?.[1];
  if (!version) {
    fail(`${dependency} must use an exact Cargo version`);
  }
  return version;
}

function isExactPackageVersion(version) {
  return (
    typeof version === "string" &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)
  );
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
const macosInfoPlist = readText("src-tauri/Info.macos.plist");
const cargoToml = readText("src-tauri/Cargo.toml");
const cargoLock = readText("src-tauri/Cargo.lock");
const capabilities = readJson("src-tauri/capabilities/default.json");
const releaseMetadata = readJson("../../release.json");
const workflow = readText("../../.github/workflows/desktop-installers.yml");
const releaseWorkflow = readText("../../.github/workflows/release.yml");
const androidWorkflow = readText("../../.github/workflows/android.yml");
const smokeWorkflow = readText(
  "../../.github/workflows/desktop-installer-smoke.yml",
);
const windowsSmokeScript = readText("scripts/smoke-installers-windows.ps1");
const linuxSigningPreparationScript = readText(
  "scripts/prepare-linux-signing.sh",
);
const linuxSigningScript = readText("scripts/sign-linux-files.sh");
const linuxSignatureVerificationScript = readText(
  "scripts/verify-linux-signatures.sh",
);
const linuxSigningCleanupScript = readText("scripts/cleanup-linux-signing.sh");
const linuxPublicKey = readText(
  "../../packaging/linux/statusline-release-signing-key.asc",
);
const macosSmokeScript = readText("scripts/smoke-installer-macos.sh");
const macosSigningScript = readText("scripts/prepare-macos-signing.sh");
const macosPackageScript = readText("scripts/package-macos-pkg.sh");
const macosNotarizationScript = readText("scripts/notarize-macos-artifact.sh");
const macosSigningCleanupScript = readText("scripts/cleanup-macos-signing.sh");
const checksumScript = readText("scripts/generate-checksums.mjs");
const releaseAssetScript = readText("scripts/prepare-release-assets.mjs");
const windowsSignPathScript = readText(
  "scripts/windows-signpath-artifacts.ps1",
);
const windowsSignatureVerificationScript = readText(
  "scripts/verify-windows-signatures.ps1",
);
const detachedSignatureVerificationScript = readText(
  "scripts/verify-detached-signature.sh",
);
const windowsMsiTemplate = readText(
  "src-tauri/windows/statusline-per-user.wxs",
);
const windowsNsisHooks = readText("src-tauri/windows/nsis-hooks.nsh");
const desktopLibSource = readText("src-tauri/src/lib.rs");
const desktopMainSource = readText("src/main.ts");
const desktopEntrySource = readText("src-tauri/src/main.rs");
const universalRelaySource = readText("src-tauri/src/universal_relay.rs");
const relayProtocolSource = readText("src-tauri/src/relay_protocol.rs");
const rootReadme = readText("../../README.md");
const spanishReadme = readText("../../README.es.md");
const roadmap = readText("../../ROADMAP.md");
const codeOwners = readText("../../.github/CODEOWNERS");
const securityPolicy = readText("../../SECURITY.md");
const codeSigningPolicy = readText(
  "../../docs/security/code-signing-policy.md",
);
const releaseRunbook = readText("../../docs/release/release-runbook.md");
const releaseNotes = readText(`../../${releaseMetadata.notes}`);
const androidGradle = readText("../android/app/build.gradle.kts");
const appleProject = readText("../apple/statusline.xcodeproj/project.pbxproj");

const expectedName = "statusline-desktop";
const expectedProductName = "Statusline Companion";
const expectedIdentifier = "inmerzion.statusline.desktop";
const dialogPackageName = "@tauri-apps/plugin-dialog";
const cargoName = cargoPackageField(cargoToml, "name");
const cargoVersion = cargoPackageField(cargoToml, "version");
const cargoLicense = cargoPackageField(cargoToml, "license");
const dialogPackageVersion = packageJson.dependencies?.[dialogPackageName];
const dialogCargoVersion = exactCargoDependencyVersion(
  cargoToml,
  "tauri-plugin-dialog",
);
const base64Spec = cargoDependencySpec(cargoToml, "base64");
const versions = {
  "release.json": releaseMetadata.version,
  "release.json desktop": releaseMetadata.components?.desktop?.version,
  "package.json": packageJson.version,
  "package-lock.json": packageLock.version,
  "package-lock root package": packageLock.packages?.[""]?.version,
  "tauri.conf.json": tauriConfig.version,
  "Cargo.toml": cargoVersion,
  "Cargo.lock": lockedPackageVersion(cargoLock, expectedName),
};

const androidVersionName = androidGradle.match(
  /^\s*versionName\s*=\s*"([^"]+)"/mu,
)?.[1];
const androidVersionCode = Number(
  androidGradle.match(/^\s*versionCode\s*=\s*(\d+)/mu)?.[1],
);
const iosApplicationBuildSettings = [
  ...appleProject.matchAll(/buildSettings = \{([\s\S]*?)^\s*\};/gmu),
]
  .map((match) => match[1])
  .filter((settings) =>
    /^\s*PRODUCT_BUNDLE_IDENTIFIER = inmerzion\.statusline;$/mu.test(settings),
  )
  .map((settings) => ({
    build: settings.match(/^\s*CURRENT_PROJECT_VERSION = (\d+);$/mu)?.[1],
    version: settings.match(/^\s*MARKETING_VERSION = ([^;]+);$/mu)?.[1],
  }));

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
  packageJson.license === "MIT" &&
    packageLock.packages?.[""]?.license === "MIT" &&
    cargoLicense === "MIT",
  "npm, package-lock and Cargo metadata must declare MIT",
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
  isExactPackageVersion(dialogPackageVersion) &&
    packageLock.packages?.[""]?.dependencies?.[dialogPackageName] ===
      dialogPackageVersion &&
    packageLock.packages?.[`node_modules/${dialogPackageName}`]?.version ===
      dialogPackageVersion &&
    dialogCargoVersion === dialogPackageVersion &&
    lockedPackageVersion(cargoLock, "tauri-plugin-dialog") ===
      dialogPackageVersion,
  "the native Codex executable selector must use matching exact JS and Rust versions",
);
assert(
  capabilities.permissions?.includes("dialog:allow-open"),
  "the main window must explicitly allow the native open dialog",
);
for (const dependency of ["keyring", "reqwest", "base64", "ring", "uuid"]) {
  exactCargoDependencyVersion(cargoToml, dependency);
}
assert(
  /\bdefault-features\s*=\s*false\b/u.test(base64Spec) &&
    /\bfeatures\s*=\s*\[\s*"std"\s*\]/u.test(base64Spec),
  "base64 must keep its safe standard implementation without simd-unsafe",
);
assert(
  universalRelaySource.includes("STATUSLINE_RELAY_BASE_URL") &&
    universalRelaySource.includes("https") &&
    relayProtocolSource.includes("AES_256_GCM") &&
    relayProtocolSource.includes("statusline.snapshot.v1"),
  "the universal relay must enforce its configured endpoint and AES-GCM protocol",
);

const uniqueVersions = new Set(Object.values(versions));
const githubReleasePlatforms =
  releaseMetadata.distribution?.githubReleasePlatforms;
const releasePlatformProfile = Array.isArray(githubReleasePlatforms)
  ? githubReleasePlatforms.join(",")
  : "";
const isUnixPreviewProfile = releasePlatformProfile === "linux,macos,android";
const isCompleteProfile =
  releasePlatformProfile === "windows,linux,macos,android";
assert(
  uniqueVersions.size === 1 && !uniqueVersions.has(undefined),
  `versions differ: ${Object.entries(versions)
    .map(([source, version]) => `${source}=${version}`)
    .join(", ")}`,
);
assert(
  releaseMetadata.schemaVersion === 1 &&
    releaseMetadata.product === "Statusline" &&
    releaseMetadata.channel === "beta" &&
    releaseMetadata.tag === `v${releaseMetadata.version}` &&
    releaseMetadata.notes ===
      `docs/release/notes/v${releaseMetadata.version}.md` &&
    releaseMetadata.distribution?.publishPrerelease === true &&
    (isUnixPreviewProfile || isCompleteProfile) &&
    (isCompleteProfile
      ? releaseMetadata.distribution?.deferred?.windows === undefined
      : releaseMetadata.distribution?.deferred?.windows ===
        "awaiting-signpath-foundation"),
  "release.json must define the canonical beta version, tag and curated notes",
);
assert(
  androidVersionName === releaseMetadata.components?.android?.versionName &&
    androidVersionName === releaseMetadata.version &&
    androidVersionCode === releaseMetadata.components?.android?.versionCode,
  "Android versionName/versionCode must match release.json",
);
assert(
  iosApplicationBuildSettings.length >= 2 &&
    iosApplicationBuildSettings.every(
      (settings) =>
        settings.build === String(releaseMetadata.components?.ios?.build) &&
        settings.version === releaseMetadata.components?.ios?.version,
    ) &&
    releaseMetadata.components?.ios?.distribution === "app-store-manual",
  "release.json must record the submitted iPhone app version and manual delivery",
);
assert(
  releaseNotes.includes(`Statusline ${releaseMetadata.version} Beta`) &&
    releaseNotes.includes("## Verify before installing") &&
    releaseNotes.includes("## Known beta limitations") &&
    (!isUnixPreviewProfile ||
      releaseNotes.includes("Windows is not included in this prerelease")),
  "the current release needs curated notes with verification and limitations",
);

assertExactTargets(windowsConfig.bundle?.targets, ["nsis", "msi"], "Windows");
assertExactTargets(
  linuxConfig.bundle?.targets,
  ["deb", "rpm", "appimage"],
  "Linux",
);
assertExactTargets(macosConfig.bundle?.targets, ["dmg"], "macOS");
assert(
  macosConfig.bundle?.macOS?.infoPlist === "Info.macos.plist" &&
    /<key>LSUIElement<\/key>\s*<true\/>/u.test(macosInfoPlist) &&
    tauriConfig.app?.windows?.[0]?.skipTaskbar === true &&
    desktopLibSource.includes(
      "set_activation_policy(tauri::ActivationPolicy::Accessory)",
    ),
  "macOS must run as a menu-bar-only accessory application",
);
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
  "scripts/prepare-release-assets.mjs",
  "scripts/prepare-release-assets.test.mjs",
  "scripts/smoke-installers-windows.ps1",
  "scripts/smoke-installers-linux.sh",
  "scripts/prepare-linux-signing.sh",
  "scripts/sign-linux-files.sh",
  "scripts/verify-linux-signatures.sh",
  "scripts/cleanup-linux-signing.sh",
  "scripts/smoke-installer-macos.sh",
  "scripts/prepare-macos-signing.sh",
  "scripts/package-macos-pkg.sh",
  "scripts/notarize-macos-artifact.sh",
  "scripts/cleanup-macos-signing.sh",
  "scripts/windows-signpath-artifacts.ps1",
  "scripts/verify-windows-signatures.ps1",
  "scripts/verify-detached-signature.sh",
  "src-tauri/windows/statusline-per-user.wxs",
  "src-tauri/windows/nsis-hooks.nsh",
  "src-tauri/Info.macos.plist",
  "../../.github/workflows/desktop-installer-smoke.yml",
  "../../packaging/linux/statusline-release-signing-key.asc",
  "../../LICENSE",
  "../../CODE_OF_CONDUCT.md",
  "../../CONTRIBUTING.md",
  "../../PRIVACY.md",
  "../../README.es.md",
  "../../ROADMAP.md",
  "../../SECURITY.md",
  "../../SUPPORT.md",
  "../../.github/CODEOWNERS",
  "../../.github/dependabot.yml",
  "../../.github/ISSUE_TEMPLATE/bug-report.yml",
  "../../.github/ISSUE_TEMPLATE/feature-request.yml",
  "../../.github/pull_request_template.md",
  "../../.github/release.yml",
  "../../.github/workflows/release.yml",
  "../../.github/workflows/repository-quality.yml",
  "../../release.json",
  "../../docs/README.md",
  "../../docs/release/release-runbook.md",
  "../../docs/security/code-signing-policy.md",
  "../../docs/release/public-beta-checklist.md",
  "../../scripts/check-markdown-links.mjs",
]) {
  assert(
    existsSync(join(projectRoot, relativePath)),
    `${relativePath} is required`,
  );
}
assert(
  rootReadme.includes("## Code signing policy") &&
    rootReadme.includes("README.es.md") &&
    rootReadme.includes("Free code signing provided by [SignPath.io]") &&
    rootReadme.includes("certificate by [SignPath Foundation]") &&
    rootReadme.includes("## Releases") &&
    spanishReadme.includes("## Code signing policy") &&
    spanishReadme.includes("## Releases") &&
    securityPolicy.includes("## Report a vulnerability") &&
    codeSigningPolicy.includes("## Required release process") &&
    codeSigningPolicy.includes("manual approval") &&
    codeSigningPolicy.includes("fail-closed") &&
    codeSigningPolicy.includes("## Project roles") &&
    codeSigningPolicy.includes("SignPath's GitHub trusted-build-system") &&
    codeSigningPolicy.includes("../../PRIVACY.md") &&
    releaseRunbook.includes("## One release pipeline") &&
    releaseRunbook.includes("## Required release inventory") &&
    codeOwners.includes("@arvivares"),
  "SignPath onboarding requires a public code-signing policy, named roles, privacy link and CODEOWNERS",
);
assert(
  rootReadme.includes("[full product and engineering roadmap](ROADMAP.md)") &&
    spanishReadme.includes(
      "[roadmap completo de producto e ingeniería](ROADMAP.md)",
    ) &&
    roadmap.includes("## Provider feasibility") &&
    roadmap.includes("## Definition of done for a provider adapter") &&
    roadmap.includes("Zero-knowledge sync"),
  "the public roadmap must remain discoverable and preserve its provider and privacy gates",
);
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
    macosSmokeScript.includes("Developer ID Installer:") &&
    macosSmokeScript.includes("LSUIElement"),
  "macOS smoke tests must verify the universal menu-bar app, DMG, PKG and Codex discovery",
);
assert(
  desktopLibSource.includes("WindowEvent::CloseRequested") &&
    desktopLibSource.includes("api.prevent_close()") &&
    desktopLibSource.includes("window.hide()") &&
    desktopLibSource.includes('"quit" => app.exit(0)'),
  "the companion window must close to the tray and exit only from its explicit menu command",
);
assert(
  linuxSigningPreparationScript.includes("LINUX_GPG_PRIVATE_KEY_BASE64") &&
    linuxSigningPreparationScript.includes("LINUX_GPG_PASSPHRASE") &&
    linuxSigningPreparationScript.includes("signing-probe") &&
    linuxSigningPreparationScript.includes("public_fingerprint") &&
    linuxSigningScript.includes("--detach-sign") &&
    linuxSignatureVerificationScript.includes("VALIDSIG") &&
    linuxSignatureVerificationScript.includes("Expected exactly one DEB") &&
    linuxSigningCleanupScript.includes("statusline-gnupg.") &&
    linuxPublicKey.includes("BEGIN PGP PUBLIC KEY BLOCK") &&
    !linuxPublicKey.includes("BEGIN PGP PRIVATE KEY BLOCK"),
  "Linux signing must use a pinned public key, ephemeral keyring and detached OpenPGP signatures",
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
  checksumScript.includes('".pkg"') &&
    checksumScript.includes('".apk"') &&
    checksumScript.includes('".aab"') &&
    checksumScript.includes('"RELEASE-MANIFEST.json"') &&
    !workflow.includes("archive: false"),
  "checksums must cover desktop, Android and release provenance artifacts",
);
assert(
  releaseAssetScript.includes('["windows-nsis", ".exe"]') &&
    releaseAssetScript.includes('["linux-appimage", ".appimage"]') &&
    releaseAssetScript.includes('["android-aab", ".aab"]') &&
    releaseAssetScript.includes("githubReleasePlatforms") &&
    releaseAssetScript.includes("symbolic links are not allowed") &&
    releaseAssetScript.includes("GITHUB_RUN_ATTEMPT") &&
    releaseAssetScript.includes("RELEASE-MANIFEST.json"),
  "release inventory must fail closed and bind selected platforms to workflow provenance",
);
assert(
  windowsSignPathScript.includes("RestoreApplication") &&
    windowsSignPathScript.includes("StageInstallers") &&
    windowsSignatureVerificationScript.includes("Get-AuthenticodeSignature") &&
    windowsSignatureVerificationScript.includes("ExpectedSignerSubject") &&
    windowsSignatureVerificationScript.includes("TimeStamperCertificate") &&
    detachedSignatureVerificationScript.includes("VALIDSIG"),
  "release tooling must restore SignPath output and verify signer, timestamp and detached signatures",
);
assert(
  !existsSync(join(projectRoot, "scripts/prepare-windows-signing.ps1")) &&
    !existsSync(join(projectRoot, "scripts/cleanup-windows-signing.ps1")) &&
    !workflow.includes("WINDOWS_CERTIFICATE") &&
    !workflow.includes("WINDOWS_CERTIFICATE_PASSWORD") &&
    !workflow.includes("WINDOWS_TIMESTAMP_URL"),
  "the legacy Windows PFX signing path must stay removed",
);

const workflowDirectory = join(projectRoot, "../../.github/workflows");
const actionReferences = readdirSync(workflowDirectory)
  .filter((name) => /\.ya?ml$/u.test(name))
  .map((name) => readFileSync(join(workflowDirectory, name), "utf8"))
  .flatMap((contents) =>
    [...contents.matchAll(/^\s*uses:\s*([^\s#]+)/gmu)].map((match) => match[1]),
  );
const externalActionReferences = actionReferences.filter(
  (reference) => !reference.startsWith("./"),
);
assert(
  actionReferences.length >= 24,
  "release workflow action references are missing",
);
assert(
  externalActionReferences.every((reference) =>
    /@[0-9a-f]{40}$/u.test(reference),
  ),
  "every external release action must be pinned to an immutable commit SHA",
);
for (const requiredWorkflowToken of [
  "workflow_call:",
  "SIGNPATH_API_TOKEN",
  "SIGNPATH_ORGANIZATION_ID",
  "SIGNPATH_PROJECT_SLUG",
  "SIGNPATH_SIGNING_POLICY_SLUG",
  "SIGNPATH_EXECUTABLE_ARTIFACT_CONFIGURATION_SLUG",
  "SIGNPATH_INSTALLER_ARTIFACT_CONFIGURATION_SLUG",
  "SIGNPATH_EXPECTED_SIGNER_SUBJECT",
  "unix",
  "signpath/github-action-submit-signing-request@c92b958760219087e01f8d67a1669ed57afe2627",
  "Build Windows application without bundling",
  "--no-bundle",
  "Bundle Windows installers without recompiling",
  "tauri -- bundle",
  "windows-signpath-artifacts.ps1",
  "verify-windows-signatures.ps1",
  "LINUX_GPG_PRIVATE_KEY_BASE64",
  "LINUX_GPG_PASSPHRASE",
  "sign_linux",
  "Sign Linux installers with OpenPGP",
  "verify-linux-signatures.sh",
  "APPLE_CERTIFICATE",
  "APPLE_INSTALLER_CERTIFICATE",
  "APPLE_INSTALLER_SIGNING_IDENTITY",
  "STATUSLINE_RELAY_BASE_URL",
  "Validate universal relay service",
  "db:migrate:local",
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
for (const requiredReleaseWorkflowToken of [
  'tags:\n      - "v*"',
  "./.github/workflows/desktop-installers.yml",
  "./.github/workflows/android.yml",
  "Create draft prerelease",
  "desktop_platform",
  "Verify signed annotated release tag",
  "prepare-release-assets.mjs",
  "Verify Linux package signatures independently",
  "Verify checksum signature with public key",
  "actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6",
  "subject-checksums:",
  "attempt-${{ github.run_attempt }}",
  "Verify draft release inventory",
  "Publish verified prerelease",
  "Verified assets were not published as a prerelease",
]) {
  assert(
    releaseWorkflow.includes(requiredReleaseWorkflowToken),
    `unified release workflow is missing ${requiredReleaseWorkflowToken}`,
  );
}
assert(
  androidWorkflow.includes("workflow_call:") &&
    androidWorkflow.includes("Signed release APK and AAB") &&
    androidWorkflow.includes("Statusline_${release_version}_android.apk") &&
    androidWorkflow.includes("Statusline_${release_version}_android.aab") &&
    !androidWorkflow.includes("android-v*"),
  "Android must contribute versioned signed artifacts only through the unified release tag",
);
assert(
  !workflow.includes("desktop-v*") &&
    !workflow.includes("gh release upload") &&
    !androidWorkflow.includes("gh release upload"),
  "only the unified release workflow may populate a GitHub Release",
);
assert(
  !workflow.includes("contents: write"),
  "the reusable desktop workflow must not elevate content permissions above its caller",
);
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
  "artifacts_run_attempt",
  "require_windows_trust",
  "run-id:",
  "merge-multiple: true",
  "timeout-minutes: 10",
  "Installer checksum manifest",
  "require_linux_signatures",
  "Verify Windows Authenticode signatures",
  "Verify Linux OpenPGP signatures",
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
    releaseTag === releaseMetadata.tag,
    `tag ${releaseTag} must match ${releaseMetadata.tag}`,
  );
}

console.log(
  `Release preflight passed: Statusline ${version} (GitHub: ${githubReleasePlatforms.join(" + ")}${isUnixPreviewProfile ? "; Windows deferred" : ""}; iOS ${releaseMetadata.components.ios.version} (${releaseMetadata.components.ios.build}) recorded separately).`,
);
