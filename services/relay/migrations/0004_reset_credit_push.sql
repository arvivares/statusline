CREATE TABLE relay_push_devices (
    channel_id TEXT PRIMARY KEY NOT NULL REFERENCES relay_channels(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    fid_nonce TEXT NOT NULL,
    fid_ciphertext TEXT NOT NULL,
    language TEXT NOT NULL CHECK (language IN ('en', 'es')),
    updated_at INTEGER NOT NULL
);

CREATE TABLE relay_push_events (
    channel_id TEXT NOT NULL REFERENCES relay_channels(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent')),
    locked_until INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (channel_id, event_id)
);

CREATE INDEX relay_push_events_expiry_idx
    ON relay_push_events (expires_at);
