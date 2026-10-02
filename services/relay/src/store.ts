import type { D1Database, PushDevice, PushEventClaim } from "./types";
import type {
  SnapshotEnvelope,
  ServicesEnvelope,
  ServicesPublication,
} from "./protocol";

export interface RelayChannel {
  readonly id: string;
  readonly publisherTokenHash: string;
  readonly pairingTokenHash: string | null;
  readonly readerTokenHash: string | null;
  readonly protocolVersion: number;
  readonly pairingExpiresAt: number;
  readonly readerClaimedAt: number | null;
  readonly sequence: number | null;
  readonly nonce: string | null;
  readonly ciphertext: string | null;
  readonly services: ServicesEnvelope | null;
  readonly servicesUpdatedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly expiresAt: number;
}

export type StoreResult<T> =
  | Readonly<{ kind: "ok"; value: T }>
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "expired" }>
  | Readonly<{ kind: "pairingExpired" }>
  | Readonly<{ kind: "stale" }>;

export interface RelayStore {
  create(channel: RelayChannel): Promise<void>;
  metadata(
    channelID: string,
    publisherTokenHash: string,
    now: number,
  ): Promise<StoreResult<RelayChannel>>;
  claim(
    channelID: string,
    pairingTokenHash: string,
    readerTokenHash: string,
    now: number,
  ): Promise<StoreResult<RelayChannel>>;
  writeSnapshot(
    channelID: string,
    publisherTokenHash: string,
    envelope: SnapshotEnvelope,
    now: number,
    expiresAt: number,
  ): Promise<StoreResult<RelayChannel>>;
  writeServices(
    channelID: string,
    publisherTokenHash: string,
    publication: ServicesPublication,
    now: number,
    expiresAt: number,
  ): Promise<StoreResult<RelayChannel>>;
  readSnapshot(
    channelID: string,
    readerTokenHash: string,
    now: number,
  ): Promise<StoreResult<RelayChannel>>;
  delete(
    channelID: string,
    publisherTokenHash: string,
    now: number,
  ): Promise<StoreResult<null>>;
  registerPushDevice(
    channelID: string,
    readerTokenHash: string,
    device: PushDevice,
    now: number,
  ): Promise<StoreResult<null>>;
  unregisterPushDevice(
    channelID: string,
    readerTokenHash: string,
    now: number,
  ): Promise<StoreResult<null>>;
  unregisterInvalidPushDevice(
    channelID: string,
    publisherTokenHash: string,
    deviceID: string,
    now: number,
  ): Promise<StoreResult<null>>;
  readPushDevice(
    channelID: string,
    publisherTokenHash: string,
    now: number,
  ): Promise<StoreResult<PushDevice | null>>;
  claimPushEvent(
    channelID: string,
    publisherTokenHash: string,
    eventID: string,
    now: number,
    expiresAt: number,
  ): Promise<StoreResult<PushEventClaim>>;
  completePushEvent(
    channelID: string,
    publisherTokenHash: string,
    eventID: string,
    now: number,
  ): Promise<StoreResult<null>>;
  releasePushEvent(
    channelID: string,
    publisherTokenHash: string,
    eventID: string,
    now: number,
  ): Promise<StoreResult<null>>;
  purgeExpired(now: number): Promise<number>;
}

interface RelayChannelRow {
  readonly id: string;
  readonly publisher_token_hash: string;
  readonly pairing_token_hash: string | null;
  readonly reader_token_hash: string | null;
  readonly protocol_version: number;
  readonly pairing_expires_at: number;
  readonly reader_claimed_at: number | null;
  readonly sequence: number | null;
  readonly nonce: string | null;
  readonly ciphertext: string | null;
  readonly services_sequence: number | null;
  readonly services_nonce: string | null;
  readonly services_ciphertext: string | null;
  readonly services_updated_at: number | null;
  readonly created_at: number;
  readonly updated_at: number;
  readonly expires_at: number;
}

