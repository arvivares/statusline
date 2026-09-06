import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inflateSync } from "node:zlib";
import {
  androidVector,
  brand,
  checkAssets,
  generateAssets,
  placedContours,
  polygonContains,
  symbol,
  symbolSvg,
  traySvg,
} from "./generate-brand-assets.mjs";

const assets = generateAssets();

function decodePng(buffer) {
  assert.deepEqual(
    buffer.subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  assert.equal(buffer.toString("ascii", 12, 16), "IHDR");
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  assert.equal(buffer[24], 8, "Expected 8 bits per channel");
  const channels = { 2: 3, 6: 4 }[buffer[25]];
  assert(channels, "Expected RGB or RGBA color type");
  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT")
      chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === "IEND") break;
  }
  assert.equal(offset, buffer.length, "Unexpected trailing PNG data");
  const scanlines = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  assert.equal(scanlines.length, (stride + 1) * height);
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    assert.equal(
      scanlines[y * (stride + 1)],
      1,
      "Expected Sub-filtered PNG rows",
    );
    for (let byte = 0; byte < stride; byte++) {
      const previous =
        byte >= channels ? pixels[y * stride + byte - channels] : 0;
      pixels[y * stride + byte] =
        (scanlines[y * (stride + 1) + 1 + byte] + previous) % 256;
    }
  }
  return { width, height, channels, pixels };
}

test("canonical geometry retains the original five stripes, colors and -5 degree shear", () => {
  assert.deepEqual(brand.colors, { gold: "#EFC65A", canvas: "#0D0E0B" });
  assert.equal(brand.symbol.width, 28);
  assert.equal(brand.symbol.height, 30);
  assert.equal(brand.symbol.stripeWidth, 4);
  assert.equal(brand.symbol.stripePeriod, 6);
  assert.equal(brand.symbol.skewYDegrees, -5);
  assert.equal(symbol.contours.length, 11);
  assert(Math.abs(symbol.height - (30 + 28 * Math.tan(Math.PI / 36))) < 1e-12);
  const points = symbol.contours.flat();
  assert.equal(Math.min(...points.map(([x]) => x)), 0);
  assert.equal(Math.max(...points.map(([x]) => x)), 28);
  assert.equal(Math.min(...points.map(([, y]) => y)), 0);
  assert.equal(Math.max(...points.map(([, y]) => y)), symbol.height);
});

test("flattened contours match the original CSS polygon and stripe mask", () => {
  // Independent rectangle definition of the original CSS S polygon. Samples
  // avoid boundary points where SVG antialiasing and inclusion are ambiguous.
  const originalRectangles = [
    [0, 0, 28, 5.7],
    [0, 5.7, 6.16, 12],
    [0, 12, 28, 18],
    [21.84, 18, 28, 24.3],
    [0, 24.3, 28, 30],
  ];
  const shear = -Math.tan(Math.PI / 36);
  for (let x = 0.037; x < 28; x += 0.173) {
    for (let y = 0.043; y < 30; y += 0.179) {
      const expected =
        x % 6 < 4 &&
        originalRectangles.some(
          ([left, top, right, bottom]) =>
            x >= left && x < right && y >= top && y < bottom,
        );
      const projected = [x, y + shear * x - 28 * shear];
      const actual = symbol.contours.some((contour) =>
        polygonContains(projected, contour),
      );
      assert.equal(
        actual,
        expected,
        `Geometry differs at original CSS point ${x},${y}`,
      );
    }
  }
});

test("horizontal segments keep the right-rising -5 degree slope; vertical edges stay vertical", () => {
  const expectedSlope = -Math.tan(Math.PI / 36);
  let slantedEdges = 0;
  for (const contour of symbol.contours) {
    contour.forEach(([x, y], index) => {
      const [nextX, nextY] = contour[(index + 1) % contour.length];
      if (nextX === x) return;
      assert(Math.abs((nextY - y) / (nextX - x) - expectedSlope) < 1e-12);
      slantedEdges++;
    });
  }
  assert(slantedEdges >= 22);
  assert.doesNotMatch(symbolSvg(), /clipPath|mask|transform/);
});

