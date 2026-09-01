DROP INDEX IF EXISTS relay_channels_expiry_idx;

ALTER TABLE relay_channels RENAME TO relay_channels_v0;

CREATE TABLE relay_channels (
    id TEXT PRIMARY KEY NOT NULL,
    publisher_token_hash TEXT NOT NULL,
    pairing_token_hash TEXT,
    reader_token_hash TEXT,
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

INSERT INTO relay_channels (
    id,
    publisher_token_hash,
    pairing_token_hash,
    reader_token_hash,
    protocol_version,
    pairing_expires_at,
    reader_claimed_at,
    sequence,
    nonce,
    ciphertext,
    created_at,
    updated_at,
    expires_at
)
SELECT
    id,
    publisher_token_hash,
    CASE WHEN reader_claimed_at IS NULL THEN reader_token_hash ELSE NULL END,
    CASE WHEN reader_claimed_at IS NOT NULL THEN reader_token_hash ELSE NULL END,
    protocol_version,
    pairing_expires_at,
    reader_claimed_at,
    sequence,
    nonce,
    ciphertext,
    created_at,
    updated_at,
    expires_at
FROM relay_channels_v0;

DROP TABLE relay_channels_v0;

CREATE INDEX relay_channels_expiry_idx
    ON relay_channels (expires_at);
