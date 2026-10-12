import sharp from "sharp";
import { describe, expect, it } from "vitest";
import manifest from "../package.json";
import lock from "../package-lock.json";

const minimumSharp = "0.35.5";

function isPatchedVersion(
  version: string | undefined,
  minimum: string,
): boolean {
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) return false;
  const actual = version.split(".").map(Number);
  const required = minimum.split(".").map(Number);
  for (let index = 0; index < required.length; index += 1) {
    if (actual[index] !== required[index]) {
      return actual[index]! > required[index]!;
    }
  }
  return true;
}

describe("relay development-tooling security", () => {
  it.each<[string | undefined, boolean]>([
    ["0.35.4", false],
    ["0.35.5", true],
    ["0.35.6", true],
    ["0.36.0", true],
    ["0.34.99", false],
    ["0.35.5-alpha.1", false],
    [undefined, false],
  ])("checks the Sharp security floor for %s", (version, patched) => {
    expect(isPatchedVersion(version, minimumSharp)).toBe(patched);
  });

  it("uses patched upstream Miniflare tooling without a stale Sharp override", () => {
    expect(manifest).not.toHaveProperty("overrides.miniflare.sharp");
    const packages: Record<string, { version?: string }> = lock.packages;
    const copies = Object.entries(packages).filter(([path]) =>
      /(^|\/)node_modules\/sharp$/.test(path),
    );
    expect(copies.length).toBeGreaterThan(0);
    for (const [path, entry] of copies) {
      expect(
        isPatchedVersion(entry.version, minimumSharp),
        `${path} must include Sharp ${minimumSharp} security fixes`,
      ).toBe(true);
    }
    expect(isPatchedVersion(sharp.versions.sharp, minimumSharp)).toBe(true);
    expect(
      copies.some(([, entry]) => entry.version === sharp.versions.sharp),
    ).toBe(true);
  });

  it("loads patched librsvg rather than an older global library", () => {
    expect(
      isPatchedVersion(sharp.versions.rsvg, "2.63.2"),
      `librsvg ${sharp.versions.rsvg ?? "missing"} must include the 2.63.2 security fixes`,
    ).toBe(true);
  });

  it("renders a generated benign SVG with the patched tooling", async () => {
    // Constant local input: no user images, external URLs or exploit payloads.
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#efc65a"/></svg>',
    );
    const { info } = await sharp(svg)
      .png()
      .toBuffer({ resolveWithObject: true });
    expect(info.format).toBe("png");
    expect(info.width).toBe(8);
    expect(info.height).toBe(8);
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