test("Android foreground and themed icons fit every adaptive mask safe circle", () => {
  const { viewportSize, adaptiveSymbolHeight, safeZoneDiameter } =
    brand.android;
  for (const [x, y] of placedContours(
    viewportSize,
    adaptiveSymbolHeight,
  ).flat()) {
    assert(
      Math.hypot(x - viewportSize / 2, y - viewportSize / 2) <
        safeZoneDiameter / 2,
    );
  }
  const foreground = androidVector();
  const monochrome = androidVector({ monochrome: true });
  assert.equal(
    foreground.match(/android:pathData="([^"]+)"/)[1],
    monochrome.match(/android:pathData="([^"]+)"/)[1],
  );
  assert.equal((foreground.match(/<path\b/g) || []).length, 1);
  assert.match(monochrome, /#FFFFFFFF/);
  assert.equal(
    assets
      .get("apps/android/app/src/main/res/mipmap-anydpi/ic_launcher.xml")
      .toString(),
    assets
      .get("apps/android/app/src/main/res/mipmap-anydpi/ic_launcher_round.xml")
      .toString(),
  );
});

test("iOS, Play and touch icons are opaque RGB with square platform-owned corners", () => {
  for (const [path, size] of [
    [
      "apps/apple/statusline/Assets.xcassets/AppIcon.appiconset/AppIcon.png",
      1024,
    ],
    ["apps/android/store/assets/app-icon.png", 512],
    ["apps/web/public/apple-touch-icon.png", 180],
    ["apps/web/public/icon-192.png", 192],
    ["apps/web/public/icon-512.png", 512],
  ]) {
    const image = decodePng(assets.get(path));
    assert.equal(image.width, size, path);
    assert.equal(image.height, size, path);
    assert.equal(
      image.channels,
      3,
      `${path} must not include an alpha channel`,
    );
    assert.deepEqual(image.pixels.subarray(0, 3), Buffer.from([13, 14, 11]));
  }
});

test("desktop, macOS and favicon rasters use matching dimensions and transparent rounded corners", () => {
  for (const [path, png] of assets) {
    if (!path.endsWith(".png") || path.includes("tray-template")) continue;
    const image = decodePng(png);
    assert.equal(image.width, image.height, path);
    if (image.channels === 4)
      assert.equal(image.pixels[3], 0, `${path} corner must be transparent`);
  }
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    const image = decodePng(
      assets.get(
        `apps/apple/StatuslineCompanion/Assets.xcassets/AppIcon.appiconset/icon-${size}.png`,
      ),
    );
    assert.equal(image.width, size);
  }
});

