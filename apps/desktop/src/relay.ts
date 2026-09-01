export type RelayStatus =
  | Readonly<{ status: "notConfigured" }>
  | Readonly<{ status: "unpaired"; endpoint: string }>
  | Readonly<{ status: "creating"; endpoint: string }>
  | Readonly<{
      status: "pairing";
      endpoint: string;
      pairingUri: string;
      pairingExpiresAt: number;
      lastPublishedAt: number | null;
    }>
  | Readonly<{
      status: "connected";
      endpoint: string;
      lastPublishedAt: number | null;
    }>
  | Readonly<{
      status: "error";
      endpoint: string | null;
      code: string;
      message: string;
      hasPairing: boolean;
    }>;

const CHANNEL_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export class RelayPayloadError extends Error {}

export function parseRelayStatus(input: unknown): RelayStatus {
  const envelope = readRecord(input, "relay status");
  const status = readString(envelope.status, "status");

  switch (status) {
    case "notConfigured":
      return { status };
    case "unpaired":
    case "creating":
      return { status, endpoint: readEndpoint(envelope.endpoint) };
    case "pairing":
      return {
        status,
        endpoint: readEndpoint(envelope.endpoint),
        pairingUri: readPairingURI(envelope.pairingUri),
        pairingExpiresAt: readTimestamp(
          envelope.pairingExpiresAt,
          "pairingExpiresAt",
        ),
        lastPublishedAt: readNullableTimestamp(
          envelope.lastPublishedAt,
          "lastPublishedAt",
        ),
      };
    case "connected":
      return {
        status,
        endpoint: readEndpoint(envelope.endpoint),
        lastPublishedAt: readNullableTimestamp(
          envelope.lastPublishedAt,
          "lastPublishedAt",
        ),
      };
    case "error":
      return {
        status,
        endpoint:
          envelope.endpoint === null ? null : readEndpoint(envelope.endpoint),
        code: readString(envelope.code, "code"),
        message: readString(envelope.message, "message"),
        hasPairing: readBoolean(envelope.hasPairing, "hasPairing"),
      };
    default:
      throw new RelayPayloadError(`Unknown relay status: ${status}`);
  }
}

function readPairingURI(value: unknown): string {
  const raw = readString(value, "pairingUri");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RelayPayloadError("pairingUri must be a valid URL");
  }
  if (
    url.protocol !== "statusline:" ||
    url.hostname !== "pair" ||
    url.searchParams.get("v") !== "1" ||
    !CHANNEL_PATTERN.test(url.searchParams.get("channel") ?? "") ||
    !SECRET_PATTERN.test(url.searchParams.get("pairing") ?? "") ||
    !SECRET_PATTERN.test(url.searchParams.get("key") ?? "") ||
    [...url.searchParams.keys()].length !== 4 ||
    new Set(url.searchParams.keys()).size !== 4
  ) {
    throw new RelayPayloadError("pairingUri does not match protocol v1");
  }
  return raw;
}

function readEndpoint(value: unknown): string {
  const raw = readString(value, "endpoint");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RelayPayloadError("endpoint must be a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new RelayPayloadError("endpoint must use HTTP or HTTPS");
  }
  return raw;
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RelayPayloadError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new RelayPayloadError(`${path} must be a non-empty string`);
  }
  return value;
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new RelayPayloadError(`${path} must be a boolean`);
  }
  return value;
}

function readTimestamp(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new RelayPayloadError(`${path} must be a positive timestamp`);
  }
  return value as number;
}

function readNullableTimestamp(value: unknown, path: string): number | null {
  return value === null ? null : readTimestamp(value, path);
}
