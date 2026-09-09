# Codex runtime sources

Statusline can read Codex usage on macOS without a separately installed Codex CLI.
It reuses the `Contents/Resources/codex` executable shipped inside **ChatGPT.app**
or **Codex.app**. An older ChatGPT installation without that executable is not
supported by this source. Statusline does not bundle or download OpenAI binaries.

## Discovery and precedence

1. `STATUSLINE_CODEX_PATH`, if explicitly configured.
2. A path saved in **Connections → Codex Source**.
3. macOS desktop apps: ChatGPT.app, then Codex.app, in `/Applications`, then the
   current user's `Applications` directory.
4. Existing standalone, npm, Homebrew and version-manager locations, then `PATH`.

Both diagnosis and usage queries verify `codex --version` before accepting a
candidate. Missing, non-launchable and invalid candidates fall through to the
next source. This checks executability and version output, **not publisher trust**;
install the OpenAI app from its official distribution and keep macOS protections
enabled. Explicitly selecting a different source can change the local session used.

macOS users with a renamed app or a nonstandard install location can select the
`.app` package manually. Statusline resolves its bundled executable without a
shell and keeps the package path in settings. Automatic results are not persisted
or pinned to an updater's version directory. `DESKTOP APP` / `APP DE ESCRITORIO`
identifies an automatically found bundle; explicit choices remain `SAVED PATH`.

Windows and Linux keep their existing CLI discovery. Automatic detection of
Windows Store/MSIX bundles or third-party Linux desktop packages is **not** claimed.

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
