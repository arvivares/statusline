# Antigravity in Companion

Implemented in **0.1.22**, with automatic discovery and restored focus/watchlist
in **0.1.23**. Companion publishes the encrypted inventory through the
[optional services extension](../../protocol/statusline-services-v1.md), consumed
by iOS 1.1.0 and Android 0.1.25. Existing Codex-only readers remain compatible.
The [source research](antigravity-sources.md) records official documentation and
observed vendor responses separately from implementation claims.

## Per-user service visibility

Companion is the authority for a user's service list, not a global list of all
providers Statusline might support.

| Local state                                            | Main view                                     | Collection                                                   |
| ------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------ |
| Existing Codex-only installation                       | Codex, no AGY tab or empty slot               | Existing Codex path unchanged                                |
| AGY absent or explicitly disabled                      | No AGY placeholder                            | No AGY executable or account accessed                        |
| AGY detected in a supported installation               | Gemini focus/watchlist; Codex only if present | Remembered Desktop **or** CLI session                        |
| Configured AGY temporarily unavailable/signed out      | Unavailable, never an invented percentage     | Bounded retry on normal cadence                              |
| AGY removed from Settings / executable no longer found | No AGY quota slot                             | Removal stops collection; missing executable returns locally |
| Claude                                                 | Not offered in this release                   | No Claude collector                                          |

Settings → **Services** offers discovery status and advanced controls, not a
required manual add step. It becomes **Antigravity** when a source is selected.
Saving a missing manual installation fails without replacing the previous setting. Disabling
AGY neither signs out of Google nor disconnects a paired phone.

## Setup

1. Install and sign in to the official Antigravity Desktop or AGY CLI yourself.
2. Open Companion. It discovers supported local installations without requiring
   a manual service or executable path. First discovery prefers Desktop, then CLI.
3. The selected source is remembered **before** accessing its session. Installing
   Desktop later, a sign-out or a failed read never switches a CLI user's account.
4. Choose any row under **Other limits** to focus it. The other window remains a
   small, selectable reading below the meter. Only one AGY session is selected.

For advanced cases, Settings shows the detected source and **Scan again**. The
source selector permits an explicit Desktop/CLI choice or disabling collection.
Custom native paths (including a macOS `.app` folder) are optional, not onboarding.
If both sources exist but the preferred one is signed out, sign in there or
explicitly select the other source; do not merge their quotas or assume identity.

The adapter does not fall back between CLI/Desktop accounts implicitly. No API
key, Google token, account email or password is needed by Statusline. Native
formats are checked before execution; the macOS Desktop adapter additionally
verifies the Google signer. Always choose a trusted official installation;
native-format checks alone do not authenticate a publisher.

## Collection and failure boundaries

Production code is in `apps/desktop/src-tauri/src/antigravity.rs` and
`antigravity_runtime.rs`. Native IPC returns a Google-only discriminated state,
with monotonic revisions so an old event cannot resurrect a removed service.

- Missing preferences default to automatic discovery. Existing v0.1.22 files
  without `automatic` keep their explicit source or disabled state. New source
  preferences and the automatic/disabled flag use the same separate
  `antigravity-source-v1.json`; Codex settings and relay credentials are untouched.
- Automatic lookup uses supported OS/current-user installation roots and trusted
  conventional CLI directories, **not arbitrary inherited PATH entries**. Missing
  installations are revisited on the normal native cadence. An already selected
  source never falls back between Desktop and CLI. Advanced manual selection may
  use PATH or an absolute custom executable as before.
- A separate cache/lock runs alongside Codex on the existing 300-second native
  scheduler. Hidden WebViews do not own polling. Sleep may delay a read; missed
  ticks are skipped. Focus/manual requests reuse results under 60 seconds old.
  **Scan again** explicitly bypasses that cache without unpinning the source.
- From 0.1.24, independent collector results feed a coalesced encrypted inventory.
  The first inventory waits for both discovery results; later slow Google reads
  do not hold Codex's collection/UI lock. A Google failure cannot replace Codex
  with fabricated quota. Older relays continue receiving the Codex projection.
- CLI must be in the verified read-only command family: major 1, at least
  1.1.11. The only quota invocation is `--print /usage --output-format json`.
  Returned metadata must identify the built-in, zero turns and zero token counts.
- Desktop uses its native bundled `language_server`, not the Electron launcher.
  It starts a one-shot standalone process, disables telemetry and optional
  browser/LSP features, and supplies private transient XDG/runtime directories.
  The real home and OS credential context are retained, not overwritten.
