# Security review: quota alerts / 0.1.33 candidate

Focused review using the code-review-security checklist, not an external audit.
See the [threat model](THREAT-MODEL.md) for traced boundaries and residual risks.

## Findings

### Resolved: vulnerable local relay tooling

- Severity: high (dependency advisory); OWASP A06.
- File: `services/relay/package-lock.json`.
- Previous Wrangler 4.139.0 pulled Undici 7.29.0 with known advisories.
- Correction: pin Wrangler 4.147.0 and regenerate the lockfile. `npm audit`
  now reports zero known vulnerabilities. Production uses platform fetch;
  local tooling/deployment still needed this fix.
- Reference: [Undici advisory](https://github.com/nodejs/undici/security/advisories/GHSA-w293-vg96-wgc3).

No unresolved high or critical issue was identified in the feature additions.

## Passed checks and boundaries

- Publisher-only events and reader-only preferences; neither role can cross over.
- Parameterized D1 writes, additive migration, bounded validated request bodies.
- TLS, unchanged encrypted snapshots and encrypted-at-rest FIDs.
- Gitleaks checks of tracked changes and new files; no credentials committed.
- Independent opt-ins, legacy defaults, serialized updates and invalidated stale
  Android registration replies.
- Event expiration, persistent IDs, bounded retry/dedup and existing rate limits.
- Hard-coded official FCM/OAuth destinations, not user-provided server URLs.
- No exact quota/account identity in push payloads; operational metadata is
  explicitly disclosed. FCM delivery and lock-screen visibility remain risks.
- Existing unsigned Windows beta policy is disclosed and unchanged; updater
  signatures and other platform signing gates are preserved.

Physical quota-alert delivery and updated mobile-store declarations remain
separate release gates, not claimed by dependency or unit-test results.
