import { describe, expect, it } from "vitest";

import { createRelayApp } from "../src/app";
import type { RateLimitBinding } from "../src/types";
import { MemoryRelayStore } from "./memory-store";

const NOW = 1_900_000_000;
const CHANNEL_ID = "018f47a0-7b52-4c15-9e55-5f0f266b7440";
const allow: RateLimitBinding = { limit: async () => ({ success: true }) };

function makeApp(store = new MemoryRelayStore(), limiter = allow) {
  let fill = 0;
  return {
    store,
    app: createRelayApp({
      store,
      createRateLimiter: limiter,
      channelRateLimiter: limiter,
      now: () => NOW,
      randomUUID: () => CHANNEL_ID,
      randomBytes: (length) => {
        const bytes = new Uint8Array(length);
        bytes.fill(fill);
        fill += 1;
        return bytes;
      },
    }),
  };
}

describe("Statusline universal relay", () => {
  it("creates independent publisher and reader credentials", async () => {
    const { app, store } = makeApp();
    const response = await app(
      new Request("https://relay.test/v1/channels", { method: "POST" }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(201);
    expect(body.channelId).toBe(CHANNEL_ID);
    expect(body.publisherToken).not.toBe(body.pairingToken);
    expect(String(body.publisherToken)).toHaveLength(43);
    expect(store.channels.get(CHANNEL_ID)?.publisherTokenHash).not.toBe(
      body.publisherToken,
    );
    expect(store.channels.get(CHANNEL_ID)?.pairingTokenHash).not.toBe(
      body.pairingToken,
    );
    expect(store.channels.get(CHANNEL_ID)?.readerTokenHash).toBeNull();
  });

  it("claims, publishes and reads only with the correct role", async () => {
    const { app } = makeApp();
    const created = await app(
      new Request("https://relay.test/v1/channels", { method: "POST" }),
    );
    const credentials = (await created.json()) as {
      publisherToken: string;
      pairingToken: string;
    };
    const publisherHeaders = {
      Authorization: `Bearer ${credentials.publisherToken}`,
      "Content-Type": "application/json",
    };

    const claim = await app(
      new Request(`https://relay.test/v1/channels/${CHANNEL_ID}/claim`, {
        method: "POST",
        headers: { Authorization: `Bearer ${credentials.pairingToken}` },
      }),
    );
    const claimed = (await claim.json()) as { readerToken: string };
    expect(claim.status).toBe(201);
    expect(claimed.readerToken).not.toBe(credentials.pairingToken);
    const readerHeaders = { Authorization: `Bearer ${claimed.readerToken}` };
    const repeatedClaim = await app(
      new Request(`https://relay.test/v1/channels/${CHANNEL_ID}/claim`, {
        method: "POST",
        headers: { Authorization: `Bearer ${credentials.pairingToken}` },
      }),
    );
    expect(repeatedClaim.status).toBe(404);

    const envelope = {
      protocolVersion: 1,
      sequence: 42,
      nonce: "AAAAAAAAAAAAAAAA",
      ciphertext: "AQEBAQEBAQEBAQEBAQEBAQEBAQE",
    };
    expect(
      (
        await app(
          new Request(`https://relay.test/v1/channels/${CHANNEL_ID}/snapshot`, {
            method: "PUT",
            headers: publisherHeaders,
            body: JSON.stringify(envelope),
          }),
        )
      ).status,
    ).toBe(201);

    const read = await app(
      new Request(`https://relay.test/v1/channels/${CHANNEL_ID}/snapshot`, {
        headers: readerHeaders,
      }),
    );
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual(envelope);

    const wrongRole = await app(
      new Request(`https://relay.test/v1/channels/${CHANNEL_ID}/snapshot`, {
        headers: { Authorization: `Bearer ${credentials.publisherToken}` },
      }),
    );
    expect(wrongRole.status).toBe(404);
  });

  it("rejects replayed snapshot sequences", async () => {
    const { app } = makeApp();
    const created = await app(
      new Request("https://relay.test/v1/channels", { method: "POST" }),
    );
    const { publisherToken } = (await created.json()) as {
      publisherToken: string;
    };
    const request = () =>
      new Request(`https://relay.test/v1/channels/${CHANNEL_ID}/snapshot`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${publisherToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          protocolVersion: 1,
          sequence: 7,
          nonce: "AAAAAAAAAAAAAAAA",
          ciphertext: "AQEBAQEBAQEBAQEBAQEBAQEBAQE",
        }),
      });

    expect((await app(request())).status).toBe(201);
    expect((await app(request())).status).toBe(409);
  });

  it("expires and isolates the short-lived pairing credential", async () => {
    let currentTime = NOW;
    const store = new MemoryRelayStore();
    let fill = 0;
    const app = createRelayApp({
      store,
      createRateLimiter: allow,
      channelRateLimiter: allow,
      now: () => currentTime,
      randomUUID: () => CHANNEL_ID,
      randomBytes: (length) => {
        const bytes = new Uint8Array(length);
        bytes.fill(fill);
        fill += 1;
        return bytes;
      },
    });
    const created = await app(
      new Request("https://relay.test/v1/channels", { method: "POST" }),
    );
    const { pairingToken } = (await created.json()) as { pairingToken: string };
    currentTime += 601;

    const claim = await app(
      new Request(`https://relay.test/v1/channels/${CHANNEL_ID}/claim`, {
        method: "POST",
        headers: { Authorization: `Bearer ${pairingToken}` },
      }),
    );
    const directRead = await app(
      new Request(`https://relay.test/v1/channels/${CHANNEL_ID}/snapshot`, {
        headers: { Authorization: `Bearer ${pairingToken}` },
      }),
    );

    expect(claim.status).toBe(410);
    expect(directRead.status).toBe(404);
  });

  it("returns retry guidance when a public limit is exceeded", async () => {
    const denied: RateLimitBinding = {
      limit: async () => ({ success: false }),
    };
    const { app } = makeApp(new MemoryRelayStore(), denied);
    const response = await app(
      new Request("https://relay.test/v1/channels", { method: "POST" }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });
});
