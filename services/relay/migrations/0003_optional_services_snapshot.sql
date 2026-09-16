-- Additive only: retain every channel, credential, v1 snapshot and pairing.
-- Deploy this migration before a worker that advertises services-v1.
ALTER TABLE relay_channels ADD COLUMN services_sequence INTEGER;
ALTER TABLE relay_channels ADD COLUMN services_nonce TEXT;
ALTER TABLE relay_channels ADD COLUMN services_ciphertext TEXT;
ALTER TABLE relay_channels ADD COLUMN services_updated_at INTEGER;
