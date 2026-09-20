# Claude Code source

Status: opt-in live quota through Claude Code's documented `statusLine` hook.
Research checked against Anthropic documentation on 2026-09-16 and verified on a
real Claude Code 2.1.276 session on macOS on 2026-09-18 (Enterprise seat). Windows
and Linux execution of the bridge is covered by unit tests and fixtures only.

## How it works

Claude Code documents one supported way to expose subscription quota to an
external program: the user's `statusLine` command receives the session JSON on
stdin, and that JSON carries `rate_limits.five_hour`, `rate_limits.seven_day` and,
behind a Claude apps gateway, `rate_limits.spend_limit`, each with `used_percentage`
and `resets_at`. See [Statusline › rate limit usage](https://code.claude.com/docs/en/statusline#rate-limit-usage).

Companion uses that hook as its transport:

1. **Discovery** checks native CLI/Desktop locations, global npm shims, absolute
   inherited PATH entries and bounded version-manager locations by metadata only.
   A detected installation creates the Claude row; nothing is run. No shell init
   file, credential or conversation is read. Discovery runs at startup, on focus
   when its cache is older than 60 seconds, and on the native five-minute schedule.
2. **Enable quota** appears directly in the Claude focus view when a CLI or a
   previous bridge capture is detected. Before the user clicks, the view explains
   that Claude Code's status line will be updated and the existing one preserved.
   **Connect Claude Code** in Settings › Services remains an alternative. Neither
   discovery nor viewing the row grants consent: only clicking a connect button
   writes a
   `statusLine` object into the user's Claude Code `settings.json` whose command
   runs the Companion executable in bridge mode:
   `"<companion>" --statusline-claude-bridge "<config dir>/claude-statusline-capture-v1.json"`,
   with `refreshInterval: 60` so idle sessions keep reporting. Every other key in
   `settings.json` is preserved and a verbatim backup is stored once in
   Companion's config folder. An existing custom status line is saved to a chain
   file, keeps running with the same stdin, and is restored by **Disconnect**.
3. **Bridge** (`claude::run_bridge`) reads at most 64 KiB from stdin, keeps only
   the three documented windows plus a capture time, writes them atomically with
   `0600` permissions and prints either the chained status line or a one-line
   summary (`Claude · 5h 48% left · 7d 53% left`). Session, transcript, workspace,
   cost, context and model fields never reach disk. A payload without
   `rate_limits` (session start, API-key session) records the activity time but
   keeps the last limits Claude Code reported; a payload with limits replaces the
   whole object, so windows Claude Code dropped after their reset disappear too.
4. **Reader** (`claude::read_capture`) runs with the existing 60-second focus and
   five-minute native schedule. The sample time is Claude Code's report time,
   never the read time. Windows whose `resets_at` already passed are dropped at
   read time, so a five-hour value is shown for at most five hours after the last
   report. Captures dated more than five minutes in the future are ignored.
5. **Projection** to `services-v1` reuses `claude_quota_projection`: `ready` with
   the reported windows, `unavailable` while installed without a current window.
   A spend limit is never projected as a quota window. Unchanged captures do not
   republish or refresh a sample's age.

## One code path for every plan

The transport, payload and parser are identical for every account. The only
difference between users is which windows are present, so every decision is made
on window presence, never on plan type.

| Account                                         | `rate_limits` observed or documented | Companion state                                                  |
| ----------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| Pro / Max                                       | `five_hour` and `seven_day`          | `ready`, both windows                                            |
| Team / Enterprise seat (verified on Enterprise) | `five_hour`; `seven_day` absent      | `ready`, five-hour window only; weekly stays empty, not inferred |
| Behind a Claude apps gateway with a spend limit | `spend_limit`, may exceed 100 %      | `noPlanQuota` with the spend percentage in the detail text       |
| Console API key, Bedrock, Vertex, Foundry       | none                                 | `noPlanQuota` ("session without plan quota")                     |
| Any plan before the first API response          | none yet                             | last limits kept; `quotaUnavailable` if none were ever reported  |
| CLI installed, bridge not connected             | not captured                         | `quotaUnavailable` with an explicit **Enable quota** action       |

The Enterprise row is an observation, not a guarantee: Anthropic's statusline
documentation lists `rate_limits` for Pro and Max subscribers and gateway users
only. The real payload from an Enterprise seat carried `five_hour` and no
`seven_day`; the parser already treats a missing window as unknown, never as
100 % remaining, so a later appearance of `seven_day` needs no code change.

## Privacy and boundaries

- Only `settings.json` inside `CLAUDE_CONFIG_DIR` (default `~/.claude`) is read
  or written, and only its `statusLine` key is interpreted. Credentials,
  `history.jsonl`, sessions, transcripts and project folders are never opened.
- Connecting is a user action. Discovery and refresh never edit vendor settings.
  Disconnect restores the previous `statusLine` or removes ours, and deletes the
  capture and chain files. `disconnect` leaves a `statusLine` that is not ours
  untouched.
- The bridge never runs a prompt and cannot spend quota. It is invoked by Claude
  Code inside the user's own session, so no authentication, account selection or
  vendor endpoint is handled by Companion. The capture identifies no account.
- Paths written into the command are double-quoted; paths containing quote,
  `$`, backtick, backslash, `%` or control characters are refused rather than
  escaped. A moved or updated Companion keeps working while its executable path
  is stable; reinstalling to another folder requires reconnecting.
- The tray tooltip, focus row, watchlist and `services-v1` show only windows
  Claude Code reported. `acceptClaudeView` rejects a `ready` view without a window
  and drops unknown fields before they reach UI state.

## Freshness

Quota changes only when the account is used, and Claude Code reports only while a
session is open. The Companion shows the report time of the sample it holds
("Last sample") and the last time any session ran the bridge ("Last Claude Code
session"). Usage from claude.ai chat or another machine changes the real quota
without a new report until the next Claude Code response; the five-hour window
therefore cannot be more than five hours stale, the weekly window up to a week.

## Platform coverage

Passive discovery also covers these common layouts without requiring a GUI
process to inherit the interactive shell's PATH:

- macOS/Linux: native launchers, Homebrew/system paths, npm global prefixes,
  NVM, fnm, Volta, asdf and mise shims/version directories.
- Windows: native launcher, WinGet links, user npm (`APPDATA/npm`) including
  `.cmd`/`.ps1` shims, Scoop, Volta, NVM and fnm layouts. All user paths are
  derived dynamically; no username is hardcoded.

The scan is limited to 256 candidates, 64 PATH entries and 32 entries per
version-manager directory. Fixed common paths take priority. Relative, current
project, `node_modules/.bin`, parent-traversal and control-character PATH entries
are excluded. Directory enumeration is one level only, not a disk-wide search.
These are installation hints, not publisher or authentication verification.
Nonstandard layouts may still require their launcher directory in Companion's
PATH. See Anthropic's [installation reference](https://code.claude.com/docs/en/setup).

Detecting the Claude chat desktop app alone does not prove a Claude Code CLI
installation. In that case the UI explains the requirement instead of offering
an activation that cannot report quota. It never installs or launches Claude.

| OS      | Bridge invocation by Claude Code                      | Verification                                                  |
| ------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| macOS   | `sh -c` quoting; chained command through `sh -c`      | Real session verified: capture, summary, chaining, exit codes |
| Linux   | Same as macOS                                         | Unit tests and fixtures; real session pending                 |
| Windows | Double-quoted paths; chained command through `cmd /C` | Unit tests and fixtures; shell used by Claude Code unverified |

Custom installation layouts still need no extra discovery once connected: a
capture written by the bridge makes Claude visible even when no conventional
launcher was found.

## Remaining gates

1. Verify the Windows shell Claude Code uses for `statusLine` and the Linux
   Desktop package with a real session; adjust quoting if PowerShell is involved.
2. Add Claude to the mobile decoders, focus/watchlist and widgets with EN/ES QA.
   Current mobile clients ignore the `claude` entry and keep showing Codex/Gemini.
3. Decide whether to surface a gateway spend limit on mobile; today it stays on
   the Companion only.
4. Re-run the scoped [security assessment](../security/claude/THREAT-MODEL.md)
   for the live transport: settings write, bridge execution and capture file.

## Verification

The runtime test crate compiles the production bridge, reader, connect/disconnect
and inventory code without Tauri. Desktop tests cover IPC validation for the five
states, the Enterprise five-hour-only case, gateway and API-key sessions, and the
three-provider focus/watchlist. Repository checks validate the EN/ES catalogs. On
macOS the debug binary was exercised directly: fixture and real payloads produce
the reduced capture with `0600` permissions, a payload without `rate_limits`
keeps the last limits, a chained command receives the same stdin, garbage stdin
exits with code 3 without touching the capture, and a missing argument exits 2.
The checked-in [fixture](../../protocol/fixtures/claude-statusline.json) is synthetic.

The discovery/activation extension adds fixtures for all three platforms,
GUI-safe version managers, deduplication and scan bounds, unsafe PATH exclusion,
and preservation of settings during passive scans. Frontend checks cover
activation eligibility (including desktop-only, unreadable settings and failed
discovery), unchanged provider IDs, and company/tool display identities. These
fixtures do not replace real Windows/Linux account validation.

Local Browser Use checks at 340 × 500 verified the inline consent, error/retry,
duplicate-click suppression, disconnect, keyboard focus, desktop-only/missing
states, and EN/ES with English fallback, using synthetic IPC only. The watchlist
uses tool names with decorative chevrons (`Antigravity ›`, `Claude-Code ›`);
the entire row remains a native button operable by keyboard. No real Claude
settings or pairing were changed during these checks.
