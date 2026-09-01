# Public desktop beta checklist

This checklist is the release gate for a tagged desktop-v<version> build. Manual workflow runs remain private, unsigned test artifacts.

## Product

- [ ] Validate Source Settings with standalone Codex and npm Codex on a clean Windows 11 user.
- [ ] Validate automatic detection and manual selection on Ubuntu/Debian and Fedora.
- [ ] Verify signed-in, signed-out, missing CLI, invalid launcher and timeout states.
- [ ] Verify first launch, tray reopen, refresh, close-to-tray and quit.
- [ ] Verify macOS stays out of the Dock and Command-Tab while remaining available from the menu bar.
- [ ] Verify a clean signed install accesses its relay Keychain item without repeated prompts; separately test migration from an unsigned prerelease build.
- [ ] Pair clean Windows, Linux and macOS publishers with iOS and Android; verify the same snapshot in both apps and widgets.
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

## Android

- [x] Select a Personal Play Console account owned by founder@inmerzion.io while Inmerzion remains a non-incorporated brand/project.
- [x] Build an installable debug APK with minSdk 23 and targetSdk 36.
- [x] Run Android unit tests and Lint, including the shared AES-GCM fixture.
- [x] Provide a clearly labeled local demo that updates both the app and widget without network access.
- [x] Version the native Android project and produce a debug APK artifact in GitHub Actions.
- [x] Test bundled QR, deep-link and manual-paste pairing on a physical device; cover camera permission acceptance, denial and later revocation.
- [x] Test bundled QR and manual pairing on a physical device while Google Play services is disabled.
- [ ] Test the manual fallback on a device that reports no camera hardware.
- [ ] Verify the Android widget starts at 4×1 Compact, then test Small and Medium by resizing across the 110 dp height and 270 dp width boundaries; recheck after process/device restart.
- [x] Create an upload keystore, protect it in CI and build a signed release AAB/APK.
- [ ] Complete Play Console Data safety, store listing and closed-track testing.

The stable upload key is stored outside the repository and its four required values are protected as GitHub Actions secrets. Signed APK/AAB generation, checksums, APK alignment, artifact signature and temporary-key cleanup passed in workflow run [33498280582](https://github.com/arvivares/statusline/actions/runs/33498280582). The upload certificate SHA-256 fingerprint is `A7:8E:0D:AE:32:F8:63:02:D5:7D:D7:5F:13:7D:20:AD:BE:DE:2A:F7:03:EC:28:CF:26:A9:6B:2B:68:E4:15:6C`.

Internal testing release `0.1.9` (`versionCode 5`) passed signed-artifact and R8 registrar verification in workflow run [33512410921](https://github.com/arvivares/statusline/actions/runs/33512410921). Physical QA on 1 September 2026 used an SM-G950F running LineageOS, the Google Play build and a side-by-side `inmerzion.statusline.debug` install from the same workflow. The Play build accepted a real Companion QR. The isolated debug install covered camera acceptance, denial and revocation while the scanner was active; denial kept `OR PASTE` available, revocation stopped the scanner cleanly, and the next attempt requested permission again.

Deep-link and manual-paste routing were exercised with a syntactically valid, nonexistent QA channel. Both reached the claim endpoint and returned the expected channel-unavailable response without replacing live credentials. With `com.google.android.gms` in Android's `disabled-user` state, the bundled scanner opened CameraX, loaded `libbarhopper_v3.so` from the APK and decoded the same fake pairing QR; manual claim routing also reached the relay. The only GMS-related log was the expected `SERVICE_DISABLED` warning, with no fatal exception, registrar failure or bundled-recognition error. Google Play services was re-enabled and verified after each pass. Hardware with no camera remains a separate open case.

## iOS / App Store

- [x] Build the app and widget with deployment target iOS 17 using the current SDK.
- [x] Bundle `PrivacyInfo.xcprivacy` in both executables with the App Group UserDefaults reason.
- [x] Provide public Privacy and Support links inside the app.
- [x] Limit the first release, widget and test targets to iPhone only.
- [ ] Create or allow Xcode to manage an Apple Distribution identity and App Store profiles.
- [ ] Archive a signed Release build and upload it to TestFlight.
- [ ] Complete App Privacy, age rating, DSA trader status, screenshots and Review Notes.

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

- [x] Review [PRIVACY.md](../../PRIVACY.md) against the deployed relay behavior and hosting provider.
- [x] Publish the current policy and support documents as tracker-free HTTPS pages.
- [x] Confirm [SUPPORT.md](../../SUPPORT.md) and the public support page use founder@inmerzion.io.
- [ ] Decide whether background mobile updates are required for beta; document foreground-only refresh if APNs/FCM is deferred.
- [ ] Choose the source-code and binary distribution license. The repository currently grants no explicit open-source license.
- [ ] Add the chosen license or EULA to package metadata and release notes.

## Publish

- [ ] Review generated release notes and known limitations.
- [ ] Keep the GitHub Release as a draft until clean-machine testing is complete.
- [ ] Mark the release as a prerelease for the beta and publish it manually.