export class D1RelayStore implements RelayStore {
  constructor(private readonly database: D1Database) {}

  async create(channel: RelayChannel): Promise<void> {
    const result = await this.database
      .prepare(
        `INSERT INTO relay_channels (
          id, publisher_token_hash, pairing_token_hash, reader_token_hash, protocol_version,
          pairing_expires_at, reader_claimed_at, sequence, nonce, ciphertext,
          created_at, updated_at, expires_at
        ) VALUES (?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)`,
      )
      .bind(
        channel.id,
        channel.publisherTokenHash,
        channel.pairingTokenHash,
        channel.protocolVersion,
        channel.pairingExpiresAt,
        channel.createdAt,
        channel.updatedAt,
        channel.expiresAt,
      )
      .run();
    if (!result.success) {
      throw new Error("D1 could not create the relay channel.");
    }
  }

  async metadata(
    channelID: string,
    publisherTokenHash: string,
    now: number,
  ): Promise<StoreResult<RelayChannel>> {
    return this.authorized(
      channelID,
      "publisher_token_hash",
      publisherTokenHash,
      now,
    );
  }

  async claim(
    channelID: string,
    pairingTokenHash: string,
    readerTokenHash: string,
    now: number,
  ): Promise<StoreResult<RelayChannel>> {
    const current = await this.authorized(
      channelID,
      "pairing_token_hash",
      pairingTokenHash,
      now,
    );
    if (current.kind !== "ok") {
      return current;
    }
    if (current.value.pairingExpiresAt < now) {
      return { kind: "pairingExpired" };
    }
    const update = await this.database
      .prepare(
        "UPDATE relay_channels SET pairing_token_hash = NULL, reader_token_hash = ?, reader_claimed_at = ?, updated_at = ? WHERE id = ? AND pairing_token_hash = ? AND reader_claimed_at IS NULL AND pairing_expires_at >= ?",
      )
      .bind(readerTokenHash, now, now, channelID, pairingTokenHash, now)
      .run();
    if (!update.success) {
      throw new Error("D1 could not claim the relay channel.");
    }
    if ((update.meta.changes ?? 0) === 0) {
      return { kind: "missing" };
    }
    return this.authorized(
      channelID,
      "reader_token_hash",
      readerTokenHash,
      now,
    );
  }

  async writeSnapshot(
    channelID: string,
    publisherTokenHash: string,
    envelope: SnapshotEnvelope,
    now: number,
    expiresAt: number,
  ): Promise<StoreResult<RelayChannel>> {
    const current = await this.authorized(
      channelID,
      "publisher_token_hash",
      publisherTokenHash,
      now,
    );
    if (current.kind !== "ok") {
      return current;
    }
    if (
      envelope.sequence <=
      Math.max(
        current.value.sequence ?? 0,
        current.value.services?.sequence ?? 0,
      )
    ) {
      return { kind: "stale" };
    }
    const update = await this.database
      .prepare(
        `UPDATE relay_channels
         SET protocol_version = ?, sequence = ?, nonce = ?, ciphertext = ?, updated_at = ?, expires_at = ?,
             services_sequence = NULL, services_nonce = NULL, services_ciphertext = NULL, services_updated_at = NULL
         WHERE id = ? AND publisher_token_hash = ? AND expires_at >= ?
           AND (sequence IS NULL OR sequence < ?) AND (services_sequence IS NULL OR services_sequence < ?)`,
      )
      .bind(
        envelope.protocolVersion,
        envelope.sequence,
        envelope.nonce,
        envelope.ciphertext,
        now,
        expiresAt,
        channelID,
        publisherTokenHash,
        now,
        envelope.sequence,
        envelope.sequence,
      )
      .run();
    if (!update.success) {
      throw new Error("D1 could not update the relay channel.");
    }
    if ((update.meta.changes ?? 0) === 0) {
      return { kind: "stale" };
    }
    return this.authorized(
      channelID,
      "publisher_token_hash",
      publisherTokenHash,
      now,
    );
  }

