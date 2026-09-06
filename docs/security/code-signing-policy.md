# Code signing policy

Statusline has selected SignPath Foundation as the trust provider for Authenticode-signed
Windows releases. Onboarding is still in progress. Starting with 0.1.13, the maintainer
explicitly permits public **unsigned Windows beta previews**, identified by the
`unsigned-preview` policy in `release.json`. They are not Authenticode-signed releases.
The two-stage SignPath integration remains prepared for the provider-assigned values.

Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## Temporary unsigned Windows beta policy

- Only `channel: beta` and `publishPrerelease: true` permit `windowsSigning: unsigned-preview`.
  Missing or unknown policies fail closed; there is no automatic signing fallback.
- The source commit and annotated release tag are signed. Windows CI checks that the
  application, NSIS and MSI report `NotSigned`, then tests installation, frontend
  readiness, Codex discovery and uninstallation before uploading the candidate.
- Public Windows filenames contain `.unsigned`. The release notes and provenance
  manifest explicitly record the policy. Signed SHA-256 checksums and GitHub build
  attestations cover both installers, but are **not substitutes for Authenticode**.
- SmartScreen or organizational policy may warn or block these previews. Users should
  not disable security protections to install them. Signed publication remains preferred.
- Linux OpenPGP signatures, Apple signing/notarization and Android signing remain
  mandatory. The exception does not extend to those platforms or stable releases.
- Once SignPath is approved, change `windowsSigning` to `signpath` in a reviewed commit
  and publish a new version. Never silently replace a published preview with new bytes.

## Signed artifact scope

The signing policy is limited to Windows binaries built from this repository:

- `statusline-desktop.exe`, built from `apps/desktop`;
- the Statusline Companion NSIS installer;
- the Statusline Companion MSI installer.

Android, Apple, Linux, relay, test and third-party upstream artifacts are outside the SignPath signing scope. The Windows installers do not bundle Codex CLI or user credentials.

## Required release process

Once onboarding is complete, every signed Windows release must follow this process:

1. A signed annotated `v<version>` tag identifies the exact source revision for the enabled desktop platforms and Android.
2. The release workflow checks out that revision and builds on a fresh GitHub-hosted Windows runner.
3. Locked Rust and npm dependencies, tests, formatting, release metadata and the production HTTPS relay endpoint are validated before signing.
4. The unsigned application executable is uploaded as a short-lived GitHub Actions artifact and submitted through SignPath's GitHub trusted-build-system integration.
5. A project approver manually approves the release signing request.
6. The signed application executable is used to produce the NSIS and MSI installers without recompiling the application.
7. Both installers are uploaded through the same trusted workflow and submitted for final Authenticode signing.
8. CI verifies the signer, SHA-256 Authenticode signature and trusted timestamp on the application, NSIS installer and MSI before running installation smoke tests.
9. The unified release finalizer verifies the complete platform profile, creates signed checksums and GitHub build-provenance attestations, then publishes only verified artifacts as a prerelease. In `signpath` mode every preceding SignPath gate must succeed.

A signing failure is fail-closed: the workflow must not publish or silently substitute an unsigned Windows artifact.

## Build and signing controls

- Signing is only requested by the canonical `arvivares/statusline` repository, never by pull-request or fork workflows.
- All jobs leading to a SignPath request use GitHub-hosted runners.
- The SignPath private key is generated and retained by its hardware-backed signing service. It is never available to maintainers or GitHub Actions.
- The SignPath API token is stored only as a GitHub Actions secret and is not accepted from pull requests.
- Release signing requires manual approval for every version.
- Workflow, signing-policy and packaging changes remain reviewable in the public Git history.
- Product name and version metadata must match the release tag and the restrictions configured in SignPath.
- The legacy repository-managed PFX backend is not permitted in the public release workflow.

## Project roles

- Committer and reviewer: [Alan Rodrigo Vivares (`@arvivares`)](https://github.com/arvivares)
- Release and signing approver: [Alan Rodrigo Vivares (`@arvivares`)](https://github.com/arvivares)

External contributions must be reviewed before merging. Everyone with repository or SignPath access must protect their account with multi-factor authentication.

## Privacy and system changes

Statusline's behavior and network processing are documented in the public [privacy policy](../../PRIVACY.md). Synchronization is optional and begins only after the user explicitly creates an encrypted relay pairing. The installer does not install Codex, alter a Codex account or collect Codex credentials. NSIS and MSI both provide standard Windows uninstallation.

## Reporting concerns

Security, privacy or signed-artifact concerns can be reported using [SUPPORT.md](../../SUPPORT.md). Reports must not include access tokens, API keys, pairing links, QR codes or private Codex configuration.
