# Security review: Statusline public-release hardening

**Review date:** 4 September 2026

**Scope:** tracked source, complete Git history, GitHub Actions workflows and archived
workflow logs, dependency manifests, release credentials and public repository settings.

## Summary

- Critical: 0
- High: 0 open, 2 resolved
- Medium: 0 unresolved, 1 time-bounded exception, 1 resolved
- Low: 1 operational recommendation

The source tree and maintainer-account controls are suitable for public distribution.
Repository-native security controls are enabled, and the one accepted dependency risk
is documented below with explicit reachability evidence, ownership and exit criteria.

## 10 September addendum: Dependabot alert 2

This targeted review identified a high-severity development-tooling dependency
finding and validated its fix in the 0.1.15 candidate. It is not a new full
security audit or evidence of exploitation. The tooling hold is lifted for
candidate validation; public tagging still requires the reviewed merge and
normal release preflight. GitHub's alert on main remains open until the fix is
merged and its dependency graph is rescanned; it has not been dismissed.

### [HIGH — fixed in candidate] Sharp/libheif in relay development tooling

- **Category:** OWASP A06 Vulnerable and Outdated Components; CWE-122.
- **Affected file at discovery:** `services/relay/package-lock.json` (`sharp 0.35.2`).
- **Original dependency path:** Wrangler `4.127.1` → Miniflare `5.20260828.0-alpha` →
  Sharp `0.35.2`, all in the development dependency graph.
- **Advisory:** [GHSA-rgj7-g3m4-5g8c](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c),
  high severity (CVSS v4 8.9). Processing malicious image input through affected
  libheif code can lead to memory corruption and possible code execution under
  certain conditions on glibc-based Linux. Sharp versions below `0.35.4` are affected.
- **Reachability evidence:** Miniflare imports Sharp in its local image-transform
  implementation. Statusline configures D1 and rate-limit bindings, not Images,
  and the relay handles encrypted JSON snapshots rather than image processing.
  The generated Worker JavaScript contains no Sharp/Miniflare/libheif references.
  Sharp is not declared by the desktop, mobile or website apps. No current
  remotely reachable application path to the vulnerable decoder was identified.
  This does not prove that a developer/CI machine cannot be exposed by other
  tooling, future image transforms or untrusted code.
- **Scanner evidence before correction:** `npm audit` reported three high entries for the same
  dependency chain (Sharp, Miniflare, Wrangler), not three independent flaws.
  `npm audit --omit=dev` reports zero findings. No exploit was run.
- **Upgrade constraints:** PR #14 (`wrangler 4.129.0`) still resolves Sharp
  `0.35.2`. Registry metadata for Wrangler `4.130.0` / Miniflare
  `5.20260908.0-alpha` also pins `0.35.2`. Those updates alone do not fix this alert.
  Do not blindly use `npm audit fix --force`: its proposed Wrangler `4.15.2`
  downgrade is not an appropriate validated fix for the current configuration.
- **Approved correction:** A scoped `overrides.miniflare.sharp = "0.35.4"`
  keeps the patched native packages in the lockfile. The candidate also includes
  the Wrangler `4.129.0` update from PR #14, resolving Miniflare
  `5.20260903.0-alpha` and workerd `1.20260903.1`. Wrangler alone is not the fix.
- **Verification:** A clean `npm ci` and full `npm audit` complete with zero
  npm vulnerability findings. TypeScript and all 12 relay/tooling tests pass.
  The new regression tests check every locked Sharp copy and the scoped override,
  load Sharp `0.35.4` / libheif `1.23.2`, and encode/decode a benign generated AVIF
  entirely in memory. No untrusted image or exploit payload is used.
  Both migrations apply to a new temporary local D1. Wrangler dry-run packaging
  succeeds; a localhost workerd/D1 smoke test passes health, safe redirect,
  channel creation/claim, snapshot publication/read and channel deletion.
  These are local checks, not claims about a production deployment or incident.
- **Exit criteria/owner:** `@arvivares` should remove the override and its
  temporary exact-version guard once a validated upstream dependency resolves a
  patched Sharp, then rerun clean install, audit and relay compatibility checks.
  Check the GitHub alert after merge; do not dismiss it to suppress the finding.

### PR #14 compatibility review

- Reviewed head `aef2bd4f15e517fc778c9298270fe001e9ee4f33` in an isolated
  worktree. Its diff changes only the relay package manifest and lockfile.
  The original PR's relevant CI checks passed, but predate the Sharp advisory fix.
