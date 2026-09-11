import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verificationEnvironment } from "./build-updater-verifier.mjs";

const cli = fileURLToPath(
  new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url),
);
function signer(args, env) {
  const result = spawnSync(process.execPath, [cli, "signer", ...args], {
    env,
    encoding: "utf8",
    timeout: 30000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // The CLI prints generated private keys. Never forward captured output.
  if (result.error || result.status !== 0)
    throw new Error("Test-only Tauri signer failed (output withheld)");
}

// Ephemeral keys and signatures come from the official CLI, not custom crypto.
export function updaterTestKey() {
  const directory = mkdtempSync(join(tmpdir(), "statusline-updater-fixture-"));
  let pubkey, privateKey;
  try {
    const path = join(directory, "fixture.key");
    signer(
      ["generate", "--ci", "--password", "", "--write-keys", path],
      verificationEnvironment(),
    );
    pubkey = readFileSync(`${path}.pub`, "utf8").trim();
    privateKey = readFileSync(path, "utf8");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  const signatures = new Map();
  return {
    pubkey,
    signature(bytes) {
      const cacheKey = Buffer.from(bytes).toString("base64");
      if (signatures.has(cacheKey)) return signatures.get(cacheKey);
      const directory = mkdtempSync(
        join(tmpdir(), "statusline-updater-fixture-"),
      );
      try {
        const path = join(directory, "payload");
        writeFileSync(path, bytes);
        signer(["sign", path], {
          ...verificationEnvironment(),
          TAURI_SIGNING_PRIVATE_KEY: privateKey,
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
        });
        const signature = readFileSync(`${path}.sig`, "utf8").trim();
        signatures.set(cacheKey, signature);
        return signature;
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  };
}