  async writeServices(
    channelID: string,
    publisherTokenHash: string,
    publication: ServicesPublication,
    now: number,
    expiresAt: number,
  ): Promise<StoreResult<RelayChannel>> {
    const current = await this.authorized(
      channelID,
      "publisher_token_hash",
      publisherTokenHash,
      now,
    );
    if (current.kind !== "ok") return current;
    const { services, codex } = publication;
    if (
      services.sequence <=
      Math.max(
        current.value.sequence ?? 0,
        current.value.services?.sequence ?? 0,
      )
    ) {
      return { kind: "stale" };
    }
    // One atomic update: AGY-only writes preserve the old Codex sample and age.
    const update = await this.database
      .prepare(
        `UPDATE relay_channels
       SET services_sequence = ?, services_nonce = ?, services_ciphertext = ?, services_updated_at = ?,
           sequence = COALESCE(?, sequence), nonce = COALESCE(?, nonce), ciphertext = COALESCE(?, ciphertext),
           updated_at = CASE WHEN ? THEN ? ELSE updated_at END, expires_at = ?
       WHERE id = ? AND publisher_token_hash = ? AND expires_at >= ?
         AND (sequence IS NULL OR sequence < ?) AND (services_sequence IS NULL OR services_sequence < ?)`,
      )
      .bind(
        services.sequence,
        services.nonce,
        services.ciphertext,
        now,
        codex?.sequence ?? null,
        codex?.nonce ?? null,
        codex?.ciphertext ?? null,
        codex === null ? 0 : 1,
        now,
        expiresAt,
        channelID,
        publisherTokenHash,
        now,
        services.sequence,
        services.sequence,
      )
      .run();
    if (!update.success) throw new Error("D1 could not update services.");
    if ((update.meta.changes ?? 0) === 0) return { kind: "stale" };
    return this.authorized(
      channelID,
      "publisher_token_hash",
      publisherTokenHash,
      now,
    );
  }

  async readSnapshot(
    channelID: string,
    readerTokenHash: string,
    now: number,
  ): Promise<StoreResult<RelayChannel>> {
    return this.authorized(
      channelID,
      "reader_token_hash",
      readerTokenHash,
      now,
    );
  }

  async delete(
    channelID: string,
    publisherTokenHash: string,
    now: number,
  ): Promise<StoreResult<null>> {
    const current = await this.authorized(
      channelID,
      "publisher_token_hash",
      publisherTokenHash,
      now,
    );
    if (current.kind !== "ok") {
      return current;
    }
    const result = await this.database
      .prepare(
        "DELETE FROM relay_channels WHERE id = ? AND publisher_token_hash = ?",
      )
      .bind(channelID, publisherTokenHash)
      .run();
    if (!result.success || (result.meta.changes ?? 0) === 0) {
      return { kind: "missing" };
    }
    return { kind: "ok", value: null };
  }

  async registerPushDevice(
    channelID: string,
    readerTokenHash: string,
    device: PushDevice,
    now: number,
  ): Promise<StoreResult<null>> {
    const current = await this.authorized(
      channelID,
      "reader_token_hash",
      readerTokenHash,
      now,
    );
    if (current.kind !== "ok") return current;
    const result = await this.database
      .prepare(
        `INSERT INTO relay_push_devices (
          channel_id, device_id, fid_nonce, fid_ciphertext, language, updated_at, reset_credits, quota_alerts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(channel_id) DO UPDATE SET
          device_id = excluded.device_id,
          fid_nonce = excluded.fid_nonce,
          fid_ciphertext = excluded.fid_ciphertext,
          language = excluded.language,
          updated_at = excluded.updated_at,
          reset_credits = excluded.reset_credits,
          quota_alerts = excluded.quota_alerts`,
      )
      .bind(
        channelID,
        device.deviceID,
        device.nonce,
        device.ciphertext,
        device.language,
        now,
        device.resetCredits === false ? 0 : 1,
        device.quotaAlerts === true ? 1 : 0,
      )
      .run();
    if (!result.success)
      throw new Error("D1 could not register a push device.");
    return { kind: "ok", value: null };
  }

