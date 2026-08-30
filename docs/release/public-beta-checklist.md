# Public desktop beta checklist

This checklist is the release gate for a tagged desktop-v<version> build. Manual workflow runs remain private, unsigned test artifacts.

## Product

- [ ] Validate Source Settings with standalone Codex and npm Codex on a clean Windows 11 user.
- [ ] Validate automatic detection and manual selection on Ubuntu/Debian and Fedora.
- [ ] Verify signed-in, signed-out, missing CLI, invalid launcher and timeout states.
- [ ] Verify first launch, tray reopen, refresh, close-to-tray and quit.
- [ ] Pair clean Windows, Linux and macOS publishers with iOS and verify the same snapshot in the app and widget.
- [ ] Confirm no account shared between desktop and mobile is requested.

## Universal relay

- [ ] Deploy StatuslineRelay with a production D1 database and public HTTPS hostname.
- [ ] Apply all remote D1 migrations and verify GET /health.
- [ ] Set the STATUSLINE_RELAY_BASE_URL repository variable and the matching Xcode Release build setting.
- [ ] Verify QR expiry, single-use credential rotation, replay rejection, channel expiry and publisher deletion.
- [ ] Confirm publisher tokens, reader tokens, encryption keys and full pairing links never appear in logs or frontend IPC.
- [ ] Review Worker observability, WAF rules, rate limits and retention against PRIVACY.md.
- [ ] Run the shared AES-GCM fixture against Rust, Swift and the Android client before shipping Android.

## Windows signing

- [ ] Acquire a current Windows code-signing certificate from a supported provider.
- [ ] Add the base64-encoded PFX as the WINDOWS_CERTIFICATE repository secret.
- [ ] Add its password as the WINDOWS_CERTIFICATE_PASSWORD repository secret.
- [ ] Add the certificate provider's timestamp endpoint as the WINDOWS_TIMESTAMP_URL repository variable.
- [ ] Confirm the tagged workflow reports Valid Authenticode signatures for the application, NSIS installer and MSI.
- [ ] Download both installers in a browser on a clean Windows machine and record the SmartScreen result.

Tagged builds fail before compilation when any required signing value is missing. The temporary PFX, generated Tauri signing configuration and imported runner certificate are removed after the build.

## Distribution integrity

- [ ] Confirm all five installers are attached to one draft GitHub Release.
- [ ] Verify every asset against SHA256SUMS.txt after downloading it.
- [ ] Review the automated NSIS, MSI, Debian, RPM and AppImage smoke-test logs.
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
