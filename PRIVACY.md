# Statusline — Privacy Policy

Effective date: 31 August 2026

Public policy: https://statusline-relay.inmerzion.workers.dev/privacy

Statusline is designed to display Codex quota metadata without collecting Codex account credentials.

## Data processed locally

The desktop companion starts the locally installed Codex App Server and reads only the fields needed to show usage windows, reset times, account type and plan. It does not read, copy or store Codex access tokens, API keys, prompts, source code or conversation content.

When a user selects a Codex executable manually, Statusline stores that local file path in its application configuration directory. The path remains on that computer and can be cleared with Source Settings → Use automatic detection.

## Universal encrypted relay

Sync is optional. When a user creates a pairing, the desktop generates an AES-256 encryption key locally. The QR transfers that key and a short-lived, single-use pairing credential to the mobile device. A successful claim invalidates it and returns a separate reader credential over HTTPS. Publisher and reader credentials are stored in the operating system secure store (including Keychain and Android Keystore) and are not exposed to the interface layer.

On Android, QR capture uses CameraX and the bundled ML Kit barcode model. Statusline requests camera access only after the user selects Scan QR. Camera frames and decoded QR contents are processed on-device: Statusline does not store or transmit them, and the bundled reader does not need to download a model from Google Play services. A decoded pairing link is used only to claim the selected relay channel; the encryption key remains on the device. Manual link entry remains available when camera access is denied or no camera is present.

Google documents that ML Kit may collect device and application information, an installation identifier, API configuration, feature events, performance measurements and error diagnostics. Google uses this information for diagnostics and usage analytics; Statusline does not receive it. See [Google's ML Kit data disclosure](https://developers.google.com/ml-kit/android-data-disclosure) for the current SDK behavior.

The relay receives:

- a random channel identifier;
- SHA-256 hashes of random publisher and reader credentials;
- an opaque AES-256-GCM ciphertext containing the remaining weekly percentage, reset date, update date and schema version;
- timestamps needed for expiration and replay protection.

The relay does not receive the encryption key, Codex credentials, email address, prompts or source code, and therefore cannot decrypt the quota snapshot. The Cloudflare deployment applies abuse limits before credential parsing using a SHA-256 digest of the source IP address. Neither the source IP nor that digest is written to the Statusline D1 database.

Persistent Cloudflare Worker invocation logs are disabled in the production project configuration. Cloudflare may still process IP addresses and request metadata at its edge for request delivery, security, abuse prevention, aggregate metrics and billing. Statusline does not integrate advertising SDKs or its own product analytics SDK. The ML Kit diagnostics described above are the only bundled third-party SDK telemetry currently identified in the mobile applications.

## Retention and deletion

Pairing links expire after ten minutes. Channels expire after thirty days without a successful publication, and an automated daily task removes expired rows.

Rate-limit state is short-lived and scoped to 60-second windows. It is maintained by the hosting platform and is not stored in the Statusline relay database. Aggregate platform metrics may be retained according to the hosting provider's account and service terms.

Disconnecting from a desktop attempts to delete the remote channel and then removes the publisher credential from the local secure store. Disconnecting only the mobile reader removes its local credential and key; any remaining remote ciphertext is unreadable by that device and is deleted when the publisher disconnects or the channel expires. Removing the application also removes data according to the operating system's app and secure-storage behavior.

## Support

Privacy questions and reports can be sent to [founder@inmerzion.io](mailto:founder@inmerzion.io) or submitted through the channel described in [SUPPORT.md](SUPPORT.md). Do not include pairing links, QR codes, API keys, access tokens or private Codex configuration in a report.

Material changes to the relay host, logging configuration, retention policy, bundled SDKs or mobile background synchronization will be reflected in this notice before they are released.
