import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const guard = fileURLToPath(
  new URL("./verify-macos-architectures.sh", import.meta.url),
);
const arm64 = [0x0100000c, 0];
const x86_64 = [0x01000007, 3];
let root;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

// Header-only fixtures are data, never executed or compiled. Apple's lipo reads
// the same architecture metadata that it inspects in the distribution binary.
function thinHeader([cpuType, cpuSubtype]) {
  const header = Buffer.alloc(32);
  header.writeUInt32LE(0xfeedfacf, 0);
  header.writeUInt32LE(cpuType, 4);
  header.writeUInt32LE(cpuSubtype, 8);
  header.writeUInt32LE(2, 12); // MH_EXECUTE
  return header;
}

function universalHeader() {
  const contents = Buffer.alloc(8192 + 32);
  contents.writeUInt32BE(0xcafebabe, 0);
  contents.writeUInt32BE(2, 4);
  [arm64, x86_64].forEach((architecture, index) => {
    const descriptor = 8 + index * 20;
    const offset = (index + 1) * 4096;
    contents.writeUInt32BE(architecture[0], descriptor);
    contents.writeUInt32BE(architecture[1], descriptor + 4);
    contents.writeUInt32BE(offset, descriptor + 8);
    contents.writeUInt32BE(32, descriptor + 12);
    contents.writeUInt32BE(12, descriptor + 16);
    thinHeader(architecture).copy(contents, offset);
  });
  return contents;
}

async function fixture(contents) {
  root = await mkdtemp(join(tmpdir(), "statusline-macos-architectures-"));
  const path = join(root, "Statusline Companion Álvaro");
  await writeFile(path, contents);
  return path;
}

function verify(path) {
  const result = spawnSync("/bin/bash", [guard, path], {
    encoding: "utf8",
    timeout: 10000,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return result;
}

it("the production updater packager uses the tested architecture guard", async () => {
  const source = await readFile(
    new URL("./package-macos-updater.sh", import.meta.url),
    "utf8",
  );
  expect(source).toContain(
    'bash "$script_directory/verify-macos-architectures.sh" "$app/Contents/MacOS/$executable"',
  );
  expect(source).not.toMatch(/^\s*lipo\s/mu);
});

describe.skipIf(process.platform !== "darwin")(
  "real Apple lipo architecture guard",
  () => {
    it("accepts universal metadata at a path with spaces and Unicode", async () => {
      const result = verify(await fixture(universalHeader()));
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
    });

    it.each([
      ["arm64", arm64],
      ["x86_64", x86_64],
    ])(
      "rejects an executable containing only %s",
      async (_name, architecture) => {
        const result = verify(await fixture(thinHeader(architecture)));
        expect(result.error).toBeUndefined();
        expect(result.status).not.toBe(0);
      },
    );

    it("rejects malformed binary metadata", async () => {
      expect(verify(await fixture("not a Mach-O binary")).status).not.toBe(0);
    });

    it("rejects missing files and symlinks", async () => {
      const path = await fixture(universalHeader());
      const link = join(root, "linked executable");
      await symlink(path, link);
      expect(verify(link).status).not.toBe(0);
      expect(verify(join(root, "missing")).status).not.toBe(0);
    });
  },
);
