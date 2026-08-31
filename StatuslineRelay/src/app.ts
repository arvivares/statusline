import {
  CHANNEL_TTL_SECONDS,
  PAIRING_TTL_SECONDS,
  PROTOCOL_VERSION,
  ProtocolError,
  hashToken,
  parseBearerToken,
  parseChannelID,
  parseSnapshotEnvelope,
  randomToken,
  type SnapshotEnvelope,
} from "./protocol";
import { publicPageResponse } from "./public-pages";
import type { RelayChannel, RelayStore, StoreResult } from "./store";
import type { RateLimitBinding } from "./types";

const MAX_REQUEST_BYTES = 8_192;

export interface RelayAppDependencies {
  readonly store: RelayStore;
  readonly clientRateLimiter: RateLimitBinding;
  readonly createRateLimiter: RateLimitBinding;
  readonly channelRateLimiter: RateLimitBinding;
  readonly now?: () => number;
  readonly randomBytes?: (length: number) => Uint8Array;
  readonly randomUUID?: () => string;
}

export function createRelayApp(dependencies: RelayAppDependencies) {
  const now = dependencies.now ?? (() => Math.floor(Date.now() / 1_000));
  const randomBytes = dependencies.randomBytes ?? secureRandomBytes;
  const randomUUID = dependencies.randomUUID ?? (() => crypto.randomUUID());

  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const publicPage = publicPageResponse(url.pathname, request.method);
      if (publicPage !== null) {
        return publicPage;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/health"
      ) {
        return json({ status: "ok", protocolVersion: PROTOCOL_VERSION });
      }

      const segments = url.pathname.split("/").filter(Boolean);
      if (segments[0] !== "v1" || segments[1] !== "channels") {
        return apiError(404, "notFound", "Endpoint not found.");
      }

      const clientKey = await anonymousClientKey(request);
      if (
        !(
          await dependencies.clientRateLimiter.limit({
            key: `client:${clientKey}`,
          })
        ).success
      ) {
        return rateLimited();
      }

      if (segments.length === 2 && request.method === "POST") {
        if (
          !(
            await dependencies.createRateLimiter.limit({
              key: `create:${clientKey}`,
            })
          ).success
        ) {
          return rateLimited();
        }
        return createChannel(
          dependencies.store,
          now(),
          randomBytes,
          randomUUID,
        );
      }

      const rawChannelID = segments[2];
      if (rawChannelID === undefined) {
        return apiError(404, "notFound", "Endpoint not found.");
      }
      const channelID = parseChannelID(rawChannelID);
      const token = parseBearerToken(request.headers.get("authorization"));
      const tokenHash = await hashToken(token);
      const route = segments[3] ?? "metadata";
      if (
        !(
          await dependencies.channelRateLimiter.limit({
            key: `${route}:${tokenHash}`,
          })
        ).success
      ) {
        return rateLimited();
      }

      if (segments.length === 3 && request.method === "GET") {
        return metadata(
          await dependencies.store.metadata(channelID, tokenHash, now()),
        );
      }
      if (segments.length === 3 && request.method === "DELETE") {
        return emptyResult(
          await dependencies.store.delete(channelID, tokenHash, now()),
        );
      }
      if (
        segments.length === 4 &&
        segments[3] === "claim" &&
        request.method === "POST"
      ) {
        return claimChannel(
          dependencies.store,
          channelID,
          tokenHash,
          now(),
          randomBytes,
        );
      }
      if (
        segments.length === 4 &&
        segments[3] === "snapshot" &&
        request.method === "PUT"
      ) {
        const envelope = parseSnapshotEnvelope(await readJSON(request));
        const timestamp = now();
        return emptyResult(
          await dependencies.store.writeSnapshot(
            channelID,
            tokenHash,
            envelope,
            timestamp,
            timestamp + CHANNEL_TTL_SECONDS,
          ),
          true,
        );
      }
      if (
        segments.length === 4 &&
        segments[3] === "snapshot" &&
        request.method === "GET"
      ) {
        return snapshot(
          await dependencies.store.readSnapshot(channelID, tokenHash, now()),
        );
      }
      return apiError(404, "notFound", "Endpoint not found.");
    } catch (error: unknown) {
      if (error instanceof ProtocolError || error instanceof SyntaxError) {
        return apiError(400, "invalidRequest", error.message);
      }
      console.error(
        "relay_request_failed",
        error instanceof Error ? error.message : "unknown",
      );
      return apiError(
        500,
        "internalError",
        "The relay could not complete this request.",
      );
    }
  };
}

