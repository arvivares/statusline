# Statusline Relay Protocol v1

This document is the normative cross-platform contract for Statusline synchronization.

## Transport

- Production origins must use HTTPS.
- Clients must reject redirects, credentials embedded in URLs, query strings and fragments on the configured origin.
- HTTP is allowed only for loopback development builds.
- Requests and responses use JSON unless the success response has no body.
- Bearer credentials are 32 random bytes encoded as unpadded base64url: exactly 43 characters.
- Channel identifiers are lowercase UUID v4 values.

The configured relay origin is intentionally absent from the QR. A reader accepts a pairing only against the origin already trusted by its build.

## Roles

| Credential     | Lifetime                   | Capability                                   |
| -------------- | -------------------------- | -------------------------------------------- |
| publisherToken | Channel lifetime           | Metadata, write snapshot, delete channel     |
| pairingToken   | Ten minutes or first claim | Exchange once for a reader token             |
| readerToken    | Channel lifetime           | Read the latest snapshot                     |
| encryption key | Channel lifetime           | Encrypt/decrypt locally; never sent to relay |

The relay stores SHA-256 hashes of credentials, never their plaintext values. A successful claim clears the pairing-token hash and returns a newly generated reader token.

## Pairing URI

```text
statusline://pair?v=1&channel=<uuid>&pairing=<43-char-token>&key=<43-char-key>
```

Rules:

- exactly four unique query fields are required;
- key decodes to 32 bytes;
- pairing decodes to 32 bytes;
- publisherToken and relay origin must never be included;
- the full URI and its QR representation are secrets until claim succeeds.

## API

### Health

GET /health → 200

```json
{ "status": "ok", "protocolVersion": 1 }
```

### Create channel

POST /v1/channels → 201

```json
{
  "protocolVersion": 1,
  "channelId": "018f47a0-7b52-4c15-9e55-5f0f266b7440",
  "publisherToken": "<base64url>",
  "pairingToken": "<base64url>",
  "pairingExpiresAt": 1900000600,
  "expiresAt": 1902592000
}
```

No authorization header is used. Creation is rate-limited by request origin.

### Claim reader

POST /v1/channels/{channelId}/claim with Authorization: Bearer pairingToken → 201

```json
{
  "protocolVersion": 1,
  "readerToken": "<new-base64url-token>",
  "expiresAt": 1902592000
}
```

The operation is single-use and must complete before pairingExpiresAt. The returned token replaces the pairing token in secure storage.

### Publisher metadata

GET /v1/channels/{channelId} with publisher authorization → 200

```json
{
  "protocolVersion": 1,
  "readerClaimedAt": 1900000010,
  "pairingExpiresAt": 1900000600,
  "lastPublishedAt": 1900000020,
  "expiresAt": 1902592020
}
```

Nullable timestamps are encoded as null.

### Publish

PUT /v1/channels/{channelId}/snapshot with publisher authorization and Content-Type application/json → 201

```json
{
  "protocolVersion": 1,
  "sequence": 1900000020123,
  "nonce": "<12-byte-base64url>",
  "ciphertext": "<ciphertext-plus-16-byte-tag-base64url>"
}
```

sequence is a positive safe integer and must be greater than the stored sequence. Clients use Unix epoch milliseconds and force monotonicity with max(now, previous + 1). A successful write extends channel expiry by thirty days.

### Read

GET /v1/channels/{channelId}/snapshot with reader authorization → 200 and the same envelope. If no sample exists, the server returns 404 with snapshotNotFound.

The pairing token cannot read snapshots.

### Delete

DELETE /v1/channels/{channelId} with publisher authorization → 204.

## Encrypted payload

Plaintext is UTF-8 JSON:

```json
{
  "schemaVersion": 1,
  "remainingPercentage": 53,
  "resetAt": 2000500000,
  "updatedAt": 1900000000
}
```

- remainingPercentage is an integer from 0 through 100.
- resetAt and updatedAt are positive Unix timestamps in seconds.
- encryption is AES-256-GCM;
- nonce is 12 cryptographically random bytes and must never repeat for one key;
- authentication tag is 16 bytes and is appended to ciphertext before base64url encoding;
- additional authenticated data is the exact UTF-8 string:

```text
statusline.snapshot.v1|<lowercase-channel-uuid>
```

JSON key ordering is not semantically significant. The deterministic fixture fixes one exact plaintext encoding for interoperability tests: [fixtures/aes-gcm-v1.json](fixtures/aes-gcm-v1.json).

## Errors

Errors have this shape:

```json
{ "error": { "code": "pairingExpired", "message": "Pairing code expired." } }
```

Defined codes include invalidRequest, notFound, channelNotFound, channelExpired, pairingExpired, snapshotNotFound, staleSnapshot, rateLimited and internalError. Unknown channel/credential combinations return 404 to avoid exposing role or channel existence. Rate-limited responses include Retry-After.

## Retention

- pairing lifetime: ten minutes;
- channel lifetime: thirty days after creation or latest publication;
- one encrypted snapshot per channel;
- a daily purge removes expired channels.