- Only Google `gemini-weekly` and `gemini-5h` buckets are normalized. Unknown or
  third-party buckets never reach the UI. Missing values are **not** 0% or 100%;
  a short window is never relabeled as a weekly window.
- Output/HTTP bodies are bounded to 1 MiB, commands have deadlines, and the
  runtime operation after discovery is bounded to 45 seconds. Runtime stdout/stderr are not
  logged. Owned Unix process groups / Windows kill-on-close jobs are terminated;
  no existing user process is attached to or stopped.
- Desktop on Unix also uses the vendor's `parent_pipe_path` with a private
  local socket. macOS testing killed only the newly spawned diagnostic host
  (without Rust destructors); its owned native child exited on parent loss.
  Windows job handles are closed by the OS when their owner exits. Abrupt
  termination may leave private temporary files for subsequent OS cleanup.
- Local HTTPS bootstrap verifies the listening socket belongs to the live owned
  child (lsof on macOS, `/proc` on Linux, netstat PID on Windows), is loopback,
  and rejects a request without CSRF. Bootstrap sends no credentials or CSRF.
  Authenticated calls then trust only that server certificate, recheck socket
  ownership and use normal TLS verification, no proxy and no redirects.
  This is an internal vendor protocol, not a public API stability guarantee.

## Relay compatibility: no migration in 0.1.22 or 0.1.23

The existing [v1 protocol](../../protocol/statusline-relay-v1.md) is unchanged:

- Same endpoints and `protocolVersion: 1`; no worker/D1 deployment or migration.
- Same encrypted `schemaVersion: 1` plaintext: the four existing fields still
  mean **Codex weekly**, never whichever service is selected in the UI.
- Same AES-256-GCM, AAD, nonce format, keyring namespace, publisher/reader tokens,
  sequence policy, retention and private pairing link.
- Existing pre-services iPhone/Android releases keep displaying Codex. Selecting
  AGY does not relabel it as synced for those readers, publish Gemini as Codex,
  or create a new QR.
- If Codex becomes unavailable, no fabricated Codex snapshot is published.
  Existing mobile freshness behavior remains intact; services-v1 readers receive
  the explicit unavailable state for the enabled service.

### Mobile delivery in iOS 1.1.0 / Android 0.1.25

The [services-v1 specification](../../protocol/statusline-services-v1.md) defines
the implemented additive rollout, cache rules and old-reader compatibility.
The [security review](../security/services-sync/security-review.md) records its
controls and outstanding release gates. The invariants below remain mandatory.

Do not add static AGY/Claude tabs to mobile. The authenticated, encrypted
Companion snapshot must carry the user's enabled provider manifest, separate
provider IDs, window semantics, sample times and explicit unavailable/removal
states. Each mobile client renders only that Companion's services.

Both mobile clients use receiver capability negotiation and versioned decoding;
the Android implementation is in `apps/android/app/src/main/java/inmerzion/statusline`.
The authenticated, encrypted manifest is authoritative for the new clients while
the old Codex projection remains available to v1 readers. The implementation
does not replace the existing pairing or rotate its keys. Test old/new
publisher-reader combinations, source removal, temporary failure, offline stale
data, app/widget caches and continued pairing identity. Do not count absence of
a failed response as deliberate service removal.

## Validation and release gates

An explicit local probe uses the production collector without Tauri, modifying
no saved Statusline preferences or pairing:

```sh
cargo run --manifest-path apps/desktop/runtime-tests/Cargo.toml --example antigravity_probe -- auto
cargo run --manifest-path apps/desktop/runtime-tests/Cargo.toml --example antigravity_probe -- desktop
cargo run --manifest-path apps/desktop/runtime-tests/Cargo.toml --example antigravity_probe -- cli
```

Run this only on a consenting user's signed-in installation. It prints the
sanitized Google quota, not raw vendor responses. The standard test suite/CI
does not invoke this example or require a vendor account.

Local verification covers macOS CLI/Desktop reads, parser/error fixtures,
automatic Desktop discovery using a temporary preference directory, legacy
disabled/manual settings, source precedence/pinning, stale event rejection, v1 relay crypto fixtures,
production frontend compilation and 340 × 500 EN/ES previews. Windows/Linux
actual account runs, installed-app background cadence, signed updater/installer
round trips and an unchanged paired phone are required before claiming full
end-to-end validation. No new installer or store release is implied by this doc.
