#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const desktop = fileURLToPath(new URL("../", import.meta.url));
let builtVerifier;

// The verifier and Cargo never need the signing key, even when called directly
// after the official signer in a secret-bearing workflow step.
export function verificationEnvironment(env = process.env) {
  const safe = { ...env };
  for (const name of Object.keys(safe)) {
    if (name.startsWith("TAURI_SIGNING_PRIVATE_KEY")) delete safe[name];
  }
  return safe;
}

export function buildUpdaterVerifier() {
  if (builtVerifier) return builtVerifier;
  const extension = process.platform === "win32" ? ".exe" : "";
  const rustupCargo = join(homedir(), ".cargo", "bin", `cargo${extension}`);
  const target = join(desktop, "src-tauri/target/updater-verifier");
  const result = spawnSync(
    existsSync(rustupCargo) ? rustupCargo : `cargo${extension}`,
    [
      "build",
      "--locked",
      "--release",
      "--manifest-path",
      join(desktop, "scripts/updater-verifier/Cargo.toml"),
      "--target-dir",
      target,
    ],
    {
      cwd: desktop,
      env: verificationEnvironment(),
      encoding: "utf8",
      timeout: 180000,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Unable to build pinned updater verifier: ${result.stderr || result.error?.message}`,
    );
  builtVerifier = join(
    target,
    "release",
    `statusline-updater-verifier${extension}`,
  );
  return builtVerifier;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  buildUpdaterVerifier();
  console.log("Pinned standalone updater verifier is ready (no Tauri build).");
}
