export const PROTOCOL_VERSION = 1;
export const TOKEN_BYTES = 32;
export const NONCE_BYTES = 12;
export const MAX_CIPHERTEXT_BYTES = 4_096;
export const CHANNEL_TTL_SECONDS = 30 * 24 * 60 * 60;
export const PAIRING_TTL_SECONDS = 10 * 60;

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const CHANNEL_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export interface SnapshotEnvelope {
  readonly protocolVersion: 1;
  readonly sequence: number;
  readonly nonce: string;
  readonly ciphertext: string;
}

export class ProtocolError extends Error {}

export function parseChannelID(value: string): string {
  if (!CHANNEL_PATTERN.test(value)) {
    throw new ProtocolError("Invalid channel identifier.");
  }
  return value;
}

export function parseBearerToken(header: string | null): string {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(header ?? "");
  if (match?.[1] === undefined) {
    throw new ProtocolError("A valid bearer token is required.");
  }
  return match[1];
}

export function parseSnapshotEnvelope(value: unknown): SnapshotEnvelope {
  const object = readObject(value);
  if (object.protocolVersion !== PROTOCOL_VERSION) {
    throw new ProtocolError("Unsupported protocol version.");
  }
  if (
    !Number.isSafeInteger(object.sequence) ||
    (object.sequence as number) <= 0
  ) {
    throw new ProtocolError("Sequence must be a positive integer.");
  }
  const nonce = readBase64URL(object.nonce, "nonce", NONCE_BYTES, NONCE_BYTES);
  const ciphertext = readBase64URL(
    object.ciphertext,
    "ciphertext",
    17,
    MAX_CIPHERTEXT_BYTES,
  );
  return {
    protocolVersion: PROTOCOL_VERSION,
    sequence: object.sequence as number,
    nonce,
    ciphertext,
  };
}

export function randomToken(
  randomBytes: (length: number) => Uint8Array,
): string {
  return encodeBase64URL(randomBytes(TOKEN_BYTES));
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return encodeBase64URL(new Uint8Array(digest));
}

export function decodedByteCount(value: string): number {
  if (!BASE64URL_PATTERN.test(value)) {
    throw new ProtocolError("Value is not base64url.");
  }
  const remainder = value.length % 4;
  if (remainder === 1) {
    throw new ProtocolError("Value is not valid base64url.");
  }
  return Math.floor((value.length * 6) / 8);
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProtocolError("JSON body must be an object.");
  }
  return value as Record<string, unknown>;
}

function readBase64URL(
  value: unknown,
  field: string,
  minimumBytes: number,
  maximumBytes: number,
): string {
  if (typeof value !== "string" || !BASE64URL_PATTERN.test(value)) {
    throw new ProtocolError(`${field} must be unpadded base64url.`);
  }
  const count = decodedByteCount(value);
  if (count < minimumBytes || count > maximumBytes) {
    throw new ProtocolError(`${field} has an invalid size.`);
  }
  return value;
}

function encodeBase64URL(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}