- Validated the **combined** candidate (Wrangler `4.129.0` plus patched Sharp)
  against the current relay source using the clean install and checks above.
  No dependency outside the Wrangler/workerd or Sharp/native-binary families
  changes version, and all resolved package URLs remain on registry.npmjs.org.
- No new compatibility blocker was identified in the paths Statusline uses.
  The worker's public API, migrations, bindings, credentials and production
  configuration are unchanged. Remote permission/provisioning behavior was not
  exercised by these local tests. The PR #14 update is included in PR #26 rather
  than merged independently without the security override.

## 7 September addendum: explicit Windows beta preview

### [MEDIUM — accepted] Windows previews lack Authenticode publisher trust

- **Category:** OWASP A08 Software and Data Integrity Failures.
- **Files:** `release.json`, `apps/desktop/scripts/windows-release-policy.mjs:5`,
  `apps/desktop/scripts/verify-windows-preview.ps1` and the release workflows.
- **Scope:** Targeted review of the changed artifact-policy code; this is not a new
  full dependency, authentication, relay or infrastructure audit.
- **Description and impact:** The maintainer explicitly requested public Windows
  previews while SignPath onboarding is pending. Windows cannot authenticate the
  publisher through Authenticode; SmartScreen or enterprise policy may block the files.
- **Controls:** An explicit beta-only policy rejects missing/unknown modes and stable
  publication. CI checks `NotSigned`, tests both installers and uploads only after smoke
  success. Public filenames and release notes disclose unsigned status. The signed tag,
  signed checksums and GitHub attestations bind the files to their source/run, but do not
  replace Authenticode. Linux, Apple and Android signing requirements are unchanged.
- **Recommendation and exit criteria:** Complete SignPath onboarding, select `signpath`
  in a reviewed version and verify both signing stages. Never silently fall back after
  signing failure, replace a published asset or advise users to disable protections.
- **Owner:** `@arvivares`; recheck at every release until the exception is retired.
- **Verification:** Regression tests cover policy validation, installer inventory,
  unsigned naming, recovery without relabeling and upload ordering. Native signature
  status and installer execution are additional Windows CI gates, not local macOS QA.

## Previously resolved findings

### [HIGH] The release-owner account lacked two-factor authentication

- **Category:** OWASP A07 Identification and Authentication Failures
- **Asset:** GitHub account `@arvivares`
- **Description:** The account owns the repository and can administer Actions secrets,
  signing workflows and public releases, but initially did not have 2FA enabled.
- **Impact:** A password or federated-sign-in compromise could become a source and
  software-supply-chain compromise.
- **Resolution:** On 4 September 2026, GitHub reported an authenticator app and passkey
  configured, recovery codes viewed and the active web sessions reviewed before the
  visibility change.
- **Ongoing control:** Keep recovery material offline, retain two independent methods and
  periodically review account sessions and security logs.

### [HIGH] Credential rotation bypassed the database protection limit

- **Category:** OWASP A04 Insecure Design
- **File:** `services/relay/src/app.ts`
- **Description:** Channel limits were keyed only by a bearer-token hash. An
  unauthenticated client could rotate syntactically valid tokens and force repeated D1
  authorization reads.
- **Impact:** A low-cost request stream could consume database operations and reduce
  relay availability.
- **Resolution:** A provider-level client limiter now runs before channel and bearer
  parsing. It keys on a SHA-256 digest of the Cloudflare source address and returns `429`
  with `Retry-After` before store access. Per-credential limits remain in place.
- **Verification:** Automated tests confirm that the credential limiter and store path
  are not reached when the client limiter rejects a request.

### [MEDIUM] Persistent invocation logging conflicted with the privacy posture

- **Category:** OWASP A09 Security Logging and Monitoring Failures
- **File:** `services/relay/wrangler.jsonc`
- **Description:** Worker observability enabled persistent invocation logs with request
  metadata while the product is designed to minimize operational data retention.
- **Impact:** Provider logs could retain more request metadata than the published privacy
  model intends.
- **Resolution:** Persistent invocation logging is explicitly disabled. Error responses
  remain generic, and application logging does not write tokens, payloads, channel IDs or
  source addresses.

## Accepted dependency risk

### [MEDIUM] Tauri's Linux GTK 3 stack resolves an affected `glib` release

