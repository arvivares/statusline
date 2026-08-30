import type { SnapshotEnvelope } from "../src/protocol";
import type { RelayChannel, RelayStore, StoreResult } from "../src/store";

export class MemoryRelayStore implements RelayStore {
  readonly channels = new Map<string, RelayChannel>();

  async create(channel: RelayChannel): Promise<void> {
    this.channels.set(channel.id, channel);
  }

  async metadata(
    channelID: string,
    publisherTokenHash: string,
    now: number,
  ): Promise<StoreResult<RelayChannel>> {
    return this.authorized(channelID, publisherTokenHash, "publisher", now);
  }

  async claim(
    channelID: string,
    pairingTokenHash: string,
    readerTokenHash: string,
    now: number,
  ): Promise<StoreResult<RelayChannel>> {
    const result = this.authorized(channelID, pairingTokenHash, "pairing", now);
    if (result.kind !== "ok") return result;
    if (result.value.pairingExpiresAt < now) return { kind: "pairingExpired" };
    const updated = {
      ...result.value,
      pairingTokenHash: null,
      readerTokenHash,
      readerClaimedAt: now,
      updatedAt: now,
    };
    this.channels.set(channelID, updated);
    return { kind: "ok", value: updated };
  }

  async writeSnapshot(
    channelID: string,
    publisherTokenHash: string,
    envelope: SnapshotEnvelope,
    now: number,
    expiresAt: number,
  ): Promise<StoreResult<RelayChannel>> {
    const result = this.authorized(
      channelID,
      publisherTokenHash,
      "publisher",
      now,
    );
    if (result.kind !== "ok") return result;
    if (
      result.value.sequence !== null &&
      envelope.sequence <= result.value.sequence
    ) {
      return { kind: "stale" };
    }
    const updated: RelayChannel = {
      ...result.value,
      protocolVersion: envelope.protocolVersion,
      sequence: envelope.sequence,
      nonce: envelope.nonce,
      ciphertext: envelope.ciphertext,
      updatedAt: now,
      expiresAt,
    };
    this.channels.set(channelID, updated);
    return { kind: "ok", value: updated };
  }

  async readSnapshot(
    channelID: string,
    readerTokenHash: string,
    now: number,
  ): Promise<StoreResult<RelayChannel>> {
    return this.authorized(channelID, readerTokenHash, "reader", now);
  }

  async delete(
    channelID: string,
    publisherTokenHash: string,
    now: number,
  ): Promise<StoreResult<null>> {
    const result = this.authorized(
      channelID,
      publisherTokenHash,
      "publisher",
      now,
    );
    if (result.kind !== "ok") return result;
    this.channels.delete(channelID);
    return { kind: "ok", value: null };
  }

  async purgeExpired(now: number): Promise<number> {
    let count = 0;
    for (const [id, channel] of this.channels) {
      if (channel.expiresAt < now) {
        this.channels.delete(id);
        count += 1;
      }
    }
    return count;
  }

  private authorized(
    channelID: string,
    tokenHash: string,
    role: "publisher" | "pairing" | "reader",
    now: number,
  ): StoreResult<RelayChannel> {
    const channel = this.channels.get(channelID);
    const expected =
      role === "publisher"
        ? channel?.publisherTokenHash
        : role === "pairing"
          ? channel?.pairingTokenHash
          : channel?.readerTokenHash;
    if (channel === undefined || expected !== tokenHash)
      return { kind: "missing" };
    if (channel.expiresAt < now) return { kind: "expired" };
    return { kind: "ok", value: channel };
  }
}
