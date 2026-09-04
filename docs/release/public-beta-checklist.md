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
- [ ] Deploy `services/relay` with a public HTTPS hostname and verify GET /health.
- [ ] For Cloudflare, apply all remote D1 migrations and inspect both Worker requests and D1 row metrics.
- [ ] Set the STATUSLINE_RELAY_BASE_URL repository variable and the matching Xcode Release build setting.
- [ ] Verify QR expiry, single-use credential rotation, replay rejection, channel expiry and publisher deletion.
- [ ] Confirm publisher tokens, reader tokens, encryption keys and full pairing links never appear in logs or frontend IPC.
- [ ] Review provider observability, edge protection, rate limits, backups and retention against PRIVACY.md.
- [ ] Review the [relay capacity calculation](../relay/deployment-options.md#cálculo-para-la-versión-actual), reserve at least 20%, and configure usage alerts.
- [x] Bound desktop pairing polling: 3 seconds for the first 30 seconds, 15 seconds afterwards, no overlapping status reads, pause while hidden and stop locally at QR expiry.
- [ ] Run the shared AES-GCM fixture against Rust, Swift and the Android client before shipping Android.

## Android

- [x] Select a Personal Play Console account owned by founder@inmerzion.io while Inmerzion remains a non-incorporated brand/project.
- [x] Build an installable debug APK with minSdk 23 and targetSdk 36.
- [x] Run Android unit tests and Lint, including the shared AES-GCM fixture.
- [x] Provide a clearly labeled local demo that updates both the app and widget without network access.
- [x] Version the native Android project and produce a debug APK artifact in GitHub Actions.
- [x] Test bundled QR, deep-link and manual-paste pairing on a physical device; cover camera permission acceptance, denial and later revocation.
- [x] Test bundled QR and manual pairing on a physical device while Google Play services is disabled.
- [x] Record the unavailable no-camera hardware case as a beta waiver; retain the optional camera manifest declarations, `FEATURE_CAMERA_ANY` guard and tested manual fallback.
- [ ] Verify the Android widget starts at 4×1 Compact, then test Small and Medium by resizing across the 110 dp height and 270 dp width boundaries; recheck after process/device restart.
- [x] Create an upload keystore, protect it in CI and build a signed release AAB/APK.
- [x] Complete Play Console Data safety, Advertising ID, app-content forms and the default `en-US` store listing.
- [x] Submit signed `0.1.10` (`versionCode 6`) as closed Alpha release `0.1.10-alpha.1` in all available countries and regions.
- [ ] Investigate and, when available, upload native debug symbols for bundled native code before production.
- [ ] Have at least 12 testers opt in to Alpha continuously for 14 days, collect feedback, then apply for production access.

The stable upload key is stored outside the repository and its four required values are protected as GitHub Actions secrets. Signed APK/AAB generation, checksums, APK alignment, artifact signature and temporary-key cleanup passed in workflow run [33498280582](https://github.com/arvivares/statusline/actions/runs/33498280582). The upload certificate SHA-256 fingerprint is `A7:8E:0D:AE:32:F8:63:02:D5:7D:D7:5F:13:7D:20:AD:BE:DE:2A:F7:03:EC:28:CF:26:A9:6B:2B:68:E4:15:6C`.

Internal testing release `0.1.9` (`versionCode 5`) passed signed-artifact and R8 registrar verification in workflow run [33512410921](https://github.com/arvivares/statusline/actions/runs/33512410921). Physical QA on 1 September 2026 used an SM-G950F running LineageOS, the Google Play build and a side-by-side `inmerzion.statusline.debug` install from the same workflow. The Play build accepted a real Companion QR. The isolated debug install covered camera acceptance, denial and revocation while the scanner was active; denial kept `OR PASTE` available, revocation stopped the scanner cleanly, and the next attempt requested permission again.

Deep-link and manual-paste routing were exercised with a syntactically valid, nonexistent QA channel. Both reached the claim endpoint and returned the expected channel-unavailable response without replacing live credentials. With `com.google.android.gms` in Android's `disabled-user` state, the bundled scanner opened CameraX, loaded `libbarhopper_v3.so` from the APK and decoded the same fake pairing QR; manual claim routing also reached the relay. The only GMS-related log was the expected `SERVICE_DISABLED` warning, with no fatal exception, registrar failure or bundled-recognition error. Google Play services was re-enabled and verified after each pass.

No physical Android device reporting no camera hardware was available for beta QA. This is an accepted beta waiver, not a claimed physical pass: both camera features are declared optional, the app checks `FEATURE_CAMERA_ANY` before requesting permission, and the manual link fallback remains visible and was validated through the other permission and service-isolation cases.

Google Play submission on 2 September 2026 included the versioned kit in `apps/android/store`, the public deletion URL, all 177 available countries/regions, the existing private tester list and release `0.1.10-alpha.1`. The submission entered review after the mandatory Advertising ID declaration was completed as **No**. Play's only bundle warning concerns optional native debug symbols; there are no blocking release errors.

## iOS / App Store

- [x] Build the app and widget with deployment target iOS 17 using the current SDK.
- [x] Bundle `PrivacyInfo.xcprivacy` in both executables with the App Group UserDefaults reason.
- [x] Provide public Privacy and Support links inside the app.
- [x] Limit the first release, widget and test targets to iPhone only.
- [x] Create or allow Xcode to manage an Apple Distribution identity and App Store profiles.
- [x] Archive and locally export a signed App Store Release build.
- [x] Prepare versioned App Privacy, age-rating, screenshots, listing copy and Review Notes.
- [x] Create the App Store Connect app record, upload Release `1.0` (`1`) and complete physical TestFlight QA.
- [x] Publish the Spanish listing, three iPhone screenshots, 4+ age rating and conservative App Privacy label; configure Free public distribution in all 175 countries or regions.
- [x] Create the `Internal QA` TestFlight group, enable automatic distribution and add the account holder.
- [x] Save the private TestFlight/App Review contact, no-login answer and review notes without versioning personal contact data.
- [x] Create `External Beta`, add one external tester and submit build `1` to Beta App Review.
- [x] Record and verify the account holder's **Non-trader under the DSA** declaration as Active for all 27 EU countries or regions.
- [x] Reset the stale internal tester enrollment and verify that the account holder changes from `No Builds Available` to `Invited`.
- [ ] Wait for Beta App Review approval and confirm that the external tester receives access.
- [x] Complete physical TestFlight QA for real camera pairing, app/widget synchronization and persistence after reopening the app.
- [x] Normalize the iOS icon with Android's Data Plane artwork, upload valid build `1.0` (`2`) and attach it to the App Store version.
- [x] Install build `1.0` (`2`) on the physical iPhone and confirm normal operation.
- [x] Submit version `1.0` (`2`) to App Review and verify **Waiting for Review**.
- [ ] After approval, explicitly release the version from its current manual-release state.

On 2 September 2026, all 11 unit tests passed on an iPhone 17 Pro running iOS 27 beta. The local-demo UI test passed on that device while preserving its real 71% paired snapshot; simulator UI tests also passed for the 70% local demo, scanner fallback and manual editor. Release `1.0` (`1`) was archived for `inmerzion.statusline`, exported with Apple Distribution profiles for the app and widget, installed on the same iPhone and launched successfully. App Store Connect processed it as Validated and assigned it to `Internal QA`. The private TestFlight and App Review contacts and review notes are saved. The account holder's Non-trader under the DSA declaration is Active for all 27 EU countries or regions. `External Beta` contains one tester, and build `1` remains Waiting for Review after submission to Beta App Review. On 3 September, removing the redundant individual assignment and re-adding the account holder to `Internal QA` changed the internal tester immediately from `No Builds Available` to `Invited`; the invitation was received, and real QR pairing, widget synchronization and persistence passed on the physical iPhone. The iOS icon was then normalized to the Android Data Plane artwork in icon-only build `1.0` (`2`). That archive and exported IPA passed local version, signature, profile, entitlement and icon checks; App Store Connect processed it as Valid and App Store Eligible. Build `2` was installed and confirmed operational on the physical iPhone, replaced build `1` on the product version, and submission `82a8811b-67a9-48b4-bd43-1cff4b741f7f` entered **Waiting for Review** on 3 September. Manual release remains selected.

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

## Linux signing

- [x] Create a dedicated RSA-4096 OpenPGP release-signing key.
- [x] Commit only the public key and publish its full fingerprint.
- [x] Store the encrypted private-key export and passphrase as separate GitHub Actions secrets.
- [ ] Generate signed DEB, RPM and AppImage artifacts in CI and verify every detached signature independently.
- [ ] Verify the signed installers after downloading them from GitHub Actions on a clean Linux machine.

The official signing-key fingerprint is `7076 AFAF 1090 C370 9D1F 080C 5D77 9E12 FC11 30DB`. The private key is never stored in the repository or uploaded as an artifact.

## Distribution integrity

- [ ] Confirm all seven installers are attached to one draft GitHub Release.
- [ ] Verify every asset against SHA256SUMS.txt after downloading it.
- [ ] Verify `SHA256SUMS.txt.asc` and all three Linux installer signatures against the published OpenPGP fingerprint.
- [ ] Review the automated NSIS, MSI, Debian, RPM, AppImage, universal DMG and PKG smoke-test logs.
- [ ] Install and uninstall each package manually on a clean target system.

## Policy and support

- [x] Review [PRIVACY.md](../../PRIVACY.md) against the deployed relay behavior and hosting provider.
- [x] Publish the current policy and support documents as tracker-free HTTPS pages.
- [x] Confirm [SUPPORT.md](../../SUPPORT.md) and the public support page use founder@inmerzion.io.
- [ ] Decide whether background mobile updates are required for beta; document foreground-only refresh if APNs/FCM is deferred.
- [x] License the source code and binaries under MIT.
- [x] Add the MIT license to the repository and package metadata.

## Publish

- [ ] Review generated release notes and known limitations.
- [ ] Keep the GitHub Release as a draft until clean-machine testing is complete.
- [ ] Mark the release as a prerelease for the beta and publish it manually.
