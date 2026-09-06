# Public release runbook

This runbook describes the single-source release process for Statusline. It prepares one
GitHub prerelease containing the enabled desktop and Android binaries built from the same
signed tag and commit. iOS remains an App Store delivery and is recorded, but not compiled,
by this workflow.

## Source of truth

[`release.json`](../../release.json) owns the product version, release channel, tag,
component versions and curated release-notes path. For the current public beta:

- product tag: `v0.1.13`;
- desktop and Android code version: `0.1.13`;
- Android generated build: `versionCode 9` (Google Play submission is separate);
- iOS source/TestFlight candidate: `1.0 (4)`, distributed manually through App Store
  Connect. The existing App Store submission remains `1.0 (2)`.
- GitHub prerelease platforms: Windows, Linux, macOS and Android. Windows explicitly
  uses `windowsSigning: unsigned-preview` while SignPath onboarding is pending.

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

For `v0.1.13`, the finalizer fails unless it finds exactly one of each enabled
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
unchanged. The current full release has nine installers and 16 total downloadable assets.

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
git tag -s v0.1.13 -m "Statusline 0.1.13 beta"
git push origin v0.1.13
```

The workflow verifies that the tag is annotated, cryptographically verified by GitHub,
targets the exact workflow commit and matches `release.json`. The signed tag is the release
approval: after every build, trust, inventory, checksum and provenance gate passes, the
draft is published automatically with GitHub's **Pre-release** flag.

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
