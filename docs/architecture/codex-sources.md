# Codex runtime sources

Statusline can read Codex usage without a separately installed Codex CLI by using
a compatible desktop app's bundled runtime. On macOS it reuses
`Contents/Resources/codex` inside **ChatGPT.app** or **Codex.app**. Windows desktop
discovery is implemented in source; validation on a desktop-only Windows device
is still pending. An older ChatGPT installation without a Codex executable is not
supported by this source. Statusline does not bundle or download OpenAI binaries.

## Discovery and precedence

1. `STATUSLINE_CODEX_PATH`, if explicitly configured.
2. A path saved in **Connections → Codex Source**.
3. macOS desktop apps: ChatGPT.app, then Codex.app, in `/Applications`, then the
   current user's `Applications` directory. On Windows, registered OpenAI desktop
   packages, then conventional per-user/system desktop installations.
4. Existing standalone, npm, Homebrew and version-manager locations, then `PATH`.

Both diagnosis and usage queries verify `codex --version` before accepting a
candidate. Missing, non-launchable and invalid candidates fall through to the
next source. This checks executability and version output, **not publisher trust**;
install the OpenAI app from its official distribution and keep OS protections
enabled. Explicitly selecting a different source can change the local session used.

macOS users with a renamed app or a nonstandard install location can select the
`.app` package manually. Statusline resolves its bundled executable without a
shell and keeps the package path in settings. Automatic results are not persisted
or pinned to an updater's version directory. `DESKTOP APP` / `APP DE ESCRITORIO`
identifies an automatically found bundle; explicit choices remain `SAVED PATH`.

### Windows desktop discovery

The previous implementation only added desktop-app detection on macOS. Windows
searched standalone/npm/PATH launchers (including `Programs/OpenAI/Codex/bin`),
which did not cover the executable inside a Microsoft Store desktop package.

