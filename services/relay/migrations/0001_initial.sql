CREATE TABLE relay_channels (
    id TEXT PRIMARY KEY NOT NULL,
    publisher_token_hash TEXT NOT NULL,
    reader_token_hash TEXT NOT NULL,
    protocol_version INTEGER NOT NULL DEFAULT 1,
    pairing_expires_at INTEGER NOT NULL,
    reader_claimed_at INTEGER,
    sequence INTEGER,
    nonce TEXT,
    ciphertext TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX relay_channels_expiry_idx
    ON relay_channels (expires_at);