- **Category:** Third-party dependency / memory safety
- **Advisory:**
  [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) /
  [GHSA-wrw7-89jp-8q8g](https://github.com/advisories/GHSA-wrw7-89jp-8q8g)
- **Scope:** Linux only; Tauri 2.11.5 resolves GTK 3 and `glib` 0.18.5. Windows and
  macOS builds do not compile this dependency.
- **Reachability:** The affected API is limited to `glib::VariantStrIter`. Neither
  Statusline nor its resolved runtime dependencies call `VariantStrIter` or
  `array_iter_str`; matches outside the API definition occur only in `glib`'s own tests
  and documentation.
- **Constraint:** GTK 3 requires `glib ^0.18`, while the first scanner-recognized patched
  release is 0.20.0. Tauri's stable GTK 4 migration is not yet available.
- **Decision:** Accept the currently unreachable crash risk rather than vendor the GTK
  stack, depend on an unmaintained fork or falsify package versions. Dependabot remains
  enabled and the alert is dismissed as tolerable risk with this evidence.
- **Owner and review:** `@arvivares`; review by 4 December 2026 or immediately after a
  stable Tauri GTK 4 release.
- **Exit criteria:** Upgrade to a Tauri release resolving `glib >=0.20.0`, rebuild and
  smoke-test all Linux packages, then remove this exception. Progress is tracked in
  [issue #7](https://github.com/arvivares/statusline/issues/7).

## Operational recommendation

### [LOW] Worker-level limits do not protect the Workers invocation quota

- **Category:** Availability and cost control
- **Asset:** Cloudflare Workers deployment
- **Description:** Rate-limit bindings execute after a request invokes the Worker.
- **Impact:** They protect D1 and application work but cannot stop abusive traffic from
  counting against the Workers request quota.
- **Recommendation:** Use a stable custom domain with edge/WAF controls, provider quota
  alerts and capacity headroom before broad distribution.

## Passed checks

- Gitleaks 8.30.1 scanned the complete 46-commit pre-publication history with no secret
  findings. The tracked-tree scan found no OpenAI keys, private keys, pairing links,
  signing credentials or hardcoded production credentials.
- Archived logs from all 35 GitHub Actions runs that existed at audit time were scanned.
  Nine generic matches were manually confirmed as public certificate fingerprints or
  digests, not credentials.
- The only generic match in an ignored local build cache was compiler metadata inside a
  Rust `target` artifact; it is neither a credential nor tracked by Git.
- `npm audit --audit-level=low` reported zero known vulnerabilities for both
  `apps/desktop` and `services/relay`.
- Dependabot's Cargo graph was reviewed after publication. Its sole finding is the
  bounded, unreachable Linux exception recorded above; no unexplained dependency alerts
  remain open.
- D1 operations use bound parameters rather than interpolated user input.
- Publisher, pairing and reader credentials are random, role-separated and stored by the
  relay only as SHA-256 hashes.
- Pairing credentials expire after ten minutes; channels expire after thirty days
  without publication; monotonically increasing sequences reject stale replay.
- Request bodies, token formats, channel IDs and ciphertext sizes are bounded and
  validated. Public errors do not expose stack traces or database details.
- All third-party GitHub Actions are pinned to full commit SHAs. Workflows do not use
  `pull_request_target`, checkout credentials are not persisted, and default repository
  permissions are read-only.
- Write access is limited to the three desktop release jobs that create or attach release
  assets. Pull-request and ordinary branch workflows remain read-only.
- Public repository controls enable Dependabot alerts and security updates, secret
  scanning with push protection, and private vulnerability reporting. GitHub validity
  checks and non-provider secret patterns are not available on the current plan.
- Required pull-request checks always report a result: repository quality runs for every
  pull request, while Android compilation is skipped successfully unless Android or the
  shared protocol changed.
- Android signing material is excluded from Git and consumed only through GitHub Actions
  secrets. Signed APK/AAB outputs are verified and accompanied by SHA-256 checksums; the
  temporary keystore is removed in an `always()` step.
- Public Linux verification material contains only the OpenPGP public key. macOS and
  Android private signing material remains outside the repository.

## Publication gate

The source-publication, account-security and repository-visibility gates are complete.
Applied GitHub controls and the remaining binary-release gates are maintained in the
[public repository launch checklist](../release/public-repository-checklist.md).
