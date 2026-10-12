# Mobile Claude and notification activation: focused diff review

## 1. Overview

Reviewed the working changes based on `ce78634` on 13 October 2026. The native
Swift/Kotlin readers add the already-published `claude` service. iOS separately
persists notification category consent and tracks APNs/FCM/relay readiness.
This is a source and synthetic-test review, not a production certification.
Structured results are in [findings.json](findings.json).

## 2. Trust boundaries and assumptions

Protect channel credentials, the AES key, optional installation routing IDs,
notification choices and account-scoped caches. An authorized Companion remains
the trusted quota observer. The relay is an opaque transport and can withhold
data; it cannot authenticate a different services ciphertext without the key.
Apple controls system permission/APNs; Firebase controls registration availability.
Fixtures are public synthetic readings and never contain live pairing credentials.

No direct Claude authentication, credentials, transcripts, prompts, workspace
paths, OAuth flow or model API calls were added. Visibility is not discovery on
the mobile device: absent services remain absent, and unavailable is not zero.

## 3. Traced surfaces and controls

- **Encrypted inventory → native projection → cache/UI/widget.**
  `StatusRelayCrypto.decryptServices` and `RelayProtocol.decodeServices` retain
  existing channel/kind/sequence authentication. `AgentServicesSnapshot.decode`
  and `decodeServicesPayload` retain the 4 KiB / 16 unique provider limits,
  integer percentages, timestamps and status/window consistency. Claude windows
  must be exactly 300/10,080 minutes. Unknown future schemas remain ignored.
  Generic focus/removal/replay/channel checks are unchanged. Only Codex can carry
  reset-credit summaries. Rendering uses typed native text, not HTML or commands.
- **Toggle → permission → persisted choice → APNs/FCM → reader-authenticated PUT.**
  `setNotificationPreferences` requires positive relay capability and system
  consent before persisting a new category. No network failure implies consent
  to another category. A saved choice may be pending; it is not claimed ready.
  `ResetPushManager.currentInstallationID` first obtains APNs registration and
  waits for explicit FCM registration success before retrieving the FID.
  Auto-init delegate events cannot mark a registration complete. No FID is logged.
- **Timeout/callback → registration gate.** `PushRegistrationGate` coalesces
  waiters, bounds APNs/FCM waits and checks an attempt UUID before completion.
  Opt-out cancels the waiters; late callbacks cannot complete a later attempt.
- **Disconnect/opt-out → relay DELETE.** A revision/channel check prevents late
  success from restoring local choices. Both manual and foreground PUT tasks are
  tracked; disconnect waits for an in-flight task before its final DELETE.
  Existing pending-unregistration and best-effort SDK cleanup remain in place.
  Pending opt-in retries only while the app is active, on the existing 60-second
  foreground cadence, not in a tight loop or a new background polling service.

An attacker without channel credentials cannot inject a Claude reading or opt in
a reader. A compromised authorized publisher can misreport quota, an existing
trust assumption. SDK outages can postpone registration; stale/offline data and
pending state remain explicit rather than manufacturing a successful delivery.

Unchanged/out of scope: relay authorization/rate limiting/D1 encryption,
Companion discovery/status-line bridge, signing supply chain and vendor accounts.
No new native unsafe-pointer or manual FFI boundary was introduced.

## 4. Systemic findings

No unresolved security finding or three-finding root-cause cluster was identified
in this diff. The activation defect and late-registration ordering were treated
as reliability/consent invariants and are covered by targeted regression tests.

## 5. Exploit chains

No independently exploitable chain was identified in this scope. No claims are
made about unrelated repository components.

## 6. Calibration and verification limits

Preserved existing protections rather than weakening validation to accept Claude.
Automated entry/sink inventory was supplemented with manual traces; regex matches
for SwiftUI `system(size:)` are not command execution. Swift fixtures cover
denied/granted permissions, APNs/FCM/relay failure, independent categories,
revocation/retry, stale attempts, channel changes and disconnect versus late PUT.
Both readers test optional/malformed Claude windows and authoritative removal.

Physical-device system permission and APNs/FCM delivery still require validation
of the new store-signed binary, especially an affected iPhone. Simulator unit
tests cannot prove delivery on every supported OS/model. See the
[validation record](../../validation/mobile-claude-notifications.md).
