# Security Review: Statusline public-release hardening

**Review date:** 1 September 2026

## Summary

- Critical: 0
- High: 0 open, 1 fixed
- Medium: 0 open, 1 fixed
- Low: 1 operational recommendation

## Fixed findings

### [HIGH] Credential rotation bypassed the database protection limit

- **Category:** OWASP A04 Insecure Design
- **File:** `services/relay/src/app.ts`
- **Description:** Channel limits were keyed only by a bearer-token hash. An unauthenticated client could rotate syntactically valid tokens and force repeated D1 authorization reads.
- **Resolution:** A provider-level client limiter now runs before channel and bearer parsing. It keys on a SHA-256 digest of the Cloudflare source address and returns `429` with `Retry-After` before any store access. Per-credential limits remain in place.
- **Verification:** Automated tests confirm that the credential limiter and store path are not reached when the client limiter rejects a request.

### [MEDIUM] Persistent invocation logging conflicted with the privacy posture

- **Category:** OWASP A09 Security Logging and Monitoring Failures
- **File:** `services/relay/wrangler.jsonc`
- **Description:** Worker observability enabled persistent invocation logs with request metadata while the product is designed to minimize operational data retention.
- **Resolution:** Persistent invocation logging is explicitly disabled. Error responses remain generic and no token, payload, channel identifier or source address is written by application logging.

## Operational recommendation

### [LOW] Worker-level limits do not protect the Workers invocation quota

Rate-limit bindings execute after a request invokes the Worker. They protect D1 and application work but cannot stop a request from counting toward the Workers quota. A public production deployment should use a stable custom domain with edge/WAF controls and quota alerts.

## Passed checks

- No OpenAI keys, private keys or matching hardcoded credential values were found in the working tree scan.
- D1 operations use bound parameters rather than interpolated user input.
- Publisher, pairing and reader credentials are random, role-separated and stored only as SHA-256 hashes by the relay.
- Pairing credentials expire after ten minutes and channels after thirty days without publication.
- Snapshot sequence checks prevent replay of stale updates.
- Request bodies, token formats, channel identifiers and ciphertext sizes are bounded and validated.
- Public error responses do not expose stack traces or internal database details.
- `npm audit` reported zero known dependency vulnerabilities.
- Android signing material is excluded from Git and consumed only through four GitHub secrets.
- The Android workflow pins third-party actions to full commit SHAs, validates the Gradle Wrapper and grants read-only repository permissions.
- Signed APK and AAB outputs are verified before upload, accompanied by SHA-256 checksums, and the temporary CI keystore is removed in an `always()` step.
- Pull requests and ordinary branch pushes produce only a disposable debug-signed APK; release packaging is restricted to `android-v*` tags or an explicit manual release run.
