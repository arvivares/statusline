import type { SnapshotEnvelope, ServicesPublication } from "../src/protocol";
import type { PushDevice, PushEventClaim } from "../src/types";
import type { RelayChannel, RelayStore, StoreResult } from "../src/store";

export class MemoryRelayStore implements RelayStore {
  readonly channels = new Map<string, RelayChannel>();
  readonly pushDevices = new Map<string, PushDevice>();
  readonly pushEvents = new Map<
    string,
    { status: "sending" | "sent"; lockedUntil: number; expiresAt: number }
  >();

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
      envelope.sequence <=
      Math.max(result.value.sequence ?? 0, result.value.services?.sequence ?? 0)
    ) {
      return { kind: "stale" };
    }
    const updated: RelayChannel = {
      ...result.value,
      protocolVersion: envelope.protocolVersion,
      sequence: envelope.sequence,
      nonce: envelope.nonce,
      ciphertext: envelope.ciphertext,
      services: null,
      servicesUpdatedAt: null,
      updatedAt: now,
      expiresAt,
    };
    this.channels.set(channelID, updated);
    return { kind: "ok", value: updated };
  }

  async writeServices(
    channelID: string,
    publisherTokenHash: string,
    publication: ServicesPublication,
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
    const { services, codex } = publication;
    if (
      services.sequence <=
      Math.max(result.value.sequence ?? 0, result.value.services?.sequence ?? 0)
    ) {
      return { kind: "stale" };
    }
    const updated: RelayChannel = {
      ...result.value,
      services,
      servicesUpdatedAt: now,
      expiresAt,
      ...(codex
        ? {
            sequence: codex.sequence,
            nonce: codex.nonce,
            ciphertext: codex.ciphertext,
            updatedAt: now,
          }
        : {}),
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
    this.pushDevices.delete(channelID);
    for (const [key, event] of this.pushEvents) {
      if (key.startsWith(`${channelID}:`)) this.pushEvents.delete(key);
    }
    return { kind: "ok", value: null };
  }

  async registerPushDevice(
    channelID: string,
    readerTokenHash: string,
    device: PushDevice,
    now: number,
  ): Promise<StoreResult<null>> {
    const result = this.authorized(channelID, readerTokenHash, "reader", now);
    if (result.kind !== "ok") return result;
    this.pushDevices.set(channelID, device);
    return { kind: "ok", value: null };
  }

  async unregisterPushDevice(
    channelID: string,
    readerTokenHash: string,
    now: number,
  ): Promise<StoreResult<null>> {
    const result = this.authorized(channelID, readerTokenHash, "reader", now);
    if (result.kind !== "ok") return result;
    this.pushDevices.delete(channelID);
    return { kind: "ok", value: null };
  }

  async unregisterInvalidPushDevice(
    channelID: string,
    publisherTokenHash: string,
    deviceID: string,
    now: number,
  ): Promise<StoreResult<null>> {
    const result = this.authorized(
      channelID,
      publisherTokenHash,
      "publisher",
      now,
    );
    if (result.kind !== "ok") return result;
    if (this.pushDevices.get(channelID)?.deviceID === deviceID) {
      this.pushDevices.delete(channelID);
    }
    return { kind: "ok", value: null };
  }

  async readPushDevice(
    channelID: string,
    publisherTokenHash: string,
    now: number,
  ): Promise<StoreResult<PushDevice | null>> {
    const result = this.authorized(
      channelID,
      publisherTokenHash,
      "publisher",
      now,
    );
    return result.kind === "ok"
      ? { kind: "ok", value: this.pushDevices.get(channelID) ?? null }
      : result;
  }

  async claimPushEvent(
    channelID: string,
    publisherTokenHash: string,
    eventID: string,
    now: number,
    expiresAt: number,
  ): Promise<StoreResult<PushEventClaim>> {
    const result = this.authorized(
      channelID,
      publisherTokenHash,
      "publisher",
      now,
    );
    if (result.kind !== "ok") return result;
    const key = `${channelID}:${eventID}`;
    const existing = this.pushEvents.get(key);
    if (existing?.status === "sent") return { kind: "ok", value: "sent" };
    if (existing && existing.lockedUntil > now)
      return { kind: "ok", value: "busy" };
    this.pushEvents.set(key, {
      status: "sending",
      lockedUntil: now + 60,
      expiresAt,
    });
    return { kind: "ok", value: "claimed" };
  }

  async completePushEvent(
    channelID: string,
    publisherTokenHash: string,
    eventID: string,
    now: number,
  ): Promise<StoreResult<null>> {
    const result = this.authorized(
      channelID,
      publisherTokenHash,
      "publisher",
      now,
    );
    if (result.kind !== "ok") return result;
    const event = this.pushEvents.get(`${channelID}:${eventID}`);
    if (event)
      this.pushEvents.set(`${channelID}:${eventID}`, {
        ...event,
        status: "sent",
        lockedUntil: 0,
      });
    return { kind: "ok", value: null };
  }

  async releasePushEvent(
    channelID: string,
    publisherTokenHash: string,
    eventID: string,
    now: number,
  ): Promise<StoreResult<null>> {
    const result = this.authorized(
      channelID,
      publisherTokenHash,
      "publisher",
      now,
    );
    if (result.kind !== "ok") return result;
    this.pushEvents.delete(`${channelID}:${eventID}`);
    return { kind: "ok", value: null };
  }

  async purgeExpired(now: number): Promise<number> {
    let count = 0;
    for (const [id, channel] of this.channels) {
      if (channel.expiresAt < now) {
        this.channels.delete(id);
        this.pushDevices.delete(id);
        for (const [key, event] of this.pushEvents) {
          if (key.startsWith(`${id}:`)) this.pushEvents.delete(key);
        }
        count += 1;
      }
    }
    for (const [key, event] of this.pushEvents) {
      if (event.expiresAt < now) this.pushEvents.delete(key);
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
