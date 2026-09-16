# Optional services-v1 extension

This additive extension preserves [relay v1](statusline-relay-v1.md), including
its QR, reader/publisher credentials, channel IDs and encrypted Codex projection.
It does not require users to pair again. Implementation begins with Companion
0.1.24, iOS 1.1.0 and Android 0.1.25; publishing source is not proof of a
deployed release.

## Negotiation and storage

`GET /health` and authenticated publisher channel metadata advertise
`capabilities: ["services-v1"]`. Publishers check channel metadata before using
the extension. Without this capability they continue publishing Codex v1; they
must not label Gemini as synced. Metadata also has nullable
`servicesLastPublishedAt` (server receipt time).

Migration `0003_optional_services_snapshot.sql` adds four nullable columns to the
existing channel row. It does not change existing tokens, ciphertext, expiry or
pairings. Apply the migration **before** deploying the new Worker. The old
Worker ignores these columns and remains usable during deployment/rollback.

`PUT /v1/channels/{channel}/services` requires the existing publisher bearer token:

```json
{
  "services": {
    "protocolVersion": 1,
    "payloadKind": "services-v1",
    "sequence": 1900000000000,
    "nonce": "<12 random bytes, base64url>",
    "ciphertext": "<ciphertext and GCM tag, base64url>"
  },
  "codex": null
}
```

When a valid Codex weekly reading exists, `codex` is its original v1 encrypted
envelope, with the **same sequence but a different random nonce**. Both slots are
updated atomically in one SQL statement. Sequence must exceed both stored slots.
Without Codex, its existing slot and original sample/receipt age are preserved;
a new AGY-only channel has no Codex slot. Empty inventories remove services for
new readers, never manufacture a Codex reading for an old reader.

The request is limited to 16 KiB and each encrypted payload to 4,096 bytes.
Legacy requests retain their 8 KiB body limit. Streaming reads stop at the limit,
including when Content-Length is omitted. Both publication routes share the
existing snapshot rate-limit key. Retention remains 30 days after publication.

New readers use the **existing** snapshot GET with the exact header:

```http
Accept: application/vnd.statusline.services-v1+json
```

If available, the response is the services envelope. Otherwise it is the original
Codex envelope (no payloadKind). No extra per-provider request is required. Old
readers never receive the services envelope; a missing Codex slot gives the
existing snapshotNotFound response. Successful responses vary on Accept and
remain no-store. If a rolled-back Worker writes newer Codex data, its newer
sequence takes precedence over the retained services slot. A v1 publication to
the new Worker clears the optional inventory, preventing stale service revival.

## Encryption and plaintext

Use the existing pairing's AES-256-GCM key, a fresh OS-random 12-byte nonce for
each envelope, ciphertext followed by its 16-byte authentication tag, and
unpadded base64url. Services authenticated data is UTF-8:

```text
statusline.services.v1|<lowercase channel UUID>|<decimal sequence>
```

The discriminator and sequence cannot be substituted without failing decryption.
Codex v1 authenticated data is **unchanged**. The interoperable
[public test vector](fixtures/aes-gcm-services-v1.json) is verified by Rust and
Swift; its deterministic key/nonce are test-only, never production credentials.

```json
{
  "schemaVersion": 1,
  "updatedAt": 1900000000,
  "providers": [
    {
      "id": "antigravity",
      "status": "ready",
      "updatedAt": 1900000000,
      "weekly": null,
      "shortWindow": {
        "remainingPercentage": 73,
        "resetAt": 1900003600,
        "windowMinutes": 300
      }
    }
  ]
}
```

- IDs are stable adapter identifiers: codex and antigravity (Google Gemini only).
  The experimental Claude foundation adds `claude` **only when locally detected**,
  with `status: "unavailable"` and no windows. Detection is not quota or login.
  Existing iOS/Android releases ignore this unknown ID and retain Codex/Gemini.
  No static entry for an absent service, account email, vendor token, path or
  prompt is sent. See [Claude source gates](../docs/architecture/claude-sources.md).
- The list is authoritative and bounded to 16 unique IDs (lowercase ASCII
  letters, digits and hyphens, 1–64 characters). Unknown future IDs are ignored
  by readers without imposing today's provider-specific schema on them.
- All timestamps are positive Unix seconds. Known provider sample times must
  not exceed the inventory timestamp. Percentages are integers from 0 to 100.
- Ready requires at least one window. Unavailable keeps the service present but
  has no quota windows; absence means removal. Missing quotas are not 0 or 100.
- Codex weekly windows are 8,640–11,520 minutes; short windows are below 8,640.
  Antigravity weekly is exactly 10,080 minutes and its short window 300 minutes.
  A five-hour quota must never be shown as a weekly quota.
- Authentication or networking failure does not imply removal. Explicit disable
  and confirmed missing local installations follow Companion's visibility rules.

## Client behavior and rollout

Companion's collectors remain independent on the native five-minute scheduler.
A 400 ms publication window combines nearby results; slow collectors may cause
two publications in a cycle. Initial inventory waits for both discovery results.
Identical cached inventories are not republished. Metadata negotiation reuses the
existing publisher metadata call; do not claim zero additional traffic in every
timing scenario. Mobile still makes one read per refresh, not one per service.

iOS app and widget caches are independently owned and channel-scoped, with a
sequence guard. An authoritative empty list takes precedence over legacy Codex
caches. Disconnect/re-pair and late results must not restore an old account.
Offline reads keep the last successful inventory, with sample age visible.
The small widget follows the app's focus; the medium widget also shows its other
supported service. A removed preferred service falls back only to another
service in that same inventory, not to a global placeholder. An unavailable
service stays visible without an invented percentage.

Validate in order: local SQL upgrade and old/new client matrix; crypto fixtures;
native and iOS tests; processed app/widget endpoint guard; private live smoke
channel; Worker rollout; Companion publication; iOS TestFlight upgrade. A test
channel must be deleted after use, never reuse or delete a user's channel.
Roll back the Worker code if needed; retain the additive database columns.
Android and older iOS releases continue receiving Codex until separately updated.

WidgetKit schedules refreshes opportunistically. Thirty minutes is the requested
cadence, not a promise; opening the iOS app is not required for network reads.
