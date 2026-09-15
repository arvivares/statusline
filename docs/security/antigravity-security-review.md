# Antigravity adapter: focused security review

Date: 2026-09-15. Scope: 0.1.22 candidate's local collector, source settings, IPC,
service visibility and unchanged v1 publisher boundary. This is not an external
audit or a certification of the vendor runtime.

## Resolved within this change

- **High — a CLI version could interpret `/usage` as a prompt:** guard the
  documented read-only version family before invocation; validate built-in
  identity, zero turns and token counts in the response.
- **High — copying third-party credentials or quotas:** no auth-file/keyring
  extraction; preserve the vendor's authentication context. Only two allowlisted
  Google buckets cross the collector boundary. No raw identity/log output.
- **High — weakening relay compatibility:** do not change the deployed protocol,
  encrypted schema/AAD, credential namespace or publisher. Google does not enter
  the v1 Codex snapshot. Existing encryption fixtures run in runtime-tests.
- **High — local endpoint impersonation / global TLS bypass:** verify owned PID
  and loopback listener, use secret-free certificate bootstrap, confirm missing
  CSRF is rejected, pin the certificate for actual authenticated requests,
  disable redirects/proxies and recheck socket ownership.
- **Medium — stray/background agent processes:** no prompts or Electron launch;
  bounded commands/HTTP responses, isolated transient data and RAII termination
  of owned process groups/jobs on success, failure and cancellation.
  Desktop also watches a private Unix parent pipe; a macOS kill-of-owned-probe
  test confirmed the native child exits when its host disappears. This test
  did not terminate or attach to an existing user's process.
- **Medium — a late result resurrects a disabled provider:** serialize save/read,
  use monotonic IPC revisions and ignore older events. Disabled upgrades do not
  start or inspect AGY sessions. Removal touches only AGY's own preference file.
- **Medium — shell/path injection:** executable paths are absolute, bounded,
  canonicalized and checked for a native binary format and permitted filename.
  Use direct argv, never a shell string or relative PATH entry. macOS validates
  Google's code-signing requirement before native Desktop execution.

## Residual limitations / gates

- **Medium:** Desktop RPC/flags are private vendor interfaces. Future changes
  must fail unavailable, not trigger a prompt, sign-in or alternate-account
  fallback. Keep the supported-version evidence in the architecture guide.
- **Medium:** Windows/Linux publisher trust is not independently verified by
  this adapter. Require a trusted installation, explicit opt-in and actual OS
  tests. Native-format checks do not prove publisher identity.
- **Medium:** a vendor binary runs with the user's normal privileges. Temporary
  data isolation and disabled optional features are not an OS security sandbox.
  The vendor may use its own authentication refresh/network behavior.
- **Low:** abrupt host termination may leave an OS-private temporary directory;
  normal collection removes it. A short-lived CLI operation on macOS does not
  have the Desktop parent-pipe mechanism; normal completion, cancellation and
  timeout have process-group cleanup, but a hard-killed host cannot run it.
- **Validation:** macOS production collector and pure/contract tests passed;
  real Windows/Linux signed-in sessions and installer/update preservation tests
  are still required. Full strict Clippy currently reports pre-existing warnings
  in refresh/update modules; do not present that command as a passing gate.

No credentials, private pairing links or unreviewed vendor logs are included in
fixtures, screenshots or this report. See the
[implementation and compatibility contract](../architecture/antigravity-companion.md).
