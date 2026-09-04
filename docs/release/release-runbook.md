# Public release runbook

This runbook describes the single-source release process for Statusline. It prepares one
GitHub prerelease containing the enabled desktop and Android binaries built from the same
signed tag and commit. iOS remains an App Store delivery and is recorded, but not compiled,
by this workflow.

## Source of truth

[`release.json`](../../release.json) owns the product version, release channel, tag,
component versions and curated release-notes path. For the first public beta:

- product tag: `v0.1.10`;
- desktop and Android code version: `0.1.10`;
- Android store build: `versionCode 6`;
- iOS store build: `1.0 (2)`, distributed manually through App Store Connect.
- GitHub prerelease platforms: Linux, macOS and Android. Windows is deferred until
  SignPath Foundation onboarding is complete.

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

For `v0.1.10`, the finalizer fails unless it finds exactly one of each enabled
distributable:

| Platform | Required assets                                           |
| -------- | --------------------------------------------------------- |
| Linux    | DEB, RPM, AppImage and one `.asc` signature per installer |
| macOS    | Universal DMG, universal PKG                              |
| Android  | Signed APK, signed AAB                                    |

The Windows NSIS `.exe` and MSI are deliberately absent from this prerelease. When
SignPath is approved, add `windows` to `distribution.githubReleasePlatforms`, remove its
deferred status and release a new version. The same finalizer will then require exactly
both Windows installers as well; an unsigned fallback is impossible.

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
current profile this validates Linux, macOS, Android and relay configuration without
requiring the still-unassigned SignPath values. From a clean `main` checkout whose commit
is verified on GitHub:

```shell
npm ci --prefix apps/desktop
npm run release:check --prefix apps/desktop
git tag -s v0.1.10 -m "Statusline 0.1.10 beta"
git push origin v0.1.10
```

The workflow verifies that the tag is annotated, cryptographically verified by GitHub,
targets the exact workflow commit and matches `release.json`. The signed tag is the release
approval: after every build, trust, inventory, checksum and provenance gate passes, the
draft is published automatically with GitHub's **Pre-release** flag.

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
clean-machine installation on Ubuntu/Debian, Fedora, Apple Silicon and Intel macOS. Once
Windows joins the enabled profile, add clean Windows 11 installation and SmartScreen
validation. Never publish or replace an asset copied from a different run or commit.
