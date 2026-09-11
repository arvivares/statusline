import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildUpdaterVerifier,
  verificationEnvironment,
} from "./build-updater-verifier.mjs";

export const updaterTargets = new Map([
  ["darwin-aarch64", "macos-updater"],
  ["darwin-x86_64", "macos-updater"],
  ["windows-x86_64-nsis", "windows-nsis"],
  ["windows-x86_64-msi", "windows-msi"],
  ["linux-x86_64-appimage", "linux-appimage"],
]);
export const updaterKinds = new Set(updaterTargets.values());

function requireValue(condition, message) {
  if (!condition) throw new Error(`Updater validation failed: ${message}`);
}

function requireEnvelope(value, description) {
  requireValue(
    typeof value === "string" &&
      value.length > 0 &&
      value.length <= 16384 &&
      !/[\r\n]/u.test(value),
    `invalid ${description}`,
  );
}

function runVerifier(args, input) {
  const result = spawnSync(buildUpdaterVerifier(), args, {
    input,
    env: verificationEnvironment(),
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 65536,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      result.stderr?.trim() ||
        "Updater validation failed: verifier could not complete",
    );
}

// Only the Tauri base64 transport is passed here. Minisign parsing, hashing,
// key-ID checks and both signatures belong to pinned minisign-verify in Rust.
export function parseUpdaterPublicKey(value) {
  requireEnvelope(value, "public key");
  runVerifier(["public-key"], `${value}\n`);
}

export async function configuredUpdaterPublicKey() {
  const config = JSON.parse(
    await readFile(
      new URL("../src-tauri/tauri.conf.json", import.meta.url),
      "utf8",
    ),
  );
  const key = config.plugins?.updater?.pubkey;
  parseUpdaterPublicKey(key);
  return key;
}

export async function verifyUpdaterSignature(path, signatureText, publicKey) {
  requireEnvelope(publicKey, "public key");
  requireValue(typeof signatureText === "string", "invalid signature");
  const signature = signatureText.trim();
  requireEnvelope(signature, "signature");
  runVerifier(["verify", resolve(path)], `${publicKey}\n${signature}\n`);
  return signature;
}

export function createUpdaterManifest(metadata, records, signatures) {
  requireValue(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(metadata.version),
    "version must be exact X.Y.Z",
  );
  requireValue(metadata.tag === `v${metadata.version}`, "tag/version mismatch");
  requireValue(
    metadata.channel === "beta" &&
      metadata.distribution?.publishPrerelease === true,
    "updater requires the beta prerelease policy",
  );
  const platforms = {};
  for (const [target, kind] of updaterTargets) {
    const matches = records.filter((record) => record.kind === kind);
    requireValue(
      matches.length === 1,
      `expected exactly one ${kind} for ${target}`,
    );
    const asset = matches[0];
    const signature = signatures.get(asset.name);
    requireValue(
      typeof signature === "string" && signature.length > 0,
      `missing verified signature for ${asset.name}`,
    );
    platforms[target] = {
      url: `https://github.com/arvivares/statusline/releases/download/${metadata.tag}/${asset.name}`,
      signature,
    };
  }
  // No wall-clock date: recovery must regenerate identical manifest bytes.
  return { version: metadata.version, channel: metadata.channel, platforms };
}
