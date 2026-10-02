import { describe, expect, it } from "vitest";
import { createRelayApp } from "../src/app";
import { parsePushDeviceRegistration, parseQuotaAlert } from "../src/protocol";
import { quotaAlertContent } from "../src/push";
import type { PushGateway, QuotaAlert } from "../src/types";
import { MemoryRelayStore } from "./memory-store";

const NOW = 1_900_000_000;
const CHANNEL = "018f47a0-7b52-4c15-9e55-5f0f266b7440";
const EVENT = "65ca6543-7652-4bde-a4cf-01c5c0766f8b";
const DEVICE = "f9e8cfd0-4ec4-4a57-8f9a-00a3f0670d50";
const registration = {
  deviceId: DEVICE,
  fid: "firebase-installation-id-0123456789",
  language: "en",
};
const alert = {
  eventId: EVENT,
  provider: "codex",
  kind: "weeklyExpiring",
  window: "weekly",
  expiresAt: NOW + 3600,
};

async function fixture(
  options: { fail?: boolean; invalid?: boolean; limited?: boolean } = {},
) {
  const delivered: QuotaAlert[] = [];
  const credits: string[] = [];
  const store = new MemoryRelayStore();
  const gateway: PushGateway = {
    async isReady() {
      return true;
    },
    async encryptInstallationID() {
      return { nonce: "fixture", ciphertext: "encrypted-fixture" };
    },
    async sendResetAdded(device) {
      credits.push(device.deviceID);
      return "sent";
    },
    async sendQuotaAlert(_device, event) {
      if (options.fail) throw new Error("Fixture transport failure");
      delivered.push(event);
      return options.invalid ? "invalidToken" : "sent";
    },
  };
  let fill = 0;
  const app = createRelayApp({
    store,
    pushGateway: gateway,
    clientRateLimiter: { limit: async () => ({ success: true }) },
    channelRateLimiter: { limit: async () => ({ success: true }) },
    createRateLimiter: { limit: async () => ({ success: true }) },
    pushEventRateLimiter: {
      limit: async () => ({ success: !options.limited }),
    },
    now: () => NOW,
    randomUUID: () => CHANNEL,
    randomBytes: (length) => new Uint8Array(length).fill(++fill),
  });
  const created = await app(
    new Request("https://relay.test/v1/channels", { method: "POST" }),
  );
  const { publisherToken, pairingToken } = (await created.json()) as {
    publisherToken: string;
    pairingToken: string;
  };
  const response = await app(
    new Request(`https://relay.test/v1/channels/${CHANNEL}/claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${pairingToken}` },
    }),
  );
  const { readerToken } = (await response.json()) as { readerToken: string };
  const request = (
    route: string,
    method: string,
    body: unknown,
    token = publisherToken,
  ) =>
    app(
      new Request(`https://relay.test/v1/channels/${CHANNEL}/${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
  return {
    app,
    store,
    delivered,
    credits,
    readerToken,
    publisherToken,
    request,
    register: (preferences = {}) =>
      request(
        "push-device",
        "PUT",
        { ...registration, ...preferences },
        readerToken,
      ),
    send: (body: unknown = alert, token = publisherToken) =>
      request("quota-alert-events", "POST", body, token),
  };
}

describe("Quota alert contract", () => {
  it("keeps legacy registration in the original scope and validates booleans", () => {
    expect(parsePushDeviceRegistration(registration)).toMatchObject({
      resetCredits: true,
      quotaAlerts: false,
    });
    expect(() =>
      parsePushDeviceRegistration({ ...registration, quotaAlerts: "true" }),
    ).toThrow();
    expect(() =>
      parsePushDeviceRegistration({ ...registration, resetCredits: 0 }),
    ).toThrow();
  });
  it.each([
    { provider: "unknown" },
    { kind: "unknown" },
    { window: "short" },
    { expiresAt: NOW },
    { expiresAt: NOW + 3601 },
    { expiresAt: 1.5 },
    { eventId: "vendor-account-id" },
  ])("rejects invalid/expired input: %j", (change) => {
    expect(() => parseQuotaAlert({ ...alert, ...change }, NOW)).toThrow();
  });
  it.each(["codex", "antigravity", "claude"])(
    "allowlists %s and both genuine window recoveries",
    (provider) => {
      for (const window of ["short", "weekly"]) {
        expect(
          parseQuotaAlert(
            { ...alert, provider, kind: "quotaRecovered", window },
            NOW,
          ),
        ).toMatchObject({ provider, window });
      }
    },
  );
  it("never sends new alerts to a legacy subscriber", async () => {
    const f = await fixture();
    expect((await f.register()).status).toBe(204);
    expect((await f.send()).status).toBe(204);
    expect(f.delivered).toEqual([]);
    expect(
      (
        await f.request("reset-credit-events", "POST", {
          eventId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(204);
    expect(f.credits).toHaveLength(1);
  });
  it("negotiates, enforces roles, deduplicates and keeps category opt-out independent", async () => {
    const f = await fixture();
    const health = (await (
      await f.app(new Request("https://relay.test/health"))
    ).json()) as { capabilities: string[] };
    expect(health.capabilities).toContain("quota-alerts-v1");
    expect(
      (await f.register({ quotaAlerts: true, resetCredits: false })).status,
    ).toBe(204);
    expect((await f.send(alert, f.readerToken)).status).toBe(404);
    expect((await f.send()).status).toBe(204);
    expect((await f.send()).status).toBe(204);
    expect(f.delivered).toHaveLength(1);
    expect(
      (
        await f.request("reset-credit-events", "POST", {
          eventId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(204);
    expect(f.credits).toHaveLength(0);
    expect(
      (await f.register({ quotaAlerts: false, resetCredits: true })).status,
    ).toBe(204);
    expect(
      (await f.send({ ...alert, eventId: crypto.randomUUID() })).status,
    ).toBe(204);
    expect(f.delivered).toHaveLength(1);
  });
  it("releases retryable events and never acknowledges an in-flight send", async () => {
    const f = await fixture({ fail: true });
    await f.register({ quotaAlerts: true });
    expect((await f.send()).status).toBe(503);
    expect(f.store.pushEvents.get(`${CHANNEL}:${EVENT}`)?.status).not.toBe(
      "sending",
    );
    expect((await f.send()).status).toBe(503);
    f.store.pushEvents.set(`${CHANNEL}:${EVENT}`, {
      status: "sending",
      lockedUntil: NOW + 60,
      expiresAt: NOW + 3600,
    });
    expect((await f.send()).status).toBe(503);
  });
  it("uses the existing bounded event limiter and removes invalid registrations", async () => {
    const limited = await fixture({ limited: true });
    await limited.register({ quotaAlerts: true });
    expect((await limited.send()).status).toBe(429);
    expect(limited.delivered).toEqual([]);
    const invalid = await fixture({ invalid: true });
    await invalid.register({ quotaAlerts: true });
    expect((await invalid.send()).status).toBe(204);
    expect(invalid.store.pushDevices.size).toBe(0);
  });
  it("rejects expired alerts without allocating a dedup row", async () => {
    const f = await fixture();
    expect((await f.send({ ...alert, expiresAt: NOW })).status).toBe(400);
    expect(f.store.pushEvents.size).toBe(0);
  });
  it.each(["en", "es"] as const)(
    "localizes all services in %s without account identifiers",
    (language) => {
      for (const provider of ["codex", "antigravity", "claude"] as const) {
        for (const kind of ["weeklyExpiring", "quotaRecovered"] as const) {
          const content = quotaAlertContent(language, {
            eventID: EVENT,
            provider,
            kind,
            window: "weekly",
            expiresAt: NOW + 3600,
          });
          expect(content.title).toContain(
            {
              codex: "Codex",
              antigravity: "Antigravity",
              claude: "Claude Code",
            }[provider],
          );
          expect(content.body).not.toContain(EVENT);
        }
      }
    },
  );
});
