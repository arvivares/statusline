# Public release runbook

This runbook describes the single-source release process for Statusline. It prepares one
GitHub prerelease containing the enabled desktop and Android binaries built from the same
signed tag and commit. iOS remains an App Store delivery and is recorded, but not compiled,
by this workflow.

## Source of truth

[`release.json`](../../release.json) owns the product version, release channel, tag,
component versions and curated release-notes path. For the current public beta:

- prepared product tag: `v0.1.20` (not created merely by preparing this file);
- desktop and Android candidate version: `0.1.20`;
- Android candidate: `versionCode 16` (Google Play submission is separate);
- separately uploaded iOS candidate: `1.0.1 (6)`, acknowledged for TestFlight
  processing. A local development-signed USB upgrade confirmed an independent
  widget read with the existing pairing; TestFlight availability and the
  distribution-signed upgrade remain unverified. Build 5 has an empty widget
  endpoint and must not be publicly released.
- currently published iOS App Store release: `1.0 (4)`, distributed manually through App Store Connect.
  Apple approved submission `9de1d3a4-27a7-403f-aa7f-12de04c9db4f`; the account
  holder authorized public release on 9 September 2026 (Europe/Madrid).
  The delivered version reports **Ready for Distribution**; the account holder
  subsequently confirmed the public listing is visible. An on-device App Store
  download remains to be verified.
  See the current status in [iOS validation](../../apps/apple/store/validation.md).
- GitHub prerelease platforms: Windows, Linux, macOS and Android. Windows explicitly
  uses `windowsSigning: unsigned-preview`; no SignPath certificate has been approved.

The release preflight rejects drift between this file, npm, Cargo, Tauri, Gradle and the
Xcode project.

## One release pipeline

[`release.yml`](../../.github/workflows/release.yml) is the only workflow authorized to
create a public release candidate. A signed annotated `v<version>` tag triggers:

1. static metadata, frontend, relay and signing-configuration preflight;
2. creation of a GitHub prerelease in draft state;
3. native desktop builds on the platform profile declared in `release.json`;
4. a signed Android APK and AAB build;
5. mandatory inventory, signature, checksum and provenance validation;
6. upload of the complete verified set and automatic publication as a prerelease.

Manual runs of the workflow execute preflight only, including a fail-closed check of every
production signing value. Run that manual preflight successfully before creating the tag.
Component workflows may still be run manually for targeted QA, but their 14- or 30-day
artifacts are not releases.

## Required release inventory

For `v0.1.20`, the finalizer fails unless it finds exactly one of each enabled
distributable:

| Platform | Required assets                                            |
| -------- | ---------------------------------------------------------- |
| Windows  | NSIS `.unsigned.exe` and MSI `.unsigned.msi` beta previews |
| Linux    | DEB, RPM, AppImage and one `.asc` signature per installer  |
| macOS    | Universal DMG, universal PKG                               |
| Android  | Signed APK, signed AAB                                     |

Windows is included without Authenticode under an explicit beta-only policy. CI checks
`NotSigned` status on the application and both installers and requires successful install,
frontend/Codex-discovery and uninstall smoke tests before uploading them. The finalizer
adds `.unsigned` to their names and records `windowsSigning` in the manifest; release notes
must disclose unsigned status and SmartScreen limitations. Signed checksums and provenance
authenticate integrity, not Windows publisher trust. Never disable security protections.

When SignPath is approved, set `distribution.windowsSigning` to `signpath` in a reviewed
commit and release a new version. Both executable and installer signing stages then become
mandatory, with no fallback to preview mode on failure. Other platform signing gates are
unchanged. In addition to the nine installers and existing verification assets,
this release includes the universal macOS updater archive, final-payload updater
signatures and `updater.json`. The updater manifest must not be published without
the complete matching installer set.

The dedicated `TAURI_SIGNING_PRIVATE_KEY` secret is mandatory for public releases.
Keep an offline backup outside the repository. Only its public key is embedded
in the companion. These signatures are generated after all preparation,
notarization and repackaging; they are not Windows Authenticode certificates.
See [companion updates](../architecture/companion-updates.md) for the platform
matrix, private-key handling and required upgrade QA.

It also creates `RELEASE-MANIFEST.json`, `SHA256SUMS.txt`,
`SHA256SUMS.txt.asc` and includes the Linux public key. The generated manifest binds every
distributable and Linux package signature to the source commit, tag and GitHub Actions
run; the signed checksum file then authenticates the distributables and manifest.

## SignPath values to configure after approval

The workflow is already wired to SignPath's GitHub trusted-build-system action. Do not
guess values: copy them from the approved SignPath project and its CI integration page.

Repository secret:

- `SIGNPATH_API_TOKEN`

Repository variables:

- `SIGNPATH_ORGANIZATION_ID`
- `SIGNPATH_PROJECT_SLUG`
- `SIGNPATH_SIGNING_POLICY_SLUG`
- `SIGNPATH_EXECUTABLE_ARTIFACT_CONFIGURATION_SLUG`
- `SIGNPATH_INSTALLER_ARTIFACT_CONFIGURATION_SLUG`
- `SIGNPATH_EXPECTED_SIGNER_SUBJECT`

Install the SignPath GitHub App for `arvivares/statusline`. The executable artifact
configuration must accept a GitHub artifact ZIP containing `statusline-desktop.exe`; the
installer configuration must accept one ZIP containing exactly one NSIS `.exe` and one
MSI. The configured policy must sign and timestamp every matched file.

