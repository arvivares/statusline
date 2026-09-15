# Security review: encrypted service inventory

Reviewed 15 September 2026, before rollout. Scope: services-v1 protocol, additive
D1 storage, native publisher, iOS reader and app/widget caches. No vendor account
credentials are part of the fixtures or review output. This is a scoped source
and test review, not a penetration-test certification.

## Findings

- **Medium, resolved — bounded request streaming (OWASP A04).**
  `services/relay/src/app.ts`, `readJSON`: checking size after reading the entire
  body could allocate beyond the intended limit when Content-Length is absent.
  The reader now stops/cancels at the byte budget. Memory/SQLite route tests
  exercise an oversized streaming request without Content-Length.
- **Info — operational limits.** WidgetKit can defer refresh, the vendor Desktop
  endpoint is not a public stable API, and Windows/Linux vendor signer validation
  is not equivalent to macOS. These are documented beta limitations, not claims
  of newly verified platform behavior.
- **Info — legacy fallback guarantees.** Original Codex v1 authenticates the
  payload/channel, not its outer sequence or server capability claim. The new
  decoder will not replace a services inventory with an older/equal-age Codex
  projection just because its outer sequence increases. Full downgrade/freshness
  protection against a malicious relay is not promised while accepting v1
  fallback; a relay can also withhold data. Services envelopes authenticate the
  sequence. Preserve this distinction in any future security claims.

## Checked controls

- Publisher, reader and one-shot pairing roles remain separate. Reader/pairing
  tokens cannot write either projection; publisher tokens cannot read snapshots.
  Existing credential hashes and identities survive the real SQL migration.
- SQL uses bound parameters and atomic, strict sequence guards for both slots.
  Rate-limit keys, expiry, deletion and retention cover the optional inventory.
- AES-256-GCM uses fresh OS-random nonces and authenticates service kind/channel/
  sequence. Independent public vectors verify Node-generated ciphertext in Rust
  and Swift. Wrong key/channel/sequence/kind are rejected. Legacy AAD is unchanged.
- Reader requests use HTTPS, no redirects, bounded responses and fixed configured
  origins. Pairing does not accept an arbitrary server URL. No new SSRF surface.
- No account emails, tokens, executable paths, prompts or raw vendor responses
  enter the service DTO. Rendering uses typed native values/text, not HTML.
- Current pairing identity is checked after awaiting a request. Caches reject
  old sequences and cross-channel samples; empty lists cannot resurrect old
  Codex data. Network failure retains data rather than inventing removal/quota.
- Existing EN/ES catalogs and generic user-facing error boundaries remain in use.
- Production npm dependency audits for relay and Companion reported zero known
  vulnerabilities. Development-only dependency/CI checks remain release gates.

## Remaining release gates

Verify Windows/Linux/macOS CI, production Worker schema/version and a temporary
live channel; then signed release assets and the actual TestFlight build. These
are not asserted complete by the source review. Existing Apple production and
Android users must continue receiving the Codex projection without re-pairing.
