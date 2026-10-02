-- Existing registrations keep their original Codex-credit scope; no auto opt-in.
ALTER TABLE relay_push_devices ADD COLUMN reset_credits INTEGER NOT NULL DEFAULT 1 CHECK (reset_credits IN (0, 1));
ALTER TABLE relay_push_devices ADD COLUMN quota_alerts INTEGER NOT NULL DEFAULT 0 CHECK (quota_alerts IN (0, 1));
