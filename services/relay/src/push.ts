import type { Env, EncryptedPushToken, PushDevice, PushGateway } from "./types";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FID_AAD = "statusline.push-fid.v1";
const FCM_TOKEN_LIFETIME_SECONDS = 3_300;

interface ServiceAccount {
  readonly project_id: string;
  readonly client_email: string;
  readonly private_key: string;
  readonly token_uri?: string;
}

export function createFcmPushGateway(
  env: Pick<Env, "FCM_SERVICE_ACCOUNT_JSON" | "PUSH_TOKEN_ENCRYPTION_KEY">,
  fetcher: typeof fetch = fetch,
  now: () => number = () => Math.floor(Date.now() / 1_000),
): PushGateway | null {
  const encodedEncryptionKey = env.PUSH_TOKEN_ENCRYPTION_KEY;
  const credentialsJSON = env.FCM_SERVICE_ACCOUNT_JSON;
  if (!encodedEncryptionKey || !credentialsJSON) return null;

  let encryptionKey: Promise<CryptoKey> | null = null;
  let signingKey: Promise<CryptoKey> | null = null;
  let cachedAccessToken: {
    readonly value: string;
    readonly expiresAt: number;
  } | null = null;
  let cachedAccount: ServiceAccount | null = null;
  let readiness: Promise<boolean> | null = null;

  const account = (): ServiceAccount => {
    if (cachedAccount) return cachedAccount;
    try {
      const parsed = JSON.parse(credentialsJSON) as Partial<ServiceAccount>;
      if (
        typeof parsed.project_id !== "string" ||
        !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(parsed.project_id) ||
        typeof parsed.client_email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/u.test(
          parsed.client_email,
        ) ||
        typeof parsed.private_key !== "string" ||
        !parsed.private_key.includes("BEGIN PRIVATE KEY") ||
        (parsed.token_uri !== undefined && parsed.token_uri !== OAUTH_TOKEN_URL)
      ) {
        throw new Error("invalid service account");
      }
      cachedAccount = parsed as ServiceAccount;
      return cachedAccount;
    } catch {
      throw new Error("Push provider configuration is invalid.");
    }
  };

  const getEncryptionKey = (): Promise<CryptoKey> => {
    if (!encryptionKey) {
      encryptionKey = (async () => {
        const raw = decodeBase64URL(encodedEncryptionKey);
        if (raw.byteLength !== 32)
          throw new Error("Push encryption key is invalid.");
        return crypto.subtle.importKey(
          "raw",
          toArrayBuffer(raw),
          "AES-GCM",
          false,
          ["encrypt", "decrypt"],
        );
      })();
    }
    return encryptionKey;
  };

  const getSigningKey = (): Promise<CryptoKey> => {
    if (!signingKey) {
      signingKey = (async () => {
        const pem = account()
          .private_key.replace("-----BEGIN PRIVATE KEY-----", "")
          .replace("-----END PRIVATE KEY-----", "")
          .replace(/\s+/gu, "");
        return crypto.subtle.importKey(
          "pkcs8",
          toArrayBuffer(decodeBase64(pem)),
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          false,
          ["sign"],
        );
      })();
    }
    return signingKey;
  };

  const accessToken = async (): Promise<string> => {
    const timestamp = now();
    if (cachedAccessToken && cachedAccessToken.expiresAt > timestamp + 60) {
      return cachedAccessToken.value;
    }
    const serviceAccount = account();
    const header = encodeJSON({ alg: "RS256", typ: "JWT" });
    const claims = encodeJSON({
      iss: serviceAccount.client_email,
      scope: FCM_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: timestamp,
      exp: timestamp + FCM_TOKEN_LIFETIME_SECONDS,
    });
    const unsigned = `${header}.${claims}`;
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      await getSigningKey(),
      toArrayBuffer(new TextEncoder().encode(unsigned)),
    );
    const assertion = `${unsigned}.${encodeBytes(new Uint8Array(signature))}`;
    const response = await fetcher(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!response.ok) throw new Error("Push provider authorization failed.");
    const tokenResponse = (await response.json()) as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    if (
      typeof tokenResponse.access_token !== "string" ||
      typeof tokenResponse.expires_in !== "number" ||
      tokenResponse.expires_in <= 0
    ) {
      throw new Error(
        "Push provider returned an invalid authorization response.",
      );
    }
    cachedAccessToken = {
      value: tokenResponse.access_token,
      expiresAt: timestamp + tokenResponse.expires_in,
    };
    return tokenResponse.access_token;
  };

  return {
    isReady(): Promise<boolean> {
      if (!readiness) {
        readiness = (async () => {
          try {
            account();
            await Promise.all([getEncryptionKey(), getSigningKey()]);
            return true;
          } catch {
            return false;
          }
        })();
      }
      return readiness;
    },

    async encryptInstallationID(fid: string): Promise<EncryptedPushToken> {
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: toArrayBuffer(nonce),
          additionalData: toArrayBuffer(new TextEncoder().encode(FID_AAD)),
        },
        await getEncryptionKey(),
        toArrayBuffer(new TextEncoder().encode(fid)),
      );
      return {
        nonce: encodeBytes(nonce),
        ciphertext: encodeBytes(new Uint8Array(ciphertext)),
      };
    },

    async sendResetAdded(device: PushDevice): Promise<"sent" | "invalidToken"> {
      let fid: string;
      try {
        const plaintext = await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: toArrayBuffer(decodeBase64URL(device.nonce)),
            additionalData: toArrayBuffer(new TextEncoder().encode(FID_AAD)),
          },
          await getEncryptionKey(),
          toArrayBuffer(decodeBase64URL(device.ciphertext)),
        );
        fid = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
      } catch {
        throw new Error("Stored push registration could not be decrypted.");
      }

      const content =
        device.language === "es"
          ? {
              title: "Hay un nuevo reset de Codex",
              body: "Abre Statusline para ver la cantidad y su vencimiento.",
            }
          : {
              title: "A Codex reset is available",
              body: "Open Statusline to see your reset count and expiry.",
            };
      const response = await fetcher(
        `https://fcm.googleapis.com/v1/projects/${account().project_id}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await accessToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              fid,
              notification: content,
              android: {
                priority: "high",
                ttl: "3600s",
                notification: {
                  tag: "codex-reset-credit",
                  channel_id: "reset_alerts",
                },
              },
              apns: {
                headers: {
                  "apns-priority": "10",
                  "apns-push-type": "alert",
                  "apns-collapse-id": "codex-reset-credit",
                  "apns-expiration": String(now() + 3_600),
                },
                payload: {
                  aps: {
                    alert: content,
                    sound: "default",
                  },
                },
              },
            },
          }),
        },
      );
      if (response.ok) return "sent";
      const error = (await response
        .json()
        .catch(() => null)) as FCMErrorEnvelope | null;
      if (response.status === 404 && isUnregistered(error))
        return "invalidToken";
      throw new Error(
        "Push provider could not deliver the reset notification.",
      );
    },
  };
}

interface FCMErrorEnvelope {
  readonly error?: {
    readonly status?: string;
    readonly details?: readonly { readonly errorCode?: string }[];
  };
}

function isUnregistered(response: FCMErrorEnvelope | null): boolean {
  return (
    response?.error?.status === "UNREGISTERED" ||
    (response?.error?.details?.some(
      (detail) => detail.errorCode === "UNREGISTERED",
    ) ??
      false)
  );
}

function encodeJSON(value: unknown): string {
  return encodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function encodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function decodeBase64URL(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) {
    throw new Error("Invalid base64url value.");
  }
  return decodeBase64(value.replaceAll("-", "+").replaceAll("_", "/"));
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const binary = atob(
    normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="),
  );
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
