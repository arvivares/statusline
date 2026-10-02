# Periodic quota push alerts

Implemented for the 0.1.34 candidate. Deployment and distribution are separate
release steps; see the [candidate notes](../release/notes/v0.1.34.md). This extends the
existing FCM/APNs transport, not the earned Codex reset-credit detector.

## Rules

- **Recovery:** an actual 0% remaining reading was observed for a reported 5h or
  weekly window, its old reset time has passed, and a newer reading confirms a
  later reset time with positive remaining quota. Notify once per recovery.
- **Unused weekly allowance:** at least 20% remains and its reported reset is
  within one hour. Notify once per weekly cycle. Exactly 20% qualifies.
- Only providers detected/configured in that user's Companion are considered.
  Antigravity uses the existing Google-only adapter. Claude gateway spend caps,
  token/context usage, third-party AGY pools and non-5h short windows are excluded.

Criteria use the providers' unrounded floating-point values: 0.4% is not exhausted
and 19.6% does not qualify for the weekly warning. Absence, invalid data, advancing
the clock or an early credit redemption is not evidence of a scheduled recovery.
Both windows and all three providers are independent.

## Detection, persistence and retry

`quota_alerts.rs` is shared by the macOS, Windows and Linux Companion. Observation
runs with the existing native collection cadence, not a new network polling loop.
Fresh data must be no more than ten minutes old, never from the future, and newer
than the last reading for that window. Claude's timestamp is its last vendor
capture, not when Companion reread a cache. Missing windows can temporarily retain
an exhausted baseline, but never create recovery events. Disabling/removing a
service clears its tracker; out-of-order collector revisions are rejected.

Cycle timestamps and exhausted/warned flags are stored privately in
`quota-alerts-v1.json`, alongside a bounded opaque event queue. Disk writes are
serialized and use restrictive, random temporary files and atomic replacement.
Failed persistence reverts state rather than releasing an unpersisted event.
Restart preserves pending IDs and acknowledged-cycle deduplication. New pairing
or disconnect clears quota tracking without altering the old credit tracker.

Retries preserve event identity. Warnings are revalidated against fresh data and
discarded when remaining quota falls below 20%, the window changes, the service
disappears, or their reset time passes. Recovery messages expire after at most an
hour; recovery is not inferred from exhaustion observed many hours/days earlier.

Companion must be awake, running and connected; the mobile app need not be open.
With a five-minute collection interval, a weekly warning is normally detected on
the first fresh sample inside the last hour (roughly 55–60 minutes before reset).
Sleep/offline time and vendor cache availability can delay or prevent an alert.
Push delivery is best-effort, never a precisely scheduled guarantee. If a fresh
reading does not arrive, no quota recovery is claimed. There is no server-side
quota scheduler, because the relay cannot decrypt quota data.

This remains a single source/account per provider. Account switching must not be
treated as scheduled recovery; removal/disable clears the baseline and changing
the selected Google source/path clears it while Companion is running.
Automatic vendor sign-in switches that expose no account identity are an existing
source limitation, not multi-account support.

## Registration and backward compatibility

iOS and Android offer a separate **Quota notifications** switch, alongside the
existing Codex-credit switch. Both use OS permission and the same encrypted-at-rest
Firebase installation registration. Existing opt-ins do not opt into quota alerts.
Server health advertises support so mobiles can opt in. Authenticated publisher
metadata advertises `quota-alerts-v1` only while that channel's reader has quota
alerts enabled. Companion therefore keeps events local before consent, and sends
no provider/threshold alert metadata while the category is off. Pending events
still expire normally; there is no retroactive delivery of expired warnings.
One-category opt-out preserves the other; all-category opt-out removes registration
and requests Firebase installation deletion. UI controls remain accessible to turn
off an existing opt-in even after a provider disappears.
Android serializes registration and pairing writes across repository instances;
queued Firebase renewals read current preferences, and opt-out invalidates pending
replies without waiting for the network. iOS serializes preference changes and
foreground registration refreshes on its main-actor view model.

The additive [`quota-alerts-v1` contract](../../protocol/statusline-relay-v1.md)
keeps pairing, roles, AES-GCM snapshots and old client projections intact. Deploy
the D1 migration first, then the Worker, then publish updated Companion/mobile
builds. Older relays do not receive the new event endpoint; older mobiles remain
Codex-credit-only. Never recreate live channels during this rollout.

The relay receives provider, event/window kind and delivery expiration, not an
exact percentage, account ID or vendor credit ID. A weekly warning inherently
reveals the 20% threshold condition. Disclosure is in the opt-in UI and the
[privacy policy](../../PRIVACY.md); update store declarations before distributing
this version. These operational fields are not end-to-end encrypted.

## Verification

Deterministic Rust tests use synthetic readings and an injected clock. Relay
tests cover allowlists, role separation, expiry, event budget, opt-in migration,
retry, idempotency and FCM/APNs TTL/collapse behavior. Swift URLProtocol fixtures
exercise registration/capability compatibility and category preferences; Android
unit tests cover independent category changes and concurrent registration/opt-out.
No real quota was consumed and no
production notifications were sent for these tests.

Before production: verify live delivery on Android and TestFlight with synthetic
events in an isolated test pairing, then observe a real exhausted-window rollover.
Never substitute synthetic quota into an active user's encrypted snapshot.

## Primary references

- [Codex App Server](https://learn.chatgpt.com/docs/app-server): explicit window
  duration, percentage and Unix reset timestamp.
- [Claude Code statusline](https://code.claude.com/docs/en/statusline): independent
  `five_hour`/`seven_day` windows, captured timestamps and omitted expired fields.
- [FCM message lifetime](https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan):
  Android TTL and APNs expiration; accepted messages are not delivery receipts.
