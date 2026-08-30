# Statusline Companion — Privacy

Effective date: 30 August 2026

Statusline is designed to display Codex quota metadata without collecting Codex account credentials.

## Data processed locally

The desktop companion starts the locally installed Codex App Server and reads only the fields needed to show usage windows, reset times, account type and plan. It does not read, copy or store Codex access tokens, API keys, prompts, source code or conversation content.

When a user selects a Codex executable manually, Statusline stores that local file path in its application configuration directory. The path remains on that computer and can be cleared with Source Settings → Use automatic detection.

## Universal encrypted relay

Sync is optional. When a user creates a pairing, the desktop generates an AES-256 encryption key locally. The QR transfers that key and a short-lived, single-use pairing credential to the mobile device. A successful claim invalidates it and returns a separate reader credential over HTTPS. Publisher and reader credentials are stored in the operating system secure store and are not exposed to the interface layer.

The relay receives:

- a random channel identifier;
- SHA-256 hashes of random publisher and reader credentials;
- an opaque AES-256-GCM ciphertext containing the remaining weekly percentage, reset date, update date and schema version;
- timestamps needed for expiration and replay protection.

The relay does not receive the encryption key, Codex credentials, email address, prompts or source code, and therefore cannot decrypt the quota snapshot. The hosting provider may process IP addresses and request metadata for delivery, abuse prevention and operational logs. Statusline includes no advertising SDK and no product analytics SDK.

## Retention and deletion

Pairing links expire after ten minutes. Channels expire after thirty days without a successful publication, and an automated daily task removes expired rows.

Disconnecting from a desktop attempts to delete the remote channel and then removes the publisher credential from the local secure store. Disconnecting only the mobile reader removes its local credential and key; any remaining remote ciphertext is unreadable by that device and is deleted when the publisher disconnects or the channel expires. Removing the application also removes data according to the operating system's app and secure-storage behavior.

## Support

Privacy questions and reports can be submitted through the project support channel described in [SUPPORT.md](SUPPORT.md). Do not include pairing links, QR codes, API keys, access tokens or private Codex configuration in a report.

This notice must be reviewed against the final relay host, logging configuration, retention policy and mobile background-sync behavior before public release.
