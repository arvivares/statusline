# Quota alerts: focused threat model

Date: 2026-10-02. Scope: local working changes based on `c97aedf`, not an external
audit or a certification of production delivery. Structured results:
[findings.json](findings.json). Behavior and rollout:
[architecture note](../../architecture/quota-alerts.md).

## Components, assets and trust boundaries

The native read-only vendor adapters feed an unrounded local quota tracker. Its
private config file holds cycle timestamps/flags and opaque pending UUIDs, not
tokens, account identifiers or raw vendor credit IDs. A role-separated publisher
credential authenticates typed alerts over HTTPS. A separately authenticated
reader opts into categories and registers its FID; D1 encrypts that routing ID at
rest. The Worker decrypts it only in memory and forwards an allowlisted message
to FCM, which routes iOS via APNs. Detailed snapshot encryption is unchanged.

New metadata (service, event/window kind, delivery expiry and the weekly warning's
threshold condition) crosses the Companion → relay → FCM/APNs boundary in clear
application form over TLS. It is intentionally disclosed in the opt-in and both
localized public privacy notices. Neither exact quota nor account identities are
in that message. D1 stores preferences and opaque dedup IDs, not typed event bodies.

## Traced paths and controls

| Entry                    | Privileged sink            | Control                                                                                                                          |
| ------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| HTTP event JSON          | FCM/APNs message           | 1024-byte body, UUID/provider/kind/window allowlists, expiration ≤1h, publisher-only authorization, existing event limiter       |
| Reader registration JSON | D1 routing/preference rows | Reader-only authorization, boolean validation, bounded FID, AES-GCM at rest, parameterized SQL                                   |
| Vendor quota/cache       | Local event generation     | Fresh monotonic timestamps, exact thresholds, explicit windows, no clock-only recovery, Google-only pools, no gateway spend caps |
| Tracker file             | Pending event replay       | Size/schema/count validation, bounded UUID queue, expiration/freshness recheck, serialized private atomic writes                 |

An unauthenticated request cannot allocate a dedup row or send a notification.
A reader cannot publish events; a publisher cannot change the reader's category
preferences. Legacy subscriptions default to credit-only. Concurrent in-flight
events return a retryable error rather than incorrectly acknowledging delivery.
Missing/inactive providers and expired warnings cannot leak into later delivery.
Mobile preference operations are serialized. In Android, a separate short-lived
state lock invalidates in-flight registration on opt-out without waiting for the
network; queued Firebase renewals resolve the latest preferences before sending.

No unresolved vulnerability was identified in these additions after targeted
tests. No three-finding root-cause cluster or independently exploitable chain was
found; none is invented to fill a template. The model trusts the authorized
publisher's observation: an attacker with its credential can fabricate an
allowlisted alert, but cannot decrypt snapshots or opt in an unwilling reader.
FCM/APNs availability, latency and lock-screen visibility remain platform risks;
the message asks the user to check all current limits before assuming availability.

## Verification and remaining gates

Rust synthetic clock tests, relay role/allowlist/rate/expiry/retry tests, real
SQLite pre-upgrade migration tests and FCM payload fixtures exercise production
modules. Swift and Android preferences are tested without touching a live pairing.
The automatic source scan was used to identify entry/sink candidates; all relevant
new routes were then traced manually. Regex matches such as `RegExp.exec` are not
command-execution findings.

Production deployment, physical push delivery, real vendor quota rollover and
updated store disclosures remain required before store distribution. The previous
Wrangler/Miniflare lockfile reported Undici dependency advisories in `npm audit`.
The 0.1.33 candidate pins Wrangler 4.147.0 with a corrected transitive Undici;
the updated relay audit reports zero known vulnerabilities. Local migration,
typecheck, tests and deployment dry-run must still pass before rollout.
Worker application code uses the platform fetch API, not the local tooling's
Undici dependency. This is not a claim that all repository dependencies are safe.
