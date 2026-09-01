import type { D1Database } from "./types";
import type { SnapshotEnvelope } from "./protocol";

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
      current.value.sequence !== null &&
      envelope.sequence <= current.value.sequence
    ) {
      return { kind: "stale" };
    }
    const update = await this.database
      .prepare(
        `UPDATE relay_channels
         SET protocol_version = ?, sequence = ?, nonce = ?, ciphertext = ?, updated_at = ?, expires_at = ?
         WHERE id = ? AND publisher_token_hash = ? AND (sequence IS NULL OR sequence < ?)`,
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

  async purgeExpired(now: number): Promise<number> {
    const result = await this.database
      .prepare("DELETE FROM relay_channels WHERE expires_at < ?")
      .bind(now)
      .run();
    if (!result.success) {
      throw new Error("D1 could not purge expired relay channels.");
    }
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}
