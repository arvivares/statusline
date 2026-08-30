# Public desktop beta checklist

This checklist is the release gate for a tagged `desktop-v<version>` build. Manual workflow runs remain private, unsigned test artifacts.

## Product

- [ ] Validate Source Settings with standalone Codex and npm Codex on a clean Windows 11 user.
- [ ] Validate automatic detection and manual selection on Ubuntu/Debian and Fedora.
- [ ] Verify signed-in, signed-out, missing CLI, invalid launcher and timeout states.
- [ ] Verify first launch, tray reopen, refresh, close-to-tray and quit.

## Windows signing

- [ ] Acquire a current Windows code-signing certificate from a supported provider.
- [ ] Add the base64-encoded PFX as the `WINDOWS_CERTIFICATE` repository secret.
- [ ] Add its password as the `WINDOWS_CERTIFICATE_PASSWORD` repository secret.
- [ ] Add the certificate provider's timestamp endpoint as the `WINDOWS_TIMESTAMP_URL` repository variable.
- [ ] Confirm the tagged workflow reports `Valid` Authenticode signatures for the application, NSIS installer and MSI.
- [ ] Download both installers in a browser on a clean Windows machine and record the SmartScreen result.

Tagged builds fail before compilation when any required signing value is missing. The temporary PFX, generated Tauri signing configuration and imported runner certificate are removed after the build.

## Distribution integrity

- [ ] Confirm all five installers are attached to one draft GitHub Release.
- [ ] Verify every asset against `SHA256SUMS.txt` after downloading it.
- [ ] Review the automated NSIS, MSI, Debian, RPM and AppImage smoke-test logs.
- [ ] Install and uninstall each package manually on a clean target system.

## Policy and support

- [ ] Review [PRIVACY.md](../../PRIVACY.md) against the shipped behavior.
- [ ] Confirm [SUPPORT.md](../../SUPPORT.md) points to the intended public support channel.
- [ ] Choose the source-code and binary distribution license. The repository currently grants no explicit open-source license; this is intentionally still a public-release blocker.
- [ ] Add the chosen license or EULA to package metadata and the release notes.

## Publish

- [ ] Review generated release notes and known limitations.
- [ ] Keep the GitHub Release as a draft until clean-machine testing is complete.
- [ ] Mark the release as a prerelease for the beta and publish it manually.