async function createChannel(
  store: RelayStore,
  now: number,
  randomBytes: (length: number) => Uint8Array,
  randomUUID: () => string,
): Promise<Response> {
  const publisherToken = randomToken(randomBytes);
  const pairingToken = randomToken(randomBytes);
  const channelID = parseChannelID(randomUUID());
  const channel: RelayChannel = {
    id: channelID,
    publisherTokenHash: await hashToken(publisherToken),
    pairingTokenHash: await hashToken(pairingToken),
    readerTokenHash: null,
    protocolVersion: PROTOCOL_VERSION,
    pairingExpiresAt: now + PAIRING_TTL_SECONDS,
    readerClaimedAt: null,
    sequence: null,
    nonce: null,
    ciphertext: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + CHANNEL_TTL_SECONDS,
  };
  await store.create(channel);
  return json(
    {
      protocolVersion: PROTOCOL_VERSION,
      channelId: channelID,
      publisherToken,
      pairingToken,
      pairingExpiresAt: channel.pairingExpiresAt,
      expiresAt: channel.expiresAt,
    },
    201,
  );
}

async function claimChannel(
  store: RelayStore,
  channelID: string,
  pairingTokenHash: string,
  now: number,
  randomBytes: (length: number) => Uint8Array,
): Promise<Response> {
  const readerToken = randomToken(randomBytes);
  const result = await store.claim(
    channelID,
    pairingTokenHash,
    await hashToken(readerToken),
    now,
  );
  if (result.kind !== "ok") {
    return storeError(result);
  }
  return json(
    {
      protocolVersion: PROTOCOL_VERSION,
      readerToken,
      expiresAt: result.value.expiresAt,
    },
    201,
  );
}

function metadata(result: StoreResult<RelayChannel>): Response {
  if (result.kind !== "ok") {
    return storeError(result);
  }
  return json({
    protocolVersion: result.value.protocolVersion,
    readerClaimedAt: result.value.readerClaimedAt,
    pairingExpiresAt: result.value.pairingExpiresAt,
    lastPublishedAt:
      result.value.sequence === null ? null : result.value.updatedAt,
    expiresAt: result.value.expiresAt,
  });
}

function snapshot(result: StoreResult<RelayChannel>): Response {
  if (result.kind !== "ok") {
    return storeError(result);
  }
  const channel = result.value;
  if (
    channel.sequence === null ||
    channel.nonce === null ||
    channel.ciphertext === null
  ) {
    return apiError(
      404,
      "snapshotNotFound",
      "No snapshot has been published yet.",
    );
  }
  const envelope: SnapshotEnvelope = {
    protocolVersion: PROTOCOL_VERSION,
    sequence: channel.sequence,
    nonce: channel.nonce,
    ciphertext: channel.ciphertext,
  };
  return json(envelope);
}

function emptyResult(result: StoreResult<unknown>, created = false): Response {
  if (result.kind !== "ok") {
    return storeError(result);
  }
  return new Response(null, {
    status: created ? 201 : 204,
    headers: responseHeaders(),
  });
}

function storeError(
  result: Exclude<StoreResult<unknown>, { kind: "ok" }>,
): Response {
  switch (result.kind) {
    case "missing":
      return apiError(404, "channelNotFound", "Channel not found.");
    case "expired":
      return apiError(410, "channelExpired", "Channel expired.");
    case "pairingExpired":
      return apiError(410, "pairingExpired", "Pairing code expired.");
    case "stale":
      return apiError(409, "staleSnapshot", "A newer snapshot already exists.");
  }
}

async function readJSON(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";", 1)[0] !== "application/json"
  ) {
    throw new ProtocolError("Content-Type must be application/json.");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    throw new ProtocolError("Request body is too large.");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    throw new ProtocolError("Request body is too large.");
  }
  return JSON.parse(text) as unknown;
}

function secureRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function anonymousClientKey(request: Request): Promise<string> {
  const header = request.headers.get("cf-connecting-ip")?.trim();
  const source =
    header !== undefined && header.length > 0 && header.length <= 64
      ? header.toLowerCase()
      : "unknown-client";
  return hashToken(source);
}

function rateLimited(): Response {
  const response = apiError(
    429,
    "rateLimited",
    "Too many requests. Try again shortly.",
  );
  response.headers.set("Retry-After", "60");
  return response;
}

function apiError(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

function json(value: unknown, status = 200): Response {
  const headers = responseHeaders();
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { status, headers });
}

function responseHeaders(): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
}
