import sharp from "sharp";
import { describe, expect, it } from "vitest";
import manifest from "../package.json";
import lock from "../package-lock.json";

const patchedSharp = "0.35.4";

describe("relay development-tooling security", () => {
  it("keeps the temporary Miniflare override and every Sharp copy patched", () => {
    expect(manifest.overrides.miniflare.sharp).toBe(patchedSharp);
    const packages: Record<string, { version?: string }> = lock.packages;
    const copies = Object.entries(packages).filter(([path]) =>
      /(^|\/)node_modules\/sharp$/.test(path),
    );
    expect(copies.length).toBeGreaterThan(0);
    for (const [path, entry] of copies) {
      expect(entry.version, path).toBe(patchedSharp);
    }
    expect(sharp.versions.sharp).toBe(patchedSharp);
  });

  it("loads the patched native libheif rather than an older global library", () => {
    const version = sharp.versions.heif ?? "";
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
    expect(
      major > 1 ||
        (major === 1 && (minor > 23 || (minor === 23 && patch >= 2))),
      `libheif ${version} must include the 1.23.2 security fixes`,
    ).toBe(true);
  });

  it("can encode and decode a generated benign AVIF with the patched tooling", async () => {
    // No network, untrusted fixtures, exploit payloads or application data.
    const avif = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 239, g: 198, b: 90 },
      },
    })
      .avif()
      .toBuffer();
    const { info } = await sharp(avif)
      .png()
      .toBuffer({ resolveWithObject: true });
    expect(info.format).toBe("png");
    expect(info.width).toBe(8);
    expect(info.height).toBe(8);
  });
});