  async unregisterPushDevice(
    channelID: string,
    readerTokenHash: string,
    now: number,
  ): Promise<StoreResult<null>> {
    const current = await this.authorized(
      channelID,
      "reader_token_hash",
      readerTokenHash,
      now,
    );
    if (current.kind !== "ok") return current;
    const result = await this.database
      .prepare("DELETE FROM relay_push_devices WHERE channel_id = ?")
      .bind(channelID)
      .run();
    if (!result.success)
      throw new Error("D1 could not unregister a push device.");
    return { kind: "ok", value: null };
  }

  async unregisterInvalidPushDevice(
    channelID: string,
    publisherTokenHash: string,
    deviceID: string,
    now: number,
  ): Promise<StoreResult<null>> {
    const current = await this.authorized(
      channelID,
      "publisher_token_hash",
      publisherTokenHash,
      now,
    );
    if (current.kind !== "ok") return current;
    const result = await this.database
      .prepare(
        "DELETE FROM relay_push_devices WHERE channel_id = ? AND device_id = ?",
      )
      .bind(channelID, deviceID)
      .run();
    if (!result.success)
      throw new Error("D1 could not remove an invalid push device.");
    return { kind: "ok", value: null };
  }

  async readPushDevice(
    channelID: string,
    publisherTokenHash: string,
    now: number,
  ): Promise<StoreResult<PushDevice | null>> {
    const current = await this.authorized(
      channelID,
      "publisher_token_hash",
      publisherTokenHash,
      now,
    );
    if (current.kind !== "ok") return current;
    const row = await this.database
      .prepare("SELECT * FROM relay_push_devices WHERE channel_id = ?")
      .bind(channelID)
      .first<RelayPushDeviceRow>();
    return { kind: "ok", value: row === null ? null : mapPushDevice(row) };
  }

  async claimPushEvent(
    channelID: string,
    publisherTokenHash: string,
    eventID: string,
    now: number,
    expiresAt: number,
  ): Promise<StoreResult<PushEventClaim>> {
    const current = await this.authorized(
      channelID,
      "publisher_token_hash",
      publisherTokenHash,
      now,
    );
    if (current.kind !== "ok") return current;
    const inserted = await this.database
      .prepare(
        `INSERT OR IGNORE INTO relay_push_events (
          channel_id, event_id, status, locked_until, created_at, expires_at
        ) VALUES (?, ?, 'pending', 0, ?, ?)`,
      )
      .bind(channelID, eventID, now, expiresAt)
      .run();
    if (!inserted.success)
      throw new Error("D1 could not persist a push event.");
    const claimed = await this.database
      .prepare(
        `UPDATE relay_push_events
         SET status = 'sending', locked_until = ?
         WHERE channel_id = ? AND event_id = ? AND status != 'sent' AND locked_until <= ?`,
      )
      .bind(now + 60, channelID, eventID, now)
      .run();
    if (!claimed.success) throw new Error("D1 could not claim a push event.");
    if ((claimed.meta.changes ?? 0) > 0)
      return { kind: "ok", value: "claimed" };
    const row = await this.database
      .prepare(
        "SELECT status FROM relay_push_events WHERE channel_id = ? AND event_id = ?",
      )
      .bind(channelID, eventID)
      .first<Readonly<{ status: string }>>();
    return {
      kind: "ok",
      value: row?.status === "sent" ? "sent" : "busy",
    };
  }

