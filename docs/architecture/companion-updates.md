# Companion updates

Introduced in `0.1.17`. Users of earlier versions must install it manually once.
Mobile apps continue to use their existing distribution channels; this updater
does not install Android or iOS packages.

## User flow

The Rust runtime checks the public `arvivares/statusline` GitHub releases feed
30 seconds after startup and every six hours. The beta channel includes published
pre-releases; drafts, old versions and releases without `updater.json` are skipped.
Discovery uses bounded pagination and strict numeric product versions. Incomplete,
unreachable or invalid responses must not be reported as a successful current check.
Manual requests share the same operation lock and a one-minute request cooldown.

The Updates button and tray menu open the update dialog. A newly available version
is announced when the companion has focus; it never brings another application's
window to the foreground. **Later** persists the dismissed version. Automatic
checks can be disabled without changing quota synchronization or manual checks.
Preferences live in `updater-preferences.json` inside the app configuration directory.

Selecting **Download & install** confirms installation of the exact offered
version, with progress, signature validation and restart. Downloads continue when
the window hides. A failed check/download/installation displays a localized error;
it does not bypass verification or fall back to an arbitrary executable.

## Installation matrix

| Installed format                | Update payload                   | Behavior                                                              |
| ------------------------------- | -------------------------------- | --------------------------------------------------------------------- |
| macOS DMG / PKG                 | Universal `.app.tar.gz`          | Replace a writable app and restart; otherwise use manual installation |
| Windows NSIS                    | `.exe` for `windows-x86_64-nsis` | Native passive installer and restart                                  |
| Windows MSI                     | `.msi` for `windows-x86_64-msi`  | Native passive installer and restart                                  |
| Linux AppImage                  | `linux-x86_64-appimage`          | Replace the current AppImage and restart                              |
| Linux DEB / RPM; unknown format | Official GitHub release page     | Download matching package and use package manager                     |

Tauri's embedded bundle marker determines the installed format. Generic Windows
or Linux fallback keys are deliberately omitted from the manifest to avoid changing
installation type. Extracted AppImage diagnostic runs cannot self-update.

macOS validates the real `.app/Contents/MacOS` layout, bundle identity and matching
Apple signing team. Replacement is staged on the same volume and uses exclusive
renames with rollback. The previous app is kept in a hidden sibling
`.statusline-backup-*` directory, including after success. Do not remove that
backup until the new app has been verified; if replacement and rollback both
fail, it is the manual recovery copy. The updater never runs an elevated deletion
command or requests an administrator password. Read-only/system-managed locations
use the official DMG/PKG download path instead.

## Trust and release gates

- Native code controls the repository, channel, version and platform. The WebView
  has no general-purpose updater, shell or arbitrary-download permission.
- HTTPS is mandatory, redirects are restricted to GitHub's release infrastructure,
  and download URLs must match an asset in the selected release. Downloads are
  bounded to 512 MiB and 15 minutes. Version checks send no account/relay secrets.
- Tauri verifies the payload signature against the public key embedded in the app
  before any installation. The private key is a dedicated GitHub Actions secret,
  `TAURI_SIGNING_PRIVATE_KEY`; never commit it or expose it to PR/fork jobs.
- This first CI key has an empty password. Set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  if replacing it with a password-protected key. Changing the public key requires
  a migration plan for existing installed apps; do not rotate it casually.
- Keep an offline backup of the private key. Losing it prevents signing updates
  trusted by already-installed companions. Only the public key is versioned.
- Sign final bytes: Linux graphics preparation and macOS notarization/stapling must
  finish before creating updater payloads/signatures. Never reuse an earlier
  signature after repacking or modifying a file.
- `updater.json` is released with the complete installer set, signatures, checksums
  and provenance. Metadata discovery relies on HTTPS and control of the canonical
  GitHub repository; payload signatures do not independently sign release metadata.
- Updater signatures **do not replace** Apple notarization, Windows Authenticode,
  Linux OpenPGP signatures or Android signing. Windows remains explicitly unsigned
  for Authenticode in this beta; OS warnings are still possible.

Debug builds, `--statusline-window-smoke` and processes with
`STATUSLINE_DISABLE_UPDATES` set do not query the release feed. The diagnostic
AppImage script sets this flag. Offline visual previews do not access accounts,
GitHub, pairing data or real installers.

## Required physical-device QA

1. Install `0.1.17` manually and verify **up to date** against that same release.
2. With a later reviewed release, confirm a hidden companion discovers it and
   offers it after reopening; Later survives restart and a newer version reappears.
3. Test manual checks, disabled automatic checks, network errors and interrupted
   downloads; verify no unsigned/tampered payload is installed.
4. Test each direct-upgrade format separately. Check version, restart, executable
   signing and preserved pairing/credentials. On Windows check both MSI and NSIS,
   including install directories with spaces and non-ASCII usernames.
5. Test normal mounted AppImage on the actual Linux desktops/GPUs; verify DEB/RPM
   and extracted diagnostic profiles only offer the download-page fallback.
6. Confirm quota/relay refresh resumes after restart and window auto-hide still
   works. Do not report these checks as passed based only on CI.

See the [release runbook](../release/release-runbook.md) for release publication.
