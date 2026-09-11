import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseUpdaterPublicKey,
  verifyUpdaterSignature,
} from "./updater-artifacts.mjs";
import {
  findUpdaterPayloads,
  signPlatformArtifacts,
  signUpdaterFile,
} from "./sign-updater-artifacts.mjs";
import { updaterTestKey } from "./updater-test-fixtures.mjs";
import {
  buildUpdaterVerifier,
  verificationEnvironment,
} from "./build-updater-verifier.mjs";

// Cold Rust compilation belongs to test setup, not a five-second test timeout.
buildUpdaterVerifier();

let temporary;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (temporary) await rm(temporary, { recursive: true, force: true });
  temporary = undefined;
});

describe("updater signature verification", () => {
  it("does not pass private signing material to Cargo or the verifier", () => {
    expect(
      verificationEnvironment({
        PATH: "test",
        TAURI_SIGNING_PRIVATE_KEY: "test-only",
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "test-only",
      }),
    ).toEqual({ PATH: "test" });
  });
  it("selects the final AppImage without traversing a retained AppDir", async () => {
    temporary = await mkdtemp(join(tmpdir(), "statusline-updater-selection-"));
    const appdir = join(temporary, "Statusline.AppDir");
    await mkdir(appdir);
    const payload = join(temporary, "Statusline.AppImage");
    await writeFile(payload, "final payload");
    await symlink(payload, join(appdir, "runtime-link"));
    await writeFile(join(appdir, "nested.AppImage"), "not a release artifact");
    expect(await findUpdaterPayloads("linux", temporary)).toEqual([payload]);
  });

  it("selects both staged and Tauri-directory Windows payloads", async () => {
    temporary = await mkdtemp(
      join(tmpdir(), "statusline-updater-windows-selection-"),
    );
    const staged = join(temporary, "staged");
    const bundle = join(temporary, "bundle");
    await mkdir(staged);
    await mkdir(join(bundle, "nsis"), { recursive: true });
    await mkdir(join(bundle, "msi"));
    for (const [type, name] of [
      ["nsis", "setup.exe"],
      ["msi", "setup.msi"],
    ]) {
      await writeFile(join(staged, name), "final signed bytes");
      await writeFile(join(bundle, type, name), "final preview bytes");
    }
    expect(await findUpdaterPayloads("windows", staged)).toEqual([
      join(staged, "setup.exe"),
      join(staged, "setup.msi"),
    ]);
    expect(await findUpdaterPayloads("windows", bundle)).toEqual([
      join(bundle, "nsis/setup.exe"),
      join(bundle, "msi/setup.msi"),
    ]);
  });
  it("fails closed without a signing key", async () => {
    await expect(signUpdaterFile("unused", { env: {} })).rejects.toThrow(
      "TAURI_SIGNING_PRIVATE_KEY is required",
    );
  });

  it.each([
    ["workflow_dispatch", "arvivares/statusline", "branch", "false"],
    ["pull_request", "arvivares/statusline", "branch", "true"],
    ["push", "someone/statusline", "tag", "true"],
  ])(
    "refuses signing outside canonical release context: %s %s",
    async (event, repository, refType, release) => {
      vi.stubEnv("GITHUB_EVENT_NAME", event);
      vi.stubEnv("GITHUB_REPOSITORY", repository);
      vi.stubEnv("GITHUB_REF_TYPE", refType);
      vi.stubEnv("RELEASE_BUILD", release);
      await expect(signPlatformArtifacts("linux", "unused")).rejects.toThrow(
        "restricted to the canonical tag-triggered release workflow",
      );
    },
  );
  it("verifies exact bytes and rejects changed payloads, wrong keys and changed trusted comments", async () => {
    temporary = await mkdtemp(join(tmpdir(), "statusline-updater-test-"));
    const path = join(temporary, "payload.AppImage");
    await writeFile(path, "final prepared bytes");
    const key = updaterTestKey();
    const signature = key.signature("final prepared bytes");
    await expect(
      verifyUpdaterSignature(path, signature, key.pubkey),
    ).resolves.toBe(signature);
    await expect(
      verifyUpdaterSignature(path, signature, updaterTestKey().pubkey),
    ).rejects.toThrow("different key");
    const corrupted = Buffer.from(
      Buffer.from(signature, "base64")
        .toString()
        .replace("\ntrusted comment: ", "\ntrusted comment: tampered "),
    ).toString("base64");
    await expect(
      verifyUpdaterSignature(path, corrupted, key.pubkey),
    ).rejects.toThrow("signature verification failed");
    await writeFile(path, "early unprepared bytes");
    await expect(
      verifyUpdaterSignature(path, signature, key.pubkey),
    ).rejects.toThrow("signature verification failed");
  });

  it("rejects malformed public keys and envelopes", async () => {
    expect(() => parseUpdaterPublicKey("not-a-key")).toThrow();
    await expect(
      verifyUpdaterSignature(
        "unused",
        "not-a-signature",
        updaterTestKey().pubkey,
      ),
    ).rejects.toThrow();
  });

  it.each(["", "test-only fixture password"])(
    "verifies a pinned official Tauri CLI signature and preserves the supplied key password (case %#)",
    async (password) => {
      temporary = await mkdtemp(join(tmpdir(), "statusline-updater-cli-test-"));
      const keyPath = join(temporary, "test-only.key");
      const cli = fileURLToPath(
        new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url),
      );
      const generated = spawnSync(
        process.execPath,
        [
          cli,
          "signer",
          "generate",
          "--ci",
          "--password",
          password,
          "--write-keys",
          keyPath,
        ],
        {
          encoding: "utf8",
          timeout: 30000,
          stdio: ["ignore", "pipe", "pipe"],
          env: verificationEnvironment(),
        },
      );
      // Signer output contains the generated test key; do not include it in assertions.
      expect(generated.status).toBe(0);
      const publicKey = (await readFile(`${keyPath}.pub`, "utf8")).trim();
      const path = join(
        temporary,
        "Statusline Companion_0.1.17_x64.unsigned.msi",
      );
      await writeFile(path, "official CLI interoperability fixture");
      await signUpdaterFile(path, {
        publicKey,
        env: {
          ...process.env,
          TAURI_SIGNING_PRIVATE_KEY: await readFile(keyPath, "utf8"),
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password,
        },
      });
      const signature = await readFile(`${path}.sig`, "utf8");
      await expect(
        verifyUpdaterSignature(path, signature, publicKey),
      ).resolves.toBe(signature.trim());
    },
    60000,
  );
});