  async completePushEvent(
    channelID: string,
    publisherTokenHash: string,
    eventID: string,
    now: number,
  ): Promise<StoreResult<null>> {
    const current = await this.authorized(
      channelID,
      "publisher_token_hash",
      publisherTokenHash,
      now,
    );
    if (current.kind !== "ok") return current;
    const result = await this.database
      .prepare(
        "UPDATE relay_push_events SET status = 'sent', locked_until = 0 WHERE channel_id = ? AND event_id = ?",
      )
      .bind(channelID, eventID)
      .run();
    if (!result.success) throw new Error("D1 could not complete a push event.");
    return { kind: "ok", value: null };
  }

  async releasePushEvent(
    channelID: string,
    publisherTokenHash: string,
    eventID: string,
    now: number,
  ): Promise<StoreResult<null>> {
    const current = await this.authorized(
      channelID,
      "publisher_token_hash",
      publisherTokenHash,
      now,
    );
    if (current.kind !== "ok") return current;
    const result = await this.database
      .prepare(
        "UPDATE relay_push_events SET status = 'pending', locked_until = 0 WHERE channel_id = ? AND event_id = ? AND status = 'sending'",
      )
      .bind(channelID, eventID)
      .run();
    if (!result.success) throw new Error("D1 could not release a push event.");
    return { kind: "ok", value: null };
  }

  async purgeExpired(now: number): Promise<number> {
    const result = await this.database
      .prepare("DELETE FROM relay_channels WHERE expires_at < ?")
      .bind(now)
      .run();
    if (!result.success) {
      throw new Error("D1 could not purge expired relay channels.");
    }
    const pushEvents = await this.database
      .prepare("DELETE FROM relay_push_events WHERE expires_at < ?")
      .bind(now)
      .run();
    if (!pushEvents.success)
      throw new Error("D1 could not purge expired push events.");
    return result.meta.changes ?? 0;
  }

  private async authorized(
    channelID: string,
    tokenColumn:
      "publisher_token_hash" | "pairing_token_hash" | "reader_token_hash",
    tokenHash: string,
    now: number,
  ): Promise<StoreResult<RelayChannel>> {
    const row = await this.database
      .prepare(
        `SELECT * FROM relay_channels WHERE id = ? AND ${tokenColumn} = ?`,
      )
      .bind(channelID, tokenHash)
      .first<RelayChannelRow>();
    if (row === null) {
      return { kind: "missing" };
    }
    const channel = mapRow(row);
    if (channel.expiresAt < now) {
      return { kind: "expired" };
    }
    return { kind: "ok", value: channel };
  }
}

interface RelayPushDeviceRow {
  readonly device_id: string;
  readonly fid_nonce: string;
  readonly fid_ciphertext: string;
  readonly language: "en" | "es";
  readonly updated_at: number;
  readonly reset_credits: number;
  readonly quota_alerts: number;
}

function mapPushDevice(row: RelayPushDeviceRow): PushDevice {
  return {
    deviceID: row.device_id,
    nonce: row.fid_nonce,
    ciphertext: row.fid_ciphertext,
    language: row.language,
    updatedAt: row.updated_at,
    resetCredits: row.reset_credits === 1,
    quotaAlerts: row.quota_alerts === 1,
  };
}

function mapRow(row: RelayChannelRow): RelayChannel {
  return {
    id: row.id,
    publisherTokenHash: row.publisher_token_hash,
    pairingTokenHash: row.pairing_token_hash,
    readerTokenHash: row.reader_token_hash,
    protocolVersion: row.protocol_version,
    pairingExpiresAt: row.pairing_expires_at,
    readerClaimedAt: row.reader_claimed_at,
    sequence: row.sequence,
    nonce: row.nonce,
    ciphertext: row.ciphertext,
    services:
      row.services_sequence != null &&
      row.services_nonce != null &&
      row.services_ciphertext != null
        ? {
            protocolVersion: 1,
            payloadKind: "services-v1",
            sequence: row.services_sequence,
            nonce: row.services_nonce,
            ciphertext: row.services_ciphertext,
          }
        : null,
    servicesUpdatedAt: row.services_updated_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}
