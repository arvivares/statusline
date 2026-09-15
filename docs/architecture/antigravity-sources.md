# Antigravity sources

Research date: **2026-09-15**. Scope: Google model quotas exposed by Antigravity
Desktop and the `agy` CLI on macOS, Linux and Windows, for eventual display in
Statusline Companion, iOS, Android and their widgets.

**Implementation status:** implemented for the **0.1.22 Companion candidate**,
not yet a published provider. The production Rust adapter returned real Google
quota from CLI 1.2.3 and Desktop 2.13.0 on macOS. Windows/Linux execution remains
unverified. Mobile integration is explicitly deferred; see the
[delivery and compatibility contract](antigravity-companion.md).

## Findings

The best-supported initial collection path is the official CLI's non-interactive
usage report. Google documents `/usage` (alias `/quota`) as a quota refresh, and
its CLI changelog introduces read-only print-mode reports in **1.1.11**. Unlike a
normal agent prompt, that command is handled without model turns or quota spend.
See [Model Quotas](https://antigravity.google/docs/cli/commands/usage/),
[Headless mode](https://antigravity.google/docs/cli/headless/) and the
[1.1.11 changelog entry](https://antigravity.google/changelog).

Desktop and CLI are different collection surfaces. Desktop's model selector
includes **View Usage**, showing a Gemini group with weekly and five-hour limits
separately from the Claude/GPT group. A shared Google quota must not become several
invented, independent model allowances in Statusline. See
[Google's model documentation](https://antigravity.google/docs/models/).

## Platform and installation matrix

These are **upstream availability claims**, not Statusline compatibility results.

| Platform | Antigravity Desktop distribution                           | Official native CLI location      | Local verification                                                                                  |
| -------- | ---------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| macOS    | Apple Silicon and Intel downloads; minimum macOS 12 listed | Current user's `~/.local/bin/agy` | CLI 1.2.3, running Desktop 2.5.0, and independently started Desktop 2.13.0 native runtime validated |
| Linux    | x64 / ARM64; glibc >= 2.28 and glibcxx >= 3.4.25 listed    | Current user's `~/.local/bin/agy` | Documentation and installer inspected; execution pending                                            |
| Windows  | x64 / ARM64; Windows 10 64-bit or newer listed             | `%LOCALAPPDATA%\agy\bin\agy.exe`  | Documentation and installer inspected; execution pending                                            |

Sources: [downloads](https://antigravity.google/download),
[Desktop getting started](https://antigravity.google/docs/getting-started/),
[CLI installation and authentication](https://antigravity.google/docs/cli/install/),
[Unix installer source](https://antigravity.google/cli/install.sh) and
[Windows installer source](https://antigravity.google/cli/install.ps1).
Installer source was **read, not executed**.

Google's Desktop getting-started page currently lists an Intel download alongside
the phrase “X86 is not supported,” whereas Downloads explicitly lists Intel support.
Treat that inconsistency as a reason to verify the actual Intel artifact before
claiming a tested integration. CLI installer source explicitly selects amd64/arm64
for macOS and Linux and offers the corresponding Windows architectures.

The standalone Antigravity IDE and editor extensions are additional products,
not synonyms for either Desktop 2.0 or the native CLI. Do not assume their local
protocols or bundled executable paths match.

## Authentication and account scope

Let the installed CLI manage authentication. Google documents native secure
storage using Keychain on macOS, Secret Service/dbus on Linux and Credential
Manager on Windows. A user signs in interactively when necessary; headless mode
without cached authentication is documented to fail rather than wait for login.
See [Installation and Auth](https://antigravity.google/docs/cli/install/) and
[Headless mode](https://antigravity.google/docs/cli/headless/).

For Statusline:

- Never extract Google access tokens, refresh tokens or OAuth client secrets.
- Never sign in, sign out, switch accounts, enable paid credits or rewrite AGY
  settings on the user's behalf as part of polling.
- Identify this source as the **local CLI session**. The observed command payload
  does not prove an email/account identity or a match with a Desktop session.
- Do not auto-failover between Desktop and CLI sessions as if they were necessarily
  the same account. Multi-account behavior requires an explicit account contract.
- Gemini API-key mode is not a Google subscription session. Do not translate token
  usage, API billing or a missing quota into an Antigravity remaining percentage.

## Read-only CLI proof

On the locally installed **1.2.3** executable, the following invocation returned
a structured usage report successfully:

```text
agy --print /usage --output-format json
```

**Check the executable's version first.** Do not run this probe against versions
older than 1.1.11 or an unrecognized executable. The version floor comes from
Google's read-only-command release, not from an assumption about how ordinary
print-mode prompts behave. Later major versions also require compatibility review.

The local probe used a private empty working directory, closed stdin, a 45-second
timeout, a 1 MiB output limit and `--log-file /dev/null`. It printed only the
report structure and selected quota fields, not raw logs, free-text responses,
account identifiers or conversation data. No model prompt was submitted.

Observed report fields:

| Field                | Observation                                                  |
| -------------------- | ------------------------------------------------------------ |
| `status`             | `SUCCESS`                                                    |
| `command.name`       | `usage`                                                      |
| `num_turns`          | `0`                                                          |
| `usage.total_tokens` | `0`                                                          |
| Quota container      | `command.data.groups[].buckets[]`                            |
| Google quota IDs     | `gemini-weekly`, `gemini-5h`                                 |
| Google windows       | `weekly`, `5h`                                               |
| Remaining value      | `remaining_fraction`, reported as `1` for both at probe time |
| Reset value          | `reset_time`, an absolute timestamp with UTC timezone        |
| Excluded group       | Claude/GPT, with `3p-weekly` and `3p-5h` buckets             |

These field names are **observed in 1.2.3**, not a separately versioned Google API
schema guarantee. Preserve sanitized, synthetic fixtures and reject incompatible
reports. The observed 100% value is a provider report, not a promise that a future
model request will succeed. No inference request was made to test that claim.

### Adapter requirements derived from the probe

1. Resolve a real executable from an explicitly configured absolute path, trusted
   installation locations and PATH. Do not invoke shell aliases, run a login shell,
   assume a username or use a project-local executable discovered implicitly.
   Windows GUI launches need the per-user installation fallback even when PATH is
   stale. Validate executability and version using that same resolved binary.
2. Use direct process arguments, no shell, noninteractive stdin, bounded stdout and
   diagnostics, timeout and cancellation cleanup. Run outside a project. Suppress
   unnecessary CLI log files using a platform-appropriate null destination; the
   Windows equivalent must be tested before claiming parity.
3. Accept only a successful built-in `usage` report with zero agent turns/tokens
   and a valid structured command payload. Do not parse prose, TUI output or the
   general `usage` token counter as subscription quota.
4. Initially allow only the verified `gemini-weekly` / `weekly` and `gemini-5h` /
   `5h` pairs. Reject duplicates, non-finite or out-of-range fractions, invalid
   reset timestamps and contradictory window identifiers. Unknown buckets must
   not be silently presented as Google quota.
5. Exclude third-party buckets **before caching, publishing or rendering**. Keep
   Codex independent; an AGY Claude/GPT bucket is not a Codex account reading.
6. Preserve missing/unavailable windows and sample age. Never manufacture 100%,
   sum weekly and five-hour percentages, or copy a group allowance into a row for
   each Gemini model. Translate only Statusline-owned labels via the EN/ES catalog.

## Desktop-only alternatives

The reviewed official Desktop pages explain installation, settings and the quota
UI. **No public, documented external quota-query API was found in those pages.**
That is a limit of this research, not proof that no such API can exist.
See [Desktop settings](https://antigravity.google/docs/settings/) and
[model usage](https://antigravity.google/docs/models/).

An existing open-source implementation documents local language-server calls such
as `RetrieveUserQuotaSummary`, with older status/configuration endpoints as
fallbacks. This informed the investigation; it is not a supported Google API or
evidence of shipped Statusline compatibility. Its Desktop path requires the local
application to be running. See the implementer's
[Antigravity provider notes](https://github.com/steipete/CodexBar/blob/main/docs/antigravity.md).

Before shipping that path, validate on each OS: process ownership, executable
identity, loopback-only discovery, authentication to the intended local process,
bounded requests, actual quota semantics and account matching. Do not scan arbitrary
ports, disable TLS validation globally, scrape the UI or extract vendor OAuth
secrets. Older IDE model-availability responses are not reliable substitutes for a
quota report. Desktop-only support remains a separate release compatibility gate.

### macOS Desktop proof — 2026-09-15

The subsequently installed app was **Antigravity Desktop 2.5.0**, bundle ID
`com.google.antigravity`, at `/Applications/Antigravity.app`. Its arm64 bundle
passed deep/strict signature verification and identified **Google LLC** as its
signer. This is the version actually tested, not a claim about the latest release.

The already-running app owned a child at
`Contents/Resources/bin/language_server`. Kernel process/socket information
confirmed the same local user, the expected parent executable, and a loopback
listener belonging to that child. The probe did not start another Antigravity
runtime, invoke `agy`, read CLI state or change the user's app session.

The read-only request was:

```text
POST https://127.0.0.1:<discovered-port>/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary
```

The diagnostic used the process's ephemeral local CSRF header in memory, without
printing or persisting it. This is local-process authentication, not a Google
OAuth token or keychain extraction. Before sending it, the probe obtained the
listener's certificate without application data, rechecked socket ownership, and
used that certificate as the sole CA for the authenticated request with normal
TLS/hostname verification. No global trust settings, redirect policy or app
configuration was changed. Production code still needs a reviewed implementation
of this process-identity/trust boundary on each OS; trusting a certificate alone
does not identify the app.

The authenticated request returned **HTTP 200**. At **07:40 UTC** the selected
Google fields were:

| Bucket          | Remaining | Reset reported by Desktop (UTC) |
| --------------- | --------- | ------------------------------- |
| `gemini-weekly` | 100%      | 2026-09-22 07:40:06             |
| `gemini-5h`     | 100%      | 2026-09-15 12:40:06             |

This is point-in-time provider output, not a guarantee of future availability.
The probe made no model request and inspected no prompts or conversations. It
requested only the quota-summary method, not account-management or agent actions.
Raw responses were not persisted; the selected result retained only Google quota
fields. The application was left running for this first probe. The later shutdown
check is recorded below; restart behavior remains untested.

The observed Desktop payload differs from the CLI envelope:

| Meaning            | CLI 1.2.3                      | Desktop 2.5.0                 |
| ------------------ | ------------------------------ | ----------------------------- |
| Groups             | `command.data.groups[]`        | `response.groups[]`           |
| Bucket ID          | `buckets[].id`                 | `buckets[].bucketId`          |
| Window             | `buckets[].window`             | `buckets[].window`            |
| Remaining fraction | `buckets[].remaining_fraction` | `buckets[].remainingFraction` |
| Absolute reset     | `buckets[].reset_time`         | `buckets[].resetTime`         |

In this Desktop version, `remainingFraction` is directly on the bucket, not
nested under `remaining`. Parsers must use validated fixtures, not assume another
implementation's older schema is identical. Unknown/missing fields must remain
unavailable, not default to 100% or zero.

**What this proves:** Desktop's own service can supply both Google quota windows
without invoking the installed CLI. This was not an uninstall/clean-machine test:
`agy` remained installed and its existing session was left untouched. Only the
Desktop-owned listener was queried. It does not prove the two sources use the same
account or that this discovery method already works on Windows/Linux.

### Fully closed Desktop — 2026-09-15

After the user closed the application, the **07:46 UTC** check found no Antigravity
Desktop or `language_server` process. Both previously owned loopback listeners
were absent, and connection attempts to those two known ports returned
`ECONNREFUSED`. No other ports were scanned. The authenticated quota probe stopped
at its process-ownership guard before attempting to read a CSRF value or send a
request. It did not restart the application or fall back to the separately running
`agy` session.

**Result:** the previously validated Desktop-local source cannot obtain a new
reading after its runtime exits. Cached values would be last-known readings,
not freshly checked quota. An unavailable poll must not update the successful
sample's timestamp or imply that its remaining percentage is still current.

The on-disk bundle now reports **2.13.0**, whereas the earlier running-app quota
proof used **2.5.0**. The bundle changed between checks; this observation does not
establish who or what installed the update. Do not relabel the successful 2.5.0
quota probe as a 2.13.0 runtime test.

Read-only inspection of the installed 2.13.0 launcher found a headless path driven
by `ELECTRON_OZONE_PLATFORM_HINT=headless`. It skips creating a window and passes
`--headless` to the bundled language server. However, that Electron path also
adds `--no-sandbox`, initializes other application services, and can interact with
the user's usual application state. It was **not launched** for this test and is
not a production recommendation.

A separately managed bundled runtime is a distinct source: it starts an
Antigravity process again rather than querying a fully stopped runtime. The
closed-app check above did not launch it. The following experiment was authorized
separately by the user, after discussing that distinction.

### Managed native runtime with Desktop closed — 2026-09-15

**Result: successful on macOS arm64 with Desktop 2.13.0 installed.** The controller
started only the bundle's Google-signed `Contents/Resources/bin/language_server`,
queried it, and stopped its own process group. No Electron UI or `agy` invocation
was involved. The existing user-owned CLI session remained running and was not
queried, stopped or modified by the controller.

Static inspection of `language_server --help` established these runtime controls:

- `--gemini_dir` accepts an absolute data root; the probe used a fresh private
  temporary directory, not the user's original `.gemini` tree.
- `--app_data_dir` and `--config_dir` select subdirectories within that root.
- `--standalone` starts the native service. Running it directly already avoids
  the Electron window, so the probe did **not** need the interactive `--headless`
  path, Electron's `--no-sandbox`, or persistent daemon mode.
- `--disable_telemetry`, `--use_ls_chrome_devtools_mcp=false`,
  `--use_local_chrome=false` and `--enable_lsp=false` limited optional components.
  No sidecar-enabling flag, prompt or agent instruction was supplied.
- `--https_server_port=0` / `--http_server_port=0` requested dynamic listeners;
  only loopback sockets owned by the spawned child were accepted.

The probe preserved the real HOME value for the installed runtime's normal
session handling, supplied a minimal environment and kept temporary XDG/cache
paths within the private test directory. It did not copy Google credentials,
read keychain entries itself, inject OAuth tokens, or call any sign-in/account
mutation method. This is application-data isolation, **not** a claim that the
native process has an additional OS sandbox or cannot access other user files.

The same process-scoped certificate verification and ephemeral CSRF protection
as the running-Desktop proof were used. Requests without the CSRF header returned
**401**. Only `RetrieveUserQuotaSummary` and, for the authenticated-session check,
`GetUserStatus` were requested with the correct local header.

Three separate child lifecycles succeeded:

| UTC sample | Time from controller start | Checks performed                                                                          | Cleanup                                                 |
| ---------- | -------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 07:56:31   | 6.208 seconds              | CSRF guard, Google weekly/five-hour quota                                                 | Owned process group stopped; Desktop UI remained closed |
| 07:57:38   | 6.337 seconds              | CSRF guard, user-status structure, Google quota                                           | Owned process group stopped; Desktop UI remained closed |
| 07:58:53   | 5.617 seconds              | CSRF guard, nonempty account email/name and plan, Google quota; mocks explicitly disabled | Owned process group stopped; Desktop UI remained closed |

The final identity check returned **HTTP 200** with nonempty account and plan
fields. Only their presence was reported; their values were not printed or
persisted by the diagnostic controller. This provides a stronger signal than
assuming that any 200/100% response represents an authenticated quota. It does
not independently prove a match to a particular account selected in another
application.

The final selected quota report was:

| Bucket          | Remaining | Reset reported by runtime (UTC) |
| --------------- | --------- | ------------------------------- |
| `gemini-weekly` | 100%      | 2026-09-22 07:58:53             |
| `gemini-5h`     | 100%      | 2026-09-15 12:58:53             |

The reported reset timestamps advanced between runs while quota remained 100%.
Do not infer a fixed reset anchor, consumption or successful model access from
these untouched-window samples. A nonzero-usage sample and a reset transition
still need comparison with the native quota UI. No inference was requested to
force quota consumption.

Operational observations:

- Startup/request lifetime was capped at 45 seconds, native output and each RPC
  at 1 MiB, and RPC duration at 10 seconds. Raw process output was discarded.
- The data directory contained 24 runtime-generated files, about 87 kB after the
  tests. These remain private temporary diagnostic data, not repository fixtures.
- Shared `~/.gemini/config/config.json` metadata was unchanged across the final
  trial. This narrow check is not an audit of every filesystem/keychain write.
- Post-test process enumeration found no Antigravity UI or native language-server
  process. Only the user's pre-existing `agy` process remained.
- No native compilation, installer modification, store submission, relay publish
  or Statusline pairing change occurred.

**Integration implication:** Companion can potentially manage a short-lived
runtime from an existing Desktop installation when the UI is closed, obtain a
quota snapshot and tear that runtime down. The collected schema is shared with
the running-Desktop source; discovery and lifecycle management are different.
This is a validated macOS proof, not a shipped feature or cross-platform guarantee.
Do not enable silent fallback across accounts just because both sources return
quota successfully.

Before production: test Windows/Linux discovery and termination, a Mac without
the CLI installed, logged-out/expired sessions without browser launch, coexistence
with a user opening Desktop, cancellation/crash cleanup, memory/CPU/battery impact,
account matching and nonzero/reset semantics. Keep the internal-API compatibility
gate and the official CLI route separate.

The documented [CLI status-line JSON](https://antigravity.google/docs/cli/statusline/)
is another candidate, but it is event-driven and would require installing a user
configuration hook. It is not the first choice for independent background polling
and must not replace an existing custom status line without consent.

## Integration sequence

This is the plan for the requested feature, not functionality already available:

1. Implement separate collectors for the documented, version-gated CLI report and
   the locally verified Desktop quota service in the shared Rust companion, with
   synthetic fixtures and platform discovery tests. The Desktop source can reuse
   a verified user-owned runtime or manage an isolated, short-lived bundled runtime;
   never take ownership of a user-launched process. Make source selection explicit
   until account matching is verifiable; do not silently switch sessions when
   Desktop exits. AGY failures must not block
   Codex. Collect on the existing native scheduler, including while the window is
   hidden; do not introduce a second WebView polling loop.
2. Specify an encrypted multi-provider snapshot and migration from v1 Codex data.
   Preserve existing pairings; old clients must never label AGY numbers as Codex.
   Handle AGY-only, Codex-only, both providers, unavailable data and account changes.
3. Update both mobile decoders, caches and widgets together. Mobile devices read
   the encrypted companion snapshot; they do not install or execute `agy`.
4. Extend [Still Signature](still-signature.md) with a compact **Antigravity ·
   Gemini** reading and distinct weekly/five-hour limits where available. Preserve
   the white terminal stripe, percent spacing and English/Spanish language policy.
5. Publish the combined snapshot through the existing universal relay, once per
   collection cycle rather than once per provider. Google credentials and excluded
   model data must never reach the relay, even inside encrypted payloads.
6. Test native Windows/Linux/macOS collection and physical iOS/Android widgets,
   including stale/offline/authentication failures and upgrade compatibility.
   Desktop-only support needs Windows/Linux source validation and macOS lifecycle
   and clean-machine checks before full cross-platform support is advertised.

The [roadmap](../../ROADMAP.md) remains the provider acceptance checklist.
