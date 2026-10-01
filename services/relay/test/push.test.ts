import { beforeAll, describe, expect, it } from "vitest";

import { createFcmPushGateway } from "../src/push";
import type { PushDevice } from "../src/types";

const PROJECT_ID = "statusline-12345";
const FID = "firebase-installation-id-0123456789";
const NOW = 1_900_000_000;

let serviceAccountJSON: string;
let encryptionKey: string;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2_048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const privateKey = encodeBase64(new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey)));
  serviceAccountJSON = JSON.stringify({
    project_id: PROJECT_ID,
    client_email: "statusline-push@statusline-12345.iam.gserviceaccount.com",
    private_key: `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----\n`,
  });
  encryptionKey = encodeBase64URL(new Uint8Array(32).fill(7));
});

describe("Firebase reset push gateway", () => {
  it("encrypts the FID at rest and sends a privacy-safe alert using the FID target", async () => {
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      const body = typeof init?.body === "string"
        ? JSON.parse(init.body) as Record<string, unknown>
        : undefined;
      requests.push({ url, ...(body ? { body } : {}) });
      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "short-lived-test-access-token", expires_in: 3_600 });
      }
      return Response.json({ name: `projects/${PROJECT_ID}/messages/test-message` });
    };
    const gateway = createFcmPushGateway({
      FCM_SERVICE_ACCOUNT_JSON: serviceAccountJSON,
      PUSH_TOKEN_ENCRYPTION_KEY: encryptionKey,
    }, fetcher, () => NOW);
    expect(gateway).not.toBeNull();
    if (!gateway) throw new Error("Expected a configured FCM gateway.");
    await expect(gateway.isReady()).resolves.toBe(true);

    const encrypted = await gateway.encryptInstallationID(FID);
    expect(`${encrypted.nonce}${encrypted.ciphertext}`).not.toContain(FID);
    const device: PushDevice = {
      deviceID: "f9e8cfd0-4ec4-4a57-8f9a-00a3f0670d50",
      ...encrypted,
      language: "es",
      updatedAt: NOW,
    };

    await expect(gateway.sendResetAdded(device)).resolves.toBe("sent");
    expect(requests).toHaveLength(2);
    expect(requests[1]?.url).toBe(
      `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`,
    );
    const message = requests[1]?.body?.message as Record<string, unknown>;
    expect(message.fid).toBe(FID);
    expect(message).not.toHaveProperty("token");
    expect(message.notification).toEqual({
      title: "Hay un nuevo reset de Codex",
      body: "Abre Statusline para ver la cantidad y su vencimiento.",
    });
    expect(message.android).toMatchObject({
      priority: "high",
      ttl: "3600s",
      notification: { tag: "codex-reset-credit", channel_id: "reset_alerts" },
    });
    expect(message.apns).toMatchObject({
      headers: {
        "apns-priority": "10",
        "apns-push-type": "alert",
        "apns-collapse-id": "codex-reset-credit",
        "apns-expiration": String(NOW + 3_600),
      },
      payload: {
        aps: {
          alert: {
            title: "Hay un nuevo reset de Codex",
            body: "Abre Statusline para ver la cantidad y su vencimiento.",
          },
          sound: "default",
        },
      },
    });
    expect(JSON.stringify(message)).not.toMatch(/resetId|quota|expiry|weekly|percentage/iu);
  });

  it("marks an installation as invalid when FCM reports UNREGISTERED", async () => {
    let fcmAttempt = 0;
    const fetcher: typeof fetch = async (input) => {
      if (String(input) === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "short-lived-test-access-token", expires_in: 3_600 });
      }
      fcmAttempt += 1;
      return Response.json({ error: { status: "UNREGISTERED" } }, { status: 404 });
    };
    const gateway = createFcmPushGateway({
      FCM_SERVICE_ACCOUNT_JSON: serviceAccountJSON,
      PUSH_TOKEN_ENCRYPTION_KEY: encryptionKey,
    }, fetcher, () => NOW);
    if (!gateway) throw new Error("Expected a configured FCM gateway.");
    await expect(gateway.isReady()).resolves.toBe(true);
    const device: PushDevice = {
      deviceID: "f9e8cfd0-4ec4-4a57-8f9a-00a3f0670d50",
      ...await gateway.encryptInstallationID(FID),
      language: "en",
      updatedAt: NOW,
    };

    await expect(gateway.sendResetAdded(device)).resolves.toBe("invalidToken");
    expect(fcmAttempt).toBe(1);
  });

  it("does not report readiness for malformed service-account keys", async () => {
    const gateway = createFcmPushGateway({
      FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({
        project_id: PROJECT_ID,
        client_email: "statusline-push@statusline-12345.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\nYWJj\n-----END PRIVATE KEY-----",
      }),
      PUSH_TOKEN_ENCRYPTION_KEY: encryptionKey,
    });
    expect(gateway).not.toBeNull();
    await expect(gateway?.isReady()).resolves.toBe(false);
  });
});

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function encodeBase64URL(bytes: Uint8Array): string {
  return encodeBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