Windows uses two signing stages. Tauri first builds the application with `--no-bundle`.
SignPath signs that executable, Tauri packages the signed executable without recompiling,
then SignPath signs the resulting NSIS and MSI. Any missing, rejected or unexpected
signature stops the run before release assets are uploaded.

## Creating the candidate

Do not create the tag until the manual **Release** workflow preflight succeeds. For the
current profile this validates the explicit Windows preview policy, Linux, macOS, Android and relay configuration without
requiring the still-unassigned SignPath values. From a clean `main` checkout whose commit
is verified on GitHub:

```shell
npm ci --prefix apps/desktop
npm run release:check --prefix apps/desktop
git tag -s v0.1.20 -m "Statusline 0.1.20 beta"
git push origin v0.1.20
```

The workflow verifies that the tag is annotated, cryptographically verified by GitHub,
targets the exact workflow commit and matches `release.json`. The signed tag is the release
approval: after every build, trust, inventory, checksum and provenance gate passes, the
draft is published automatically with GitHub's **Pre-release** flag.

### 0.1.20 candidate gates

- Verify the Still Signature settings in EN/ES: Codex and mobile-sync tabs,
  setup disclosures, long paths, QR visibility, keyboard focus and Escape.
  The README uses fresh, language-matched source captures; iPhone images are
  isolated simulator demos, not evidence of a store rollout. This release does
  not change the native mobile layout or core sync/updater protocols.

- Preserve the `0.1.16` window dismissal, Windows desktop discovery and iOS bundle
  guards, plus the `0.1.18` Still Signature design and `0.1.19` compact window,
  macOS signature-requirement fix and automatic update notices on opening.
  Native mobile layouts are not shrunk.
  Production Rust tests and the PowerShell fixture must pass on Windows, Linux
  and macOS as applicable before signing/tagging.
- Validate update discovery, exact platform/format selection, duplicate operation
  prevention and signed artifact publication. The maintainer reports a successful
  Windows update to `0.1.18`; separate MSI/NSIS coverage is not yet confirmed.
  Affected macOS `0.1.17`/`0.1.18` users need one manual DMG/PKG installation of
  the fixed updater. Validate a real `0.1.19 → later version` macOS upgrade,
  including restart and pairing preservation, before claiming end-to-end success.
  Real `codesign` tests and a signed-payload replacement rehearsal on temporary
  copies passed locally; they do not prove a live restart or preserved pairing.
- Verify foreground automatic notices on Windows and macOS without clicking
  Updates: Later snoozes one opening, reopen reminds again, repeated focus does
  not spam dialogs, and background checks never steal focus. Reopening reuses
  checks younger than 15 minutes; the six-hour background schedule remains.
- Review and merge the preparation PR before creating the public tag. Do not
  retarget a published tag or publish branch-QA artifacts as a verified release.
- Record the remaining physical-device checks explicitly in the beta notes:
  [window interactions](../architecture/companion-window.md), desktop-only Windows
  detection and the [sync upgrade checklist](../architecture/synchronization.md).
  CI is not a substitute for native window-manager and clean-machine QA. Also
  record the [Still Signature checks](../architecture/still-signature.md): native
  corner clipping, Linux/XWayland rendering, Windows first launch and Android
  widgets at minimum size, larger text, empty data and 100% quota in EN/ES.
- Reuse the already-uploaded iOS build 6 for its separate TestFlight validation;
  do not rebuild or replace App Review as part of this desktop/Android release.
  GitHub Actions never builds iOS; App Store and Google Play actions are separate.

Release assets use portable ASCII filenames. Whitespace emitted by native packagers is
normalized to `.` before checksums, provenance and upload are generated, so the names
stored by GitHub remain byte-for-byte consistent with `SHA256SUMS.txt` and
`RELEASE-MANIFEST.json`.

## Recovering a verified draft without rebuilding

Use [Recover draft release](../../.github/workflows/recover-release.yml) only when the
main Release workflow has completed every enabled native-platform job successfully, wrote
its release-candidate artifact, and then failed in the final draft verification. Supply
the signed tag and failed source run ID. The recovery workflow fails closed unless:

- the tag is annotated, verified by GitHub and matches `release.json`;
- the source is a failed tag-triggered Release run for that exact tag commit;
- every native job enabled by `release.json` succeeded exactly once;
- one unexpired release-candidate artifact exists; and
- the target release is still both draft and prerelease.

Recovery downloads that candidate from GitHub Actions, without compiling any native
code. It restages portable filenames, re-verifies Linux signatures, regenerates and signs
checksums, emits a new provenance attestation, replaces the draft assets, compares the
exact remote inventory and publishes only after every check passes. Never use recovery
to combine artifacts from different runs, attempts, commits or tags.

## Independent verification

Download the prerelease assets and verify them independently:

```shell
gpg --import statusline-release-signing-key.asc
gpg --verify SHA256SUMS.txt.asc SHA256SUMS.txt
sha256sum --check SHA256SUMS.txt
gh attestation verify "<downloaded-asset>" --repo arvivares/statusline
```

Also run [Revalidate desktop installers](../../.github/workflows/desktop-installer-smoke.yml)
against the release workflow run ID and its successful attempt number, then complete
clean-machine installation on Ubuntu/Debian, Fedora, Apple Silicon and Intel macOS. For
the Windows preview, add clean Windows 11 installation and record the SmartScreen
result without disabling security protections. Never publish or replace an asset copied
from a different run or commit.
