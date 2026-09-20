# Claude foundation: scoped security assessment

## 1. Overview

Scope: uncommitted Claude foundation on `6eb0bb5`, 2026-09-16. This is a local
presence detector and a pure, currently disconnected quota parser; not an agent
or a vendor-auth integration. Protect user files/credentials, truthful quota
presentation and existing paired services. Machine-readable findings are in
[findings.json](findings.json). No confirmed vulnerability found in this scope;
this is not certification of a future live transport.

## 2. Trust boundaries and assumptions

- User environment and installation paths → `claude::candidates` → metadata probes.
  Names and files can be forged by the same OS user. Presence is unauthenticated.
- Supplied JSON → `claude::parse_statusline` → sanitized quota structures.
  There is no production JSON ingestion endpoint yet.
- Native `View` → `acceptClaudeView` → text-only UI; no vendor strings as HTML.
- Local inventory → the existing encrypted relay. The new projection contains
  only the fixed ID, unavailable status and timestamp; no source path or auth data.

The application runs as the signed-in OS user. Existing vendor credentials are
out of scope for reading and writing. A fully compromised same-user environment
is not made trustworthy by installation discovery.

## 3. Attack surfaces and controls

### Installation spoofing and execution

`discover` obtains current-user roots; `candidates` admits only absolute roots and
fixed suffixes. `executable_exists` performs metadata checks, never starts a process,
follows no shell configuration and reads no file contents. A fake launcher can
create a local **unavailable** row, not run code or fabricate quota. Symlinks are
supported for the documented CLI launcher. They are not a future execution grant.

Filesystem calls run on a blocking worker with a three-second async deadline.
An OS-level blocked metadata operation may outlive that deadline (Rust cannot
cancel it). Its handle is retained and reused by later polls, so at most one
discovery worker remains outstanding. The probe set is small and non-recursive;
there is no public input that triggers scans.

### Untrusted quota data

The disconnected parser caps input at 64 KiB, uses typed fields, checks percentage
and epoch bounds, drops expired windows and discards unrelated fields. It does
not fetch `transcript_path` or evaluate commands. Real ingestion still needs
authenticated provenance and an original capture time; a valid JSON shape alone
must not be trusted as a fresh quota.

### IPC and inventory

`acceptClaudeView` validates types, status/presence consistency, timestamps and
revisions, and returns only known fields. Rendering uses `textContent` and DOM
nodes. Inventory updates never invoke the pure parser or emit a ready Claude
reading. Revisions prevent stale resurrection; unsuccessful scans retain known
presence; successful uninstall hides it. Repeated presence does not cause quota
freshness or relay request amplification. Codex's legacy projection is unchanged.

## 4. Systemic findings

No confirmed systemic finding in this change. Live credential handling and
vendor-process execution are deliberately absent, not silently considered safe.

## 5. Exploit chains

No demonstrated path from a forged installation file or supplied JSON to code
execution, credential disclosure or ready quota publication. Introducing a live
transport changes that conclusion and requires a new review.

## 6. Calibration and remaining gates

Presence false positives are low-impact local UX inaccuracies, not verified
authentication. Windows/Linux tests use fixtures; native macOS checking and unit
tests do not establish real Claude account compatibility. Complete publisher
verification, source/account isolation and freshness testing before enabling
execution, consuming local session output or advertising live quota support.

## 7. Addendum: live transport (2026-09-18)

The live transport described in [claude-sources.md](../../architecture/claude-sources.md)
adds three surfaces that this assessment did not cover and that need their own
review before a release claims certification:

- **Vendor settings write.** `claude::connect` edits only the `statusLine` key of
  the user's Claude Code `settings.json`, refuses non-object files, keeps a
  one-time verbatim backup and a chain file, and writes atomically. Paths with
  shell-significant characters are refused rather than escaped. Discovery never
  triggers it.
- **Bridge execution.** Claude Code, not Companion, spawns the bridge inside the
  user's session. The bridge caps stdin at 64 KiB, rejects invalid JSON without
  writing, persists only the documented windows with `0600` permissions, and runs
  a chained custom status line through `sh -c` / `cmd /C` with the same stdin only
  when the user had one before connecting.
- **Capture ingestion.** `read_capture` validates schema, size, timestamps and
  ranges, drops reset windows at read time and never treats the read time as the
  sample time. A forged capture by the same OS user can only misreport that
  user's own quota row; it cannot reach credentials or other services.

## 8. Implementation delta: broader discovery and inline consent (2026-09-20)

This records the changed boundaries; it is not a new certification of the live
transport above. `extended_candidates` now includes absolute PATH entries,
global npm shims and conventional version-manager directories. It caps candidates
at 256, PATH entries at 64 and immediate manager entries at 32. Fixed paths are
prioritized; relative/current-project paths, `node_modules/.bin`, parent traversal
and control characters are excluded. Metadata may follow symlinks, but no found
launcher is executed or read. The existing single blocking worker/deadline stays
in place, including for slow network-backed filesystem paths.

The inline **Enable quota** action and Settings button both use the same opt-in
connect operation. The UI discloses the settings write before the click, disables
duplicate submissions and preserves errors across background refreshes. Desktop
chat presence alone does not enable the action. A forged same-user launcher may
make the action visible but cannot grant consent or trigger a write automatically.
Regression fixtures check that discovery leaves vendor settings untouched and
never executes a candidate. The bridge, relay schema, authentication and pairing
are unchanged by this extension.
