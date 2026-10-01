# Codex reset credits

Statusline reads the optional `rateLimitResetCredits` field returned by the
local Codex App Server and projects only available Codex reset credits. Raw
credit IDs remain in Companion memory for local comparison, are skipped during
serialization and are never forwarded to mobile or the relay. The
public [Codex App Server schema](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/v2/GetAccountRateLimitsResponse.json)
defines the count and optional detail rows, including opaque ID and expiry. The
details may be absent or partial, so the count remains useful while alerts are
sent only when a complete identity list can be compared. Treat reset metadata
as optional vendor data: missing or changed fields must never break standard
Codex quota sync.

## Relay compatibility

Reset details are optional fields inside the existing AES-GCM encrypted
snapshot. The relay protocol version and pairing flow remain unchanged, so
existing companion and mobile installations continue syncing. Older readers
ignore the added fields.

## Push alerts

The Companion treats its first complete observation as a baseline. Later
observations compare opaque credit IDs and enqueue a notification only when a
new ID appears. Incomplete or malformed details do not trigger an alert. The
relay receives only an opaque idempotency event; it never receives the reset
IDs, quota values or expiry times. The notification text is generic and does
not reveal account usage on the lock screen.

The mobile app explicitly obtains OS notification permission before it registers
with FCM. It sends the Firebase Installation ID (FID), not an account credential,
to the relay over HTTPS. The Worker encrypts the FID with AES-256-GCM before D1
persistence, expires it with the paired channel, and removes it when alerts are
disabled or the device disconnects. The Worker decrypts it only in memory to
send a generic notification through FCM. The Firebase service-account JSON and
token-encryption key are Cloudflare Worker secrets, never repository files.
Firebase client configuration contains project identifiers/public values only.

The same generic title/body is used on Android and iOS. The payload contains no
Codex reset identifier, count, expiry, quota percentage, prompt or account data;
the app reads the current count and next expiry from the end-to-end encrypted
snapshot. Android targets FCM by FID using the HTTP v1 API; iOS delivery is
forwarded by FCM through APNs. Firebase receives the FID and the technical app
and device data documented for FCM. Notifications are opt-in and best-effort;
OS settings, network conditions, APNs/FCM delivery and collapsed alerts can
delay or suppress them.

The GitHub Store privacy declarations must be reviewed before submission:
declare the installation identifier for optional notification delivery, and
update Apple's App Privacy and Google Play Data safety forms to match the actual
Firebase SDK collection and service-provider processing. See the current
[Firebase Android disclosure](https://firebase.google.com/docs/android/play-data-disclosure)
and [Firebase Apple disclosure](https://firebase.google.com/docs/ios/app-store-data-collection).

Push delivery is best-effort; APNs and FCM can delay, collapse or omit
notifications. The app remains the authoritative place to view current counts
and expirations.
