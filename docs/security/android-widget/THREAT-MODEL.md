# Android widget background sync — focused threat model

Date: 2026-10-02. Scope: the Android widget follow-up on
`chore/mobile-quota-alerts-delivery`, based on `3a1b676`. Not a full repository
audit or proof of physical background execution. Structured results:
[findings.json](findings.json).

## 1. Overview

The widget remains a private-cache projection. A unique, network-constrained
WorkManager worker uses the existing reader client to fetch/decrypt a snapshot,
then redraws installed widgets. No new server route, push category, pairing flow,
native bridge or relay protocol is introduced.

Goals: protect reader credentials, prevent cross-pairing cache restoration, and
bound background traffic. This work runs within Android's existing app sandbox.

## 2. Trust boundaries and assumptions

Assets are the Keystore-protected reader token/encryption key, the verified quota
cache and the user's pairing/demo/notification choices. Widget lifecycle broadcasts
and WorkManager execution are OS inputs; HTTP responses are untrusted. The relay
origin is developer/operator configuration, not supplied by a broadcast or job.

Only the current local credential is loaded for each run. WorkManager input/output,
tags and unique work names contain no token, channel ID, FID or decryption key.
Existing `allowBackup=false`, non-exported widget receiver, network-security rules,
AES-GCM authentication and role-separated reader authorization remain unchanged.
No Firebase registration/preferences are changed by this worker.

## 3. Traced attack surfaces and controls

### 3.1 Background network requests

Trace: widget/app lifecycle → `WidgetSyncScheduler.reconcile` → unique periodic
work → `WidgetSyncWorker.doWork` → `StatuslineRepository.refresh` →
`SecureCredentialStore.load` → `RelayHttpClient.fetchSnapshot`.

The worker rechecks widget presence, pairing and non-demo mode. The origin comes
from `RelayConfiguration`, stored origins must match it, and the HTTP client
disables redirects/cookies, bounds response bytes to 64 KiB and uses existing
connect/read timeouts. `RelayProtocol.decodeServices` authenticates the payload
before any cache write. Untrusted server data cannot supply a new request origin.

An attacker injecting invalid or replayed payloads cannot obtain a new reading:
authentication/schema and monotonic same-channel checks reject them. No raw
exceptions, response bodies or identifiers are logged by the worker.

### 3.2 Local state lifetime (AW-001)

Adding a second asynchronous caller exposed an existing race: an old refresh could
return after disconnect/re-pair/demo and write a stale cache, or two responses
could compare against the same sequence and commit out of order. Preconditions
are overlapping refresh and local state changes, not possession of a vendor token.

The shared `SnapshotRefreshCoordinator` now snapshots a revision, invalidates it
under the same lock used for pairing/cache mutations, and guards compare/write at
commit. Network I/O remains outside that lock. Unit tests exercise invalidated
responses and concurrent monotonic commits. AW-001 is verified locally, not merged.

### 3.3 Scheduling and availability

One named periodic job uses `KEEP`, 30-minute intervals and a connected-network
constraint; callbacks do not reset the cadence or create a job per widget.
Removal, disconnect and demo cancel scheduling. Transient errors allow three
exponential-backoff retries; permanent/storage/decode errors retain the last cache
without retry loops or credential deletion. Doze, force-stop, OEM restrictions and
relay availability are platform limits, not guarantees of timely freshness.

Out of scope: vendor API discovery, relay authorization redesign, rooting/host
compromise, or HTML/command injection (no such interpreter or sink is added).

## 4. Systemic findings

No cluster of three related vulnerabilities was identified.

## 5. Exploit chains

No independently exploitable multi-step chain was identified in this scoped change.

## 6. Calibration and verification

AW-001 is **low** severity in this single-user local-app context: it could restore
an obsolete quota projection after a local lifecycle change, not decrypt another
account or extract vendor credentials. The revision and atomic commit tests passed
along with worker eligibility, retry-budget and fetch-before-render tests. Android
unit tests and Lint passed. Physical release upgrade, persistent scheduling after
process death/reboot and widget redraw still need device validation; no pass is
invented from the nominal interval.
