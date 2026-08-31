# Public desktop beta checklist

This checklist is the release gate for a tagged desktop-v<version> build. Manual workflow runs remain private, unsigned test artifacts.

## Product

- [ ] Validate Source Settings with standalone Codex and npm Codex on a clean Windows 11 user.
- [ ] Validate automatic detection and manual selection on Ubuntu/Debian and Fedora.
- [ ] Verify signed-in, signed-out, missing CLI, invalid launcher and timeout states.
- [ ] Verify first launch, tray reopen, refresh, close-to-tray and quit.
- [ ] Verify a clean signed install accesses its relay Keychain item without repeated prompts; separately test migration from an unsigned prerelease build.
- [ ] Pair clean Windows, Linux and macOS publishers with iOS and verify the same snapshot in the app and widget.
- [ ] Confirm no account shared between desktop and mobile is requested.

## Universal relay

- [ ] Choose a supported production adapter. The current release supports Cloudflare Workers + D1; do not select Linux until its container is implemented and validated.
- [ ] Deploy StatuslineRelay with a public HTTPS hostname and verify GET /health.
- [ ] For Cloudflare, apply all remote D1 migrations and inspect both Worker requests and D1 row metrics.
- [ ] Set the STATUSLINE_RELAY_BASE_URL repository variable and the matching Xcode Release build setting.
- [ ] Verify QR expiry, single-use credential rotation, replay rejection, channel expiry and publisher deletion.
- [ ] Confirm publisher tokens, reader tokens, encryption keys and full pairing links never appear in logs or frontend IPC.
- [ ] Review provider observability, edge protection, rate limits, backups and retention against PRIVACY.md.
- [ ] Review the [relay capacity calculation](../relay/deployment-options.md#cálculo-para-la-versión-actual), reserve at least 20%, and configure usage alerts.
- [ ] Run the shared AES-GCM fixture against Rust, Swift and the Android client before shipping Android.

## Windows signing

- [ ] Acquire a current Windows code-signing certificate from a supported provider.
- [ ] Add the base64-encoded PFX as the WINDOWS_CERTIFICATE repository secret.
- [ ] Add its password as the WINDOWS_CERTIFICATE_PASSWORD repository secret.
- [ ] Add the certificate provider's timestamp endpoint as the WINDOWS_TIMESTAMP_URL repository variable.
- [ ] Confirm the tagged workflow reports Valid Authenticode signatures for the application, NSIS installer and MSI.
- [ ] Download both installers in a browser on a clean Windows machine and record the SmartScreen result.

Tagged builds fail before compilation when any required signing value is missing. The temporary PFX, generated Tauri signing configuration and imported runner certificate are removed after the build.

## macOS signing and notarization

- [x] Acquire a Developer ID Application certificate for the publishing team.
- [x] Acquire a Developer ID Installer certificate for the publishing team.
- [x] Configure CI signing with encrypted repository secrets and an App Store Connect Team Key.
- [x] Notarize the universal app, DMG and PKG, staple their tickets and validate with Gatekeeper.
- [ ] Install on clean Apple Silicon and Intel Macs without bypassing Gatekeeper.

Automated and local trust validation passed for installer run [33370463028](https://github.com/arvivares/statusline/actions/runs/33370463028) and clean-runner revalidation [33372028599](https://github.com/arvivares/statusline/actions/runs/33372028599).

Until these checks pass, the generated DMG and PKG are private test artifacts, not a public macOS release.

## Distribution integrity

- [ ] Confirm all seven installers are attached to one draft GitHub Release.
- [ ] Verify every asset against SHA256SUMS.txt after downloading it.
- [ ] Review the automated NSIS, MSI, Debian, RPM, AppImage, universal DMG and PKG smoke-test logs.
- [ ] Install and uninstall each package manually on a clean target system.

## Policy and support

- [ ] Review [PRIVACY.md](../../PRIVACY.md) against the deployed relay behavior and hosting provider.
- [ ] Confirm [SUPPORT.md](../../SUPPORT.md) points to the intended public support channel.
- [ ] Decide whether background mobile updates are required for beta; document foreground-only refresh if APNs/FCM is deferred.
- [ ] Choose the source-code and binary distribution license. The repository currently grants no explicit open-source license.
- [ ] Add the chosen license or EULA to package metadata and release notes.

## Publish

- [ ] Review generated release notes and known limitations.
- [ ] Keep the GitHub Release as a draft until clean-machine testing is complete.
- [ ] Mark the release as a prerelease for the beta and publish it manually.
