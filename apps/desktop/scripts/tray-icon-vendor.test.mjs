import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const vendor = new URL("../src-tauri/vendor/tray-icon/", import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL("UPSTREAM.json", vendor), "utf8"),
);
const macos = "src/platform_impl/macos/mod.rs";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

describe("bounded upstream macOS 27 compatibility patch", () => {
  it("records the published crate and the merged upstream correction", () => {
    expect(manifest.version).toBe("0.24.2");
    expect(manifest.archiveSha256).toBe(
      "045979e3f037cd18ad1cb2a419dfda133c5c29c9f3453370079f2255d46c257e",
    );
    expect(manifest.upstreamCommit).toBe(
      "42eb44ea1507d51b68a8b2fbb0d96a9c85f5b4cd",
    );
    expect(manifest.files[macos].sha256).not.toBe(
      manifest.files[macos].upstreamSha256,
    );
  });

  it("keeps all other platform code, manifests and licenses identical to upstream", () => {
    for (const [name, record] of Object.entries(manifest.files)) {
      expect(name).not.toMatch(/(^\/|\.\.|\\)/);
      expect(digest(readFileSync(new URL(name, vendor))), name).toBe(
        record.sha256,
      );
      if (name === "LICENSE.spdx") {
        const bytes = readFileSync(new URL(name, vendor));
        expect(bytes.at(-1)).toBe(10);
        expect(digest(bytes.subarray(0, -1))).toBe(record.upstreamSha256);
      } else if (name !== macos)
        expect(record.sha256, name).toBe(record.upstreamSha256);
    }
    for (const license of ["LICENSE-MIT", "LICENSE-APACHE", "LICENSE.spdx"])
      expect(manifest.files[license]).toBeDefined();
  });

  it("has no unrecorded source files", () => {
    const walk = (directory, prefix = "") =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const name = prefix + entry.name;
        expect(entry.isSymbolicLink(), name).toBe(false);
        return entry.isDirectory()
          ? walk(new URL(entry.name + "/", directory), name + "/")
          : [name];
      });
    expect(walk(vendor).sort()).toEqual(
      [...Object.keys(manifest.files), "PATCH.md", "UPSTREAM.json"].sort(),
    );
  });

  it("selects the local patch without switching the Tauri dependency series", () => {
    const cargo = readFileSync(
      new URL("../src-tauri/Cargo.toml", import.meta.url),
      "utf8",
    );
    const lock = readFileSync(
      new URL("../src-tauri/Cargo.lock", import.meta.url),
      "utf8",
    );
    expect(cargo).toContain('tray-icon = { path = "vendor/tray-icon" }');
    const entry = lock
      .split("[[package]]")
      .find((block) => block.includes('name = "tray-icon"'));
    expect(entry).toContain('version = "0.24.2"');
    expect(entry).not.toContain("source =");
    expect(entry).toContain('"windows-sys 0.61.2"');
  });
});