test("macOS menu bar templates are a pure black silhouette on transparency, never the app badge", () => {
  assert.doesNotMatch(traySvg(), /<rect|#EFC65A|#0D0E0B/);
  for (const [filename, size] of [
    ["tray-template.png", 22],
    ["tray-template@2x.png", 44],
  ]) {
    const image = decodePng(
      assets.get(`apps/desktop/src-tauri/icons/${filename}`),
    );
    assert.equal(image.width, size);
    assert.equal(image.channels, 4);
    let visible = 0;
    let transparent = 0;
    for (let offset = 0; offset < image.pixels.length; offset += 4) {
      assert.equal(image.pixels[offset], 0);
      assert.equal(image.pixels[offset + 1], 0);
      assert.equal(image.pixels[offset + 2], 0);
      if (image.pixels[offset + 3]) visible++;
      else transparent++;
    }
    assert(visible > 0 && transparent > visible);
  }
});

test("ICO directories and modern ICNS chunks contain valid PNGs at every expected size", () => {
  for (const [path, sizes] of [
    ["apps/web/public/favicon.ico", [16, 32, 48]],
    ["apps/desktop/src-tauri/icons/icon.ico", [16, 24, 32, 48, 64, 128, 256]],
  ]) {
    const ico = assets.get(path);
    assert.equal(ico.readUInt16LE(0), 0);
    assert.equal(ico.readUInt16LE(2), 1);
    assert.equal(ico.readUInt16LE(4), sizes.length);
    let end;
    sizes.forEach((size, index) => {
      const entry = 6 + index * 16;
      assert.equal(ico[entry] || 256, size);
      assert.equal(ico[entry + 1] || 256, size);
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      end = offset + length;
      const image = decodePng(ico.subarray(offset, end));
      assert.equal(image.width, size);
      assert.equal(image.height, size);
    });
    assert.equal(end, ico.length);
  }
  const icns = assets.get("apps/desktop/src-tauri/icons/icon.icns");
  assert.equal(icns.toString("ascii", 0, 4), "icns");
  assert.equal(icns.readUInt32BE(4), icns.length);
  const expected = {
    icp4: 16,
    icp5: 32,
    icp6: 64,
    ic07: 128,
    ic08: 256,
    ic09: 512,
    ic10: 1024,
    ic11: 32,
    ic12: 64,
    ic13: 256,
    ic14: 512,
  };
  let offset = 8;
  const seen = [];
  while (offset < icns.length) {
    const type = icns.toString("ascii", offset, offset + 4);
    const length = icns.readUInt32BE(offset + 4);
    assert(expected[type], `Unknown ICNS chunk ${type}`);
    const image = decodePng(icns.subarray(offset + 8, offset + length));
    assert.equal(image.width, expected[type]);
    seen.push(type);
    offset += length;
  }
  assert.deepEqual(seen, Object.keys(expected));
  assert.equal(offset, icns.length);
});

test("generation is byte-reproducible and freshness checking identifies stale or missing files", async () => {
  const again = generateAssets();
  assert.deepEqual([...assets.keys()], [...again.keys()]);
  for (const [path, expected] of assets)
    assert(again.get(path).equals(expected), path);
  const temporary = await mkdtemp(join(tmpdir(), "statusline-brand-check-"));
  try {
    const fixtures = new Map([
      ["matching.svg", Buffer.from("official")],
      ["stale.png", Buffer.from("updated")],
      ["missing.ico", Buffer.from("icon")],
    ]);
    await writeFile(join(temporary, "matching.svg"), "official");
    await writeFile(join(temporary, "stale.png"), "old");
    assert.deepEqual(await checkAssets(fixtures, temporary), [
      "stale.png",
      "missing.ico",
    ]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

const readRepositoryFile = (path) =>
  readFile(new URL(`../${path}`, import.meta.url));

test("native Apple catalogs reference real generated icons and both targets select AppIcon", async () => {
  const macCatalog = "apps/apple/StatuslineCompanion/Assets.xcassets";
  const macSet = `${macCatalog}/AppIcon.appiconset`;
  const catalog = JSON.parse(
    await readRepositoryFile(`${macCatalog}/Contents.json`),
  );
  assert.equal(catalog.info.version, 1);
  const appIcon = JSON.parse(
    await readRepositoryFile(`${macSet}/Contents.json`),
  );
  assert.equal(appIcon.info.version, 1);
  assert.equal(appIcon.images.length, 10);
  const slots = new Set();
  for (const image of appIcon.images) {
    assert.equal(image.idiom, "mac");
    const [width, height] = image.size.split("x").map(Number);
    const scale = Number(image.scale.replace("x", ""));
    const path = `${macSet}/${image.filename}`;
    const actual = await readRepositoryFile(path);
    assert(assets.has(path), `${path} must be a maintained generated export`);
    assert(actual.equals(assets.get(path)), `${path} is stale`);
    const bitmap = decodePng(actual);
    assert.deepEqual(
      [bitmap.width, bitmap.height],
      [width * scale, height * scale],
      path,
    );
    slots.add(`${image.size}/${image.scale}`);
  }
  assert.equal(slots.size, 10, "Duplicate macOS icon slot");
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      assert(slots.has(`${size}x${size}/${scale}x`));
    }
  }

  const iosSet = "apps/apple/statusline/Assets.xcassets/AppIcon.appiconset";
  const iosIcon = JSON.parse(
    await readRepositoryFile(`${iosSet}/Contents.json`),
  );
  const baseIcon = iosIcon.images.find((entry) => !entry.appearances);
  assert.equal(baseIcon.platform, "ios");
  assert.equal(baseIcon.size, "1024x1024");
  const iosPath = `${iosSet}/${baseIcon.filename}`;
  const actualIos = await readRepositoryFile(iosPath);
  assert(actualIos.equals(assets.get(iosPath)), "iPhone catalog icon is stale");
  const iosBitmap = decodePng(actualIos);
  assert.deepEqual(
    [iosBitmap.width, iosBitmap.height, iosBitmap.channels],
    [1024, 1024, 3],
  );

  // Static wiring checks complement, but do not replace, an Xcode build.
  const project = (
    await readRepositoryFile("apps/apple/statusline.xcodeproj/project.pbxproj")
  ).toString();
  for (const id of [
    "B20000000000000000000008",
    "B20000000000000000000009",
    "EF6DA04D303FA262007F6F4C",
    "EF6DA04E303FA262007F6F4C",
  ]) {
    const settings = project.match(
      new RegExp(
        `${id} /\\* (?:Debug|Release) \\*/ = \\{[\\s\\S]*?buildSettings = \\{([\\s\\S]*?)\\n\\t\\t\\t\\};`,
      ),
    );
    assert(settings, `Missing native build configuration ${id}`);
    assert.match(settings[1], /ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;/);
  }
  const companionTarget = project.match(
    /B20000000000000000000006 \/\* StatuslineCompanion \*\/ = \{[\s\S]*?fileSystemSynchronizedGroups = \(([\s\S]*?)\);/,
  );
  assert(companionTarget, "Missing native macOS target");
  assert.match(companionTarget[1], /B20000000000000000000002/);
  assert.match(
    project,
    /B20000000000000000000002 \/\* StatuslineCompanion \*\/ = \{\s*isa = PBXFileSystemSynchronizedRootGroup;\s*path = StatuslineCompanion;/,
  );
});

test("native tray configuration templates only the macOS menu bar and preserves colored app icons", async () => {
  // These assertions inspect source/configuration; AppKit appearance still needs
  // a macOS runtime check in both light and dark menu bars.
  const source = (
    await readRepositoryFile("apps/desktop/src-tauri/src/lib.rs")
  ).toString();
  assert.match(
    source,
    /#\[cfg\(target_os = "macos"\)\]\s*const MACOS_TRAY_TEMPLATE: tauri::image::Image<'static> =\s*tauri::include_image!\("\.\/icons\/tray-template@2x\.png"\);/,
  );
  assert.match(
    source,
    /#\[cfg\(target_os = "macos"\)\]\s*\{\s*tray_builder = tray_builder\s*\.icon\(MACOS_TRAY_TEMPLATE\)\s*\.icon_as_template\(true\);/,
  );
  assert.match(
    source,
    /#\[cfg\(not\(target_os = "macos"\)\)\]\s*if let Some\(icon\) = app.default_window_icon\(\) \{\s*tray_builder = tray_builder.icon\(icon.clone\(\)\);/,
  );
  assert.equal((source.match(/\.icon_as_template\(true\)/g) || []).length, 1);
  const config = JSON.parse(
    await readRepositoryFile("apps/desktop/src-tauri/tauri.conf.json"),
  );
  for (const filename of config.bundle.icon) {
    assert.doesNotMatch(filename, /tray-template/);
    const path = `apps/desktop/src-tauri/${filename}`;
    assert(
      assets.has(path),
      `${path} must remain a colored generated app icon`,
    );
  }
});

test("Android launcher references cover legacy, adaptive, round and themed icons", async () => {
  const manifest = (
    await readRepositoryFile("apps/android/app/src/main/AndroidManifest.xml")
  ).toString();
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/);
  for (const name of ["ic_launcher", "ic_launcher_round"]) {
    const legacy = `apps/android/app/src/main/res/mipmap-anydpi/${name}.xml`;
    const actualLegacy = await readRepositoryFile(legacy);
    assert(actualLegacy.equals(assets.get(legacy)));
    assert.match(actualLegacy.toString(), /<vector\b/);
    for (const version of [26, 33]) {
      const xml = (
        await readRepositoryFile(
          `apps/android/app/src/main/res/mipmap-anydpi-v${version}/${name}.xml`,
        )
      ).toString();
      assert.match(xml, /<adaptive-icon\b/);
      for (const layer of ["foreground", "monochrome"]) {
        assert(
          xml.includes(`android:drawable="@drawable/ic_launcher_${layer}"`),
        );
        const path = `apps/android/app/src/main/res/drawable/ic_launcher_${layer}.xml`;
        assert((await readRepositoryFile(path)).equals(assets.get(path)));
      }
    }
  }
});
