# Claude integration foundation

Status: experimental, not a live quota integration. Research checked against
Anthropic documentation on 2026-09-16. No Claude installation or account was used
for this implementation; fixtures do not prove compatibility with real sessions.

## What works in this branch

- Companion automatically checks conventional local CLI/Desktop locations at
  startup, on focus (60-second cache), and on the native five-minute schedule.
  No user command, path entry or manual configuration is required for those locations.
- Only a detected installation creates a Claude row in Still Signature's existing
  focus/watchlist. The row explicitly says quota reading is not available yet.
- CLI and Desktop presence are separate facts. Neither proves login, subscription,
  account identity or quota access; no automatic account selection takes place.
- The pure parser normalizes the documented five-hour and seven-day `rate_limits`
  fields from supplied JSON. It is **not wired to a live transport**.
- A detected Claude projects to `services-v1` as `unavailable`, with no quota.
  The existing mobile clients ignore that unknown ID. They continue displaying
  Codex/Gemini from the same pairing. There is no mobile Claude UI in this branch.

## Official evidence and boundaries

| Source                                                                    | Documented capability                                                                  | Integration decision                                                                                                                                    |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Setup](https://code.claude.com/docs/en/setup)                            | Native CLI launcher under the user's `.local/bin`; Homebrew, WinGet and Linux packages | Probe launchers without running them. No inherited project PATH.                                                                                        |
| [CLI reference](https://code.claude.com/docs/en/cli-reference)            | `claude auth status`, version information and interactive usage commands               | Do not invoke prompts or treat installation as successful authentication. No documented standalone quota JSON command was identified in this reference. |
| [Statusline](https://code.claude.com/docs/en/statusline#rate-limit-usage) | Optional five-hour/seven-day consumed percentages and reset epochs                     | Normalize these fields only. Context, token counts, dollar cost and gateway spend are different quantities.                                             |
| [Desktop](https://code.claude.com/docs/en/desktop-quickstart)             | Code is included; terminal CLI installation is separate                                | Do not assume Desktop exposes its runtime/session as an external quota API.                                                                             |
| [Linux Desktop beta](https://code.claude.com/docs/en/desktop-linux)       | Official Ubuntu/Debian package and `claude-desktop` launcher                           | Probe conventional system launcher locations; other distributions and repackaged apps are not certified by these tests.                                 |

The documented statusline data appears after a session has received an API
response and depends on account eligibility. Each window may be absent. The
statusline refresh timer reruns a local command; it is not proof of a fresh quota
request. Transparent, autonomous quota collection is still an unresolved gate.

## Discovery coverage

All paths are relative to the **current user's** home/application directories,
not a developer's username. Probes check filesystem metadata only; paths and
filenames are presence hints, not publisher verification. Sources are not started,
so a closed app can be detected but its quota cannot yet be read.

| OS      | CLI candidates                                                             | Desktop presence hints                                                                                |
| ------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| macOS   | `~/.local/bin/claude`, `/opt/homebrew/bin/claude`, `/usr/local/bin/claude` | `Claude.app/Contents/MacOS/Claude` in system/user Applications                                        |
| Windows | `%USERPROFILE%\.local\bin\claude.exe`, current-user WinGet Links           | Conventional `AnthropicClaude` / `Programs\Claude` under LocalAppData and `Claude` under ProgramFiles |
| Linux   | `~/.local/bin/claude`, `/usr/local/bin/claude`, `/usr/bin/claude`          | `/usr/local/bin/claude-desktop`, `/usr/bin/claude-desktop`                                            |

Desktop hints are not an officially guaranteed installation layout. Custom
prefixes, portable apps, npm shims outside these roots, Windows Store/MSIX-only
installs, and a CLI inside WSL from a Windows Companion need additional discovery
evidence. Do not advertise complete Desktop discovery coverage yet. These gaps do
not affect Codex or Antigravity discovery.

## Data, visibility and compatibility

`claude.rs` returns only presence flags, revision, attempt time and availability
status to the WebView. Failed scans do not remove previously detected services;
a successful negative scan removes Claude. No Claude credentials, settings,
transcripts, conversation caches or vendor HTTP endpoints are accessed.

The parser accepts at most 64 KiB. It rejects malformed or out-of-range windows;
missing/expired windows become unknown, not 100% remaining. It keeps only the
remaining percentage, reset and caller-supplied capture time. It never infers a
weekly quota from the short window. Unknown/private JSON fields are discarded.
The checked-in [fixture](../../protocol/fixtures/claude-statusline.json) is synthetic.

The inventory waits for the initial Claude scan (bounded to three seconds from
the caller's perspective), alongside Codex and Gemini. Unchanged presence does
not trigger a new relay publication or refresh a quota's sample age. Collector
revisions reject late results. A future live adapter must pin the selected source
and account context **before reading**; discovery cannot silently merge or switch
Desktop/CLI accounts.

The existing channel, tokens, AES-GCM key, nonce rules, legacy Codex projection,
endpoints, payload limits and database schema remain unchanged. No relay deployment
or re-pairing is needed for this foundation. No installer/store release is implied.

## Gates before enabling live quota

1. Establish a supported read-only transport that works without manual user setup.
   Do not scrape private credentials or silently overwrite `statusLine`/hooks.
2. Validate capture freshness, idle/closed-app behavior and expiration. Re-reading
   cached JSON must never update its original sample time.
3. Verify authentication and source isolation for Desktop vs CLI, custom config
   directories, multiple installations and account switching.
4. If execution becomes necessary: verify publisher/runtime, bound output and
   process lifetime, isolate environment and disable agent customization side
   effects. Never use a prompt as a quota query.
5. Run real macOS/Windows/Linux cases for logged-in/out sessions, unsupported plans,
   missing windows, update/uninstall, timeout and conflicting sources. No requirement
   for the maintainer to install Claude; volunteers may provide reviewed diagnostics.
6. Add Claude to mobile decoders, focus/watchlist and widgets with EN/ES native QA,
   then publish a coordinated release. Older mobile builds must keep ignoring it.

## Verification

The runtime test crate compiles production discovery/parser/inventory code without
installers or Claude. Desktop tests cover IPC validation, visibility and the
three-provider focus/watchlist. Repository checks validate EN/ES generated catalogs.
macOS native `cargo check` covers the Tauri command and background scheduling glue.
CI's existing Linux/Windows matrix remains the platform compilation gate.

See the scoped [security assessment](../security/claude/THREAT-MODEL.md).