- Query the current user's registered MSIX/Appx packages with the system Windows
  PowerShell and [`Get-AppxPackage`](https://learn.microsoft.com/en-us/powershell/module/appx/get-appxpackage).
  Only `OpenAI.ChatGPT-Desktop`, `OpenAI.ChatGPT` and `OpenAI.Codex` names are
  considered. Use the returned `InstallLocation`, not a hard-coded WindowsApps
  version, drive or username. Metadata is rediscovered on each check/read and is
  never saved as the user's selected path.
- Probe only `resources/codex.exe` and `app/resources/codex.exe` below these roots.
  Also check `Programs/{ChatGPT,Codex,OpenAI/ChatGPT,OpenAI/Codex}` below the
  current user's Local AppData and the equivalent Program Files roots, including
  bounded numeric `app-*` update directories. Do not launch the graphical app
  as a runtime or recursively search the disk/WindowsApps.
- Discovery has an eight-second timeout, no shell profile, no console window,
  no elevation and no policy/ACL changes. Empty, malformed, unavailable or blocked
  package metadata falls through to conventional installs and existing CLI
  discovery. `codex --version` still verifies every selected executable before
  the same source is used for account/quota reads.
- Package names and version output are discovery checks, **not** a certificate
  verification service. Keep Windows security protections enabled. Unknown
  package identities/layouts are not automatically supported; select the actual
  bundled `codex.exe` in Source Settings if accessible, never `ChatGPT.exe`, a
  shortcut or the graphical `Codex.exe`.

This uses the existing App Server transport; it does not attach to another
process or claim to reuse every desktop authentication mode. Native Windows and
WSL installations/profiles are separate; this change does not run WSL or bridge
its credentials. Linux retains its existing CLI discovery.

## Session and privacy boundary

The transport remains local JSONL over stdio using the documented
[Codex App Server](https://learn.chatgpt.com/docs/app-server) protocol:
`initialize`, `initialized`, `account/read` (`refreshToken: false`) and
`account/rateLimits/read`. No threads, prompts, turns or model requests are created.
An explicitly null account skips the quota call and displays a sign-in state.

The OpenAI runtime manages its own authentication. Statusline does not extract
desktop cookies, read/copy `auth.json`, inject tokens, force login/logout, or publish
account identifiers to the relay. The existing encrypted quota snapshot and mobile
clients are unchanged. See [OpenAI authentication](https://learn.chatgpt.com/docs/auth)
for local credential storage behavior.

A desktop sign-in does not guarantee every spawned runtime can reuse it: an
externally managed or ephemeral session may be unavailable. A custom `CODEX_HOME`
can also select a different profile. If Statusline asks for sign-in:

1. Open Codex inside the OpenAI app and confirm that it is signed in, then refresh.
2. Check the selected source; do not copy account files or share credentials.
3. If the session is still unavailable, the user can explicitly run `login` with
   the bundled executable shown in Source Settings, using its quoted absolute
   path (for example, `"/Applications/ChatGPT.app/Contents/Resources/codex" login`).
   This invokes OpenAI's own login flow without installing a separate CLI. It may
   change the shared Codex session; Statusline never runs it automatically.

App Server and the bundle layout can change independently of Statusline. An
executable with valid version output can still have an incompatible protocol;
this is reported as a query error, not treated as permission to inspect credentials.

## Release validation: macOS without a separate CLI

Use the **signed and notarized 0.1.14 DMG or PKG** from the reviewed release.
Do not uninstall a working CLI or delete authentication files just to test.

- On the clean test Mac, record macOS version, CPU architecture, OpenAI app version
  and Statusline version. Confirm `command -v codex` returns no executable and
  that this OS user has never installed/signed into the standalone CLI; absence
  from `PATH` alone does not prove a clean profile.
- Open Codex in ChatGPT/Codex.app and sign in through the official UI.
- Launch Statusline from Applications, not a development terminal. In Codex Source,
  confirm **VERIFIED**, **DESKTOP APP**, and a path ending in
  `.app/Contents/Resources/codex`, with no saved path/override.
- Refresh. Compare weekly remaining percentage and reset with the OpenAI app.
  No CLI installation, API key or Statusline-managed login should be necessary.
- Close and reopen Statusline and repeat. Check the menu-bar meter, then existing
  mobile pairing and widget sync. Do not disconnect a working pairing for this test.
- If no session is available, record the translated state and whether the explicit
  bundled-runtime login was needed. That is **not** seamless desktop-session reuse.
- Share only app versions, source type and observed result. Redact username paths,
  account details and pairing QR codes; do not share raw logs/authentication files.

Development-machine validation with a reduced `PATH` proves that the embedded
executable is sufficient, but not that a new OS user can reuse the desktop session.
Keep the clean-device result pending until physically tested.

Developers can inspect production discovery without compiling the UI:

```shell
cargo run --manifest-path apps/desktop/runtime-tests/Cargo.toml --locked --example inspect-codex
```

This checks local executable versions only and ignores saved UI settings. Add
`-- --usage` only to explicitly query the local account through App Server; only
the normalized quota response is printed, never raw account/authentication data.
Paths may still contain your OS username: review output before sharing it.

## Windows validation before release

Local evidence (10 September 2026): 43 lightweight Rust tests passed on macOS;
the production modules and all test targets also passed `cargo check` for
`x86_64-pc-windows-gnu`. Desktop tests passed (141 passed, one pre-existing skip),
as did TypeScript, formatting, localization and local Markdown links. Clippy
still reports the pre-existing `collapsible_if` warning in `refresh.rs`; no new
lint warnings remain in this change. The Windows PowerShell fixture test is wired
into CI but has not been executed locally. No Windows installer or real Windows
account/session has been tested yet, and no new release was published.

The lightweight Rust suite covers package metadata, path filtering, spaces,
non-system drives, updater paths, ordering and fallback. Cross-target type checking
is not execution on Windows, and CI cannot prove reuse of a real desktop session.
Do not claim clean-device support or publish a fix as verified until this passes:

1. Record Statusline, Windows and ChatGPT/Codex Desktop versions and whether the
   desktop app came from Microsoft Store. Use a normal, non-administrator account
   with no separate CLI installation; do not uninstall working software for QA.
2. Open Codex in the official desktop app and sign in there. Start Companion from
   the Start menu, not from an installer or a developer terminal.
3. With no saved path/override, verify **DESKTOP APP**, **VERIFIED**, and the
   bundled `resources/codex.exe` path in **Connections → Codex Source**. Refresh
   and compare remaining percentage and reset time with the desktop app.
4. Hide Companion, observe a later sample with the computer awake, then verify
   the existing iOS/Android pairing receives it. Do not disconnect/re-pair.
5. Restart Companion and repeat after a desktop-app update. Check both NSIS and
   MSI installations use the same discovery. Missing/blocked packages must not
   prevent a working CLI or an explicitly selected runtime from being used.

For a detection failure, run this **read-only** diagnostic in Windows PowerShell
from a checkout of this source (it does not need Codex CLI):

```powershell
& .\apps\desktop\scripts\discover-codex-desktop-windows.ps1
```

It prints only selected package names and installation locations. Redact the OS
username before sharing; do not share account files, tokens, QR codes or raw
process logs. If execution policy blocks the script, do not disable it: use
`Get-AppxPackage -Name 'OpenAI.*' | Select-Object Name, InstallLocation` manually
and review the output. If detection succeeds but the account is unavailable, use
the session guidance above; installing another CLI is not a proven remedy.
