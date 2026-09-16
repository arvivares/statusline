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
