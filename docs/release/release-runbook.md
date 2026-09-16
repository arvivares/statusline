# Public release runbook

This runbook describes the single-source release process for Statusline. It prepares one
GitHub release containing the enabled desktop and Android binaries built from the same
signed tag and commit. iOS remains an App Store delivery and is recorded, but not compiled,
by this workflow.

## Source of truth

[`release.json`](../../release.json) owns the product version, release channel, tag,
component versions and curated release-notes path. For the current public beta:

- prepared product tag: `v0.1.26` (not created merely by preparing this file);
- desktop and Android candidate version: `0.1.26`;
- Android candidate: `versionCode 22` (Google Play submission is separate);
- recorded iOS source version: `1.1.0 (9)`, adding Antigravity to the app and
  widgets. This metadata is not a live App Store/TestFlight status report.
  iOS delivery is manual; verify the actual candidate in App Store Connect
  before taking any store action. Build 5 has an empty widget endpoint and
  must not be publicly released. Historical device and submission evidence is
  in [iOS validation](../../apps/apple/store/validation.md).
- GitHub release platforms: Windows, Linux, macOS and Android. Windows explicitly
  uses `windowsSigning: unsigned-preview`; no SignPath certificate has been approved.
- `distribution.publishPrerelease: false`: publish as a normal GitHub release and
  mark it Latest. This makes the download visible in the repository's Releases
  sidebar. `channel: beta` still describes product maturity, independently of
  GitHub visibility and Authenticode. v0.1.25 and earlier prereleases are unchanged.

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
6. upload and byte-for-byte verification of the complete candidate;
7. application and verification of human-readable platform labels while the
   release remains a draft. These labels never rename files or alter updater
   URLs, signatures, checksums, digests or payload bytes;
8. publication using `publishPrerelease`:
   false means a visible Latest release; true retains the historical prerelease
   behavior and does not become Latest. Both release and recovery workflows verify
   the resulting state; normal publication also checks GitHub's latest endpoint.

Manual runs of the workflow execute preflight only, including a fail-closed check of every
production signing value. Run that manual preflight successfully before creating the tag.
Component workflows may still be run manually for targeted QA, but their 14- or 30-day
artifacts are not releases.

## Required release inventory

For `v0.1.26`, the finalizer fails unless it finds exactly one of each enabled
distributable:

| Platform | Required assets                                            |
| -------- | ---------------------------------------------------------- |
| Windows  | NSIS `.unsigned.exe` and MSI `.unsigned.msi` beta previews |
| Linux    | DEB, RPM, AppImage and one `.asc` signature per installer  |
| macOS    | Universal DMG, universal PKG                               |
| Android  | Signed APK, signed AAB                                     |

GitHub's asset list is flat, so the pipeline adds display labels such as
`WINDOWS · EXE installer · x64 · Unsigned`, `macOS · DMG installer · Apple
Silicon + Intel`, `LINUX · AppImage · x64` and `ANDROID · APK installer`. The
AAB remains available for Google Play publishing and is labelled as not directly
installable. Labels are presentation metadata applied through the GitHub API only
after remote bytes and inventory match the verified candidate. The pipeline sends
only the `label` field and rechecks every asset ID, filename, download URL, size and
digest before publication, preserving Companion update compatibility.

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
git tag -s v0.1.25 -m "Statusline 0.1.25 beta"
git push origin v0.1.25
```

The workflow verifies that the tag is annotated, cryptographically verified by GitHub,
targets the exact workflow commit and matches `release.json`. The signed tag is the release
approval: after every build, trust, inventory, checksum and provenance gate passes, the
draft is published automatically with GitHub's **Pre-release** flag.

### 0.1.25 candidate gates

- Validate the [optional services extension](../../protocol/statusline-services-v1.md)
  with real SQLite migrations, old/new readers and publishers, atomic sequences,
  authenticated crypto fixtures and bounded request bodies. Preserve all existing
  channel IDs, tokens, Codex snapshots and pairings.
- After CI passes, record the current production Worker version and D1 recovery
  bookmark, then apply migration 0003 before deploying the Worker. Verify the
  advertised capability and old/new read paths with a private disposable channel;
  delete only that test channel. This release's relay deployment is explicitly
  authorized; website and store-production deployments remain separate.
- Run native runtime/type checks on all three desktop operating systems. Verify
  that absent, disabled, unavailable and ready services match Companion discovery,
  and that Google-only Antigravity readings do not change Codex collection.
- Run iOS app/widget tests and EN/ES layout checks. Validate the processed archive
  and exported app/widget endpoints, versions, entitlements and signatures before
  uploading the same archive as `1.1.0 (9)` to TestFlight. Confirm processing and
  the existing Internal QA group in App Store Connect, not just upload success.
- Complete a physical TestFlight upgrade without re-pairing: both services when
  present in Companion, no absent-service placeholders, focus/watchlist behavior,
  small/medium widgets, unavailable/offline state and independent widget refresh.
  Simulator tests do not prove device background scheduling or vendor collection.
- Publish the complete signed-tag installer set only after all release gates pass.
  Android `0.1.25 (21)` and older iOS/Android clients retain the Codex v1
  projection. This release adds Antigravity to Android through the negotiated
  services-v1 response; it does not roll out Google Play/App Store production.
  Keep remaining device checks explicit in the [beta notes](notes/v0.1.25.md).

### Historical 0.1.23 candidate gates

The following records the previous Companion-only release. Its no-relay-change
and no-iOS-rebuild instructions do not apply to the authorized 0.1.25 rollout.

- Run the Antigravity runtime tests and full Companion typecheck on Windows,
  Linux and macOS. Verify Google-only filtering, automatic discovery only without
  saved preferences, legacy opt-out/manual selection preservation, source pinning,
  revision guards, removal/settings preservation and unchanged relay encryption
  fixtures. Record actual signed-in Windows/Linux sessions separately from CI:
  macOS collector checks do not establish live cross-platform vendor compatibility.
- Preserve existing pairing keys, v1 snapshots, endpoint and mobile behavior.
  Antigravity is local to Companion; adding/removing it must not reset Codex or
  mobile sync. The mobile generated catalogs gain unused shared strings, but
  there is no Antigravity mobile screen, widget or relay payload in this release.
- Verify detected-service-only visibility in EN/ES, including Codex-only, AGY-only,
  two-service and unavailable states. Verify the restored focus + watchlist,
  weekly/short-window switching and keyboard focus in the compact window.
  Keep unresolved physical-device and installer/update checks explicit in the
  [beta notes](notes/v0.1.23.md).

- Validate the merged dependency updates together: production frontend build,
  Rust runtime/type checks on each desktop OS, Android tests/lint and signed
  packaging, relay migrations/tests/type checks, and release-policy checks.
  The website changes are source-only here; do not deploy the website or relay
  as a side effect of publishing installers.
- Physical Android dependency-candidate QA covered EN/ES/fallback, launch,
  camera permission/cancellation and a 4 × 1 demo widget, with the production
  pairing untouched. It did not validate optical QR decoding, a fresh live
  pairing or the final signed 0.1.21 package. Keep these limits explicit in the
  [previous release notes](notes/v0.1.21.md). This is historical QA evidence, not
  validation of the final 0.1.23 installers.

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
- iOS changes here are generated, unused localization entries only. Do not
  rebuild or replace its separate TestFlight/App Review submission for this release.
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

Download the release assets and verify them independently:

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
