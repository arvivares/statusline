import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(
  new URL("../branding/package.json", import.meta.url),
);
const { Resvg } = require("@resvg/resvg-js");
const { zlibSync } = require("fflate");
export const brand = JSON.parse(
  await readFile(resolve(root, "branding/logo.json"), "utf8"),
);
const number = (value) => String(Number(value.toFixed(9)));
const pointKey = ([x, y]) => `${x},${y}`;

export function polygonContains([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Compile the original CSS polygon and repeating stripe mask into real outlines.
// Adjacent cells share their exact edges; cancelling those edges avoids raster
// seams, clip-path dependencies and slightly different per-platform renderings.
export function compileSymbol(source = brand.symbol) {
  const { width, height, polygon, stripePeriod, stripeWidth } = source;
  assert(width > 0 && height > 0 && stripeWidth > 0);
  assert(stripePeriod > stripeWidth);
  polygon.forEach(([x, y], index) => {
    assert(Number.isFinite(x) && Number.isFinite(y));
    assert(x >= 0 && x <= width && y >= 0 && y <= height);
    const [nextX, nextY] = polygon[(index + 1) % polygon.length];
    assert(
      x === nextX || y === nextY,
      "Source polygon must have axis-aligned edges",
    );
  });
  const xValues = new Set([0, width, ...polygon.map(([x]) => x)]);
  for (let start = 0; start < width; start += stripePeriod) {
    xValues.add(start);
    xValues.add(Math.min(start + stripeWidth, width));
  }
  const xs = [...xValues].sort((a, b) => a - b);
  const ys = [...new Set(polygon.map(([, y]) => y))].sort((a, b) => a - b);
  const edges = new Map();
  const addEdge = (from, to) => {
    const forward = `${pointKey(from)}:${pointKey(to)}`;
    const backward = `${pointKey(to)}:${pointKey(from)}`;
    if (edges.has(backward)) edges.delete(backward);
    else edges.set(forward, { from, to });
  };
  for (let xi = 0; xi < xs.length - 1; xi++) {
    for (let yi = 0; yi < ys.length - 1; yi++) {
      const x = (xs[xi] + xs[xi + 1]) / 2;
      const y = (ys[yi] + ys[yi + 1]) / 2;
      if (
        x % stripePeriod >= stripeWidth ||
        !polygonContains([x, y], polygon)
      ) {
        continue;
      }
      const corners = [
        [xs[xi], ys[yi]],
        [xs[xi + 1], ys[yi]],
        [xs[xi + 1], ys[yi + 1]],
        [xs[xi], ys[yi + 1]],
      ];
      corners.forEach((from, index) => addEdge(from, corners[(index + 1) % 4]));
    }
  }
  const fromEdges = new Map();
  for (const edge of edges.values()) {
    assert(!fromEdges.has(pointKey(edge.from)), "Ambiguous polygon boundary");
    fromEdges.set(pointKey(edge.from), edge);
  }
  const contours = [];
  while (fromEdges.size) {
    const first = fromEdges.values().next().value;
    let edge = first;
    const contour = [];
    do {
      assert(edge, "Unclosed polygon boundary");
      contour.push(edge.from);
      fromEdges.delete(pointKey(edge.from));
      const next = edge.to;
      if (pointKey(next) === pointKey(first.from)) break;
      edge = fromEdges.get(pointKey(next));
    } while (true);
    contours.push(
      contour.filter((current, index) => {
        const previous = contour[(index + contour.length - 1) % contour.length];
        const next = contour[(index + 1) % contour.length];
        return !(
          (previous[0] === current[0] && current[0] === next[0]) ||
          (previous[1] === current[1] && current[1] === next[1])
        );
      }),
    );
  }
  const shear = Math.tan((source.skewYDegrees * Math.PI) / 180);
  const minimumY = Math.min(0, width * shear);
  return {
    width,
    height: height + Math.abs(width * shear),
    contours: contours.map((contour) =>
      contour.map(([x, y]) => [x, y + shear * x - minimumY]),
    ),
  };
}

export const symbol = compileSymbol();

export function placedContours(canvasSize, symbolHeight) {
  const scale = symbolHeight / symbol.height;
  return symbol.contours.map((contour) =>
    contour.map(([x, y]) => [
      (canvasSize - symbol.width * scale) / 2 + x * scale,
      (canvasSize - symbolHeight) / 2 + y * scale,
    ]),
  );
}

export function pathData(contours) {
  return contours
    .map(
      (contour) =>
        contour
          .map(
            ([x, y], index) => `${index ? "L" : "M"}${number(x)},${number(y)}`,
          )
          .join("") + "Z",
    )
    .join(" ");
}

const sourceNotice =
  "<!-- Generated from branding/logo.json. Run npm run generate in branding/. -->";

export function symbolSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${symbol.width} ${number(symbol.height)}">\n  ${sourceNotice}\n  <path fill="${brand.colors.gold}" d="${pathData(symbol.contours)}" />\n</svg>\n`;
}

export function iconSvg({ rounded = true } = {}) {
  const size = brand.icon.canvasSize;
  const radius = rounded ? ` rx="${brand.icon.cornerRadius}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">\n  ${sourceNotice}\n  <rect width="${size}" height="${size}"${radius} fill="${brand.colors.canvas}" />\n  <path fill="${brand.colors.gold}" d="${pathData(placedContours(size, size * brand.icon.symbolHeightRatio))}" />\n</svg>\n`;
}

export function traySvg() {
  const { canvasSize, symbolHeight, color } = brand.macOSMenuBar;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasSize} ${canvasSize}">\n  ${sourceNotice}\n  <path fill="${color}" d="${pathData(placedContours(canvasSize, symbolHeight))}" />\n</svg>\n`;
}

export function androidVector({ adaptive = true, monochrome = false } = {}) {
  const size = brand.android.viewportSize;
  const height = adaptive
    ? brand.android.adaptiveSymbolHeight
    : size * brand.icon.symbolHeightRatio;
  const contours = placedContours(size, height);
  if (adaptive) {
    for (const contour of contours) {
      for (const [x, y] of contour) {
        assert(
          Math.hypot(x - size / 2, y - size / 2) <=
            brand.android.safeZoneDiameter / 2,
          "Android foreground extends beyond the adaptive-icon safe circle",
        );
      }
    }
  }
  const background = adaptive
    ? ""
    : `    <path android:fillColor="${brand.colors.canvas}" android:pathData="M0,0h${size}v${size}h-${size}z" />\n`;
  return `<?xml version="1.0" encoding="utf-8"?>\n${sourceNotice}\n<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="${size}dp"\n    android:height="${size}dp"\n    android:viewportWidth="${size}"\n    android:viewportHeight="${size}">\n${background}    <path\n        android:fillColor="${monochrome ? "#FFFFFFFF" : brand.colors.gold}"\n        android:pathData="${pathData(contours)}" />\n</vector>\n`;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type), data]);
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  payload.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(payload), data.length + 8);
  return chunk;
}

// A pinned pure-JS compressor makes bytes independent of the host zlib version.
// Opaque store icons are RGB PNGs, not RGBA files with an unused alpha channel.
export function renderPng(svg, size, { opaque = false } = {}) {
  const rendered = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
  }).render();
  const { width, height, pixels } = rendered;
  assert.equal(width, size);
  assert.equal(height, size);
  const channels = opaque ? 3 : 4;
  const stride = width * channels;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const input = (y * width + x) * 4;
      const output = y * (stride + 1) + 1 + x * channels;
      if (opaque)
        assert.equal(
          pixels[input + 3],
          255,
          "Store icon contains transparency",
        );
      for (let channel = 0; channel < channels; channel++) {
        // PNG filter type 1 (Sub) substantially compresses these flat-color icons.
        const previous = x ? pixels[input - 4 + channel] : 0;
        scanlines[output + channel] =
          (pixels[input + channel] - previous + 256) % 256;
      }
    }
    scanlines[y * (stride + 1)] = 1;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = opaque ? 2 : 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("sRGB", Buffer.from([0])),
    pngChunk("IDAT", Buffer.from(zlibSync(scanlines, { level: 9 }))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function encodeIco(entries) {
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, png }, index) => {
    assert(size >= 1 && size <= 256);
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map(({ png }) => png)]);
}

export function encodeIcns(entries) {
  const chunks = entries.map(({ type, png }) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, "ascii");
    header.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([header, png]);
  });
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(
    8 + chunks.reduce((size, chunk) => size + chunk.length, 0),
    4,
  );
  return Buffer.concat([header, ...chunks]);
}

export function generateAssets() {
  const assets = new Map();
  const add = (path, contents) => assets.set(path, Buffer.from(contents));
  const rounded = iconSvg();
  const square = iconSvg({ rounded: false });
  const rasters = new Map();
  const png = (size, opaque = false) => {
    const key = `${size}:${opaque}`;
    if (!rasters.has(key)) {
      rasters.set(key, renderPng(opaque ? square : rounded, size, { opaque }));
    }
    return rasters.get(key);
  };

  add("branding/statusline-symbol.svg", symbolSvg());
  add("branding/statusline-icon.svg", rounded);
  add("branding/statusline-icon-square.svg", square);
  add("branding/statusline-icon.png", png(1024));
  add("apps/web/public/assets/statusline-symbol.svg", symbolSvg());
  add("apps/web/public/assets/statusline-mark.svg", rounded);
  add("apps/web/public/assets/statusline-mark.png", png(512));
  for (const size of [16, 32]) {
    add(`apps/web/public/favicon-${size}x${size}.png`, png(size));
  }
  add("apps/web/public/apple-touch-icon.png", png(180, true));
  for (const size of [192, 512])
    add(`apps/web/public/icon-${size}.png`, png(size, true));
  add(
    "apps/web/public/favicon.ico",
    encodeIco([16, 32, 48].map((size) => ({ size, png: png(size) }))),
  );

  const desktop = "apps/desktop/src-tauri/icons";
  add(`${desktop}/app-icon.svg`, rounded);
  add(
    `${desktop}/tray-template.png`,
    renderPng(traySvg(), brand.macOSMenuBar.canvasSize),
  );
  add(
    `${desktop}/tray-template@2x.png`,
    renderPng(traySvg(), brand.macOSMenuBar.canvasSize * 2),
  );
  for (const [name, size] of [
    ["32x32.png", 32],
    ["128x128.png", 128],
    ["128x128@2x.png", 256],
    ["icon.png", 512],
    ["StoreLogo.png", 50],
    ...[30, 44, 71, 89, 107, 142, 150, 284, 310].map((size) => [
      `Square${size}x${size}Logo.png`,
      size,
    ]),
  ]) {
    add(`${desktop}/${name}`, png(size));
  }
  add(
    `${desktop}/icon.ico`,
    encodeIco(
      [16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: png(size) })),
    ),
  );
  add(
    `${desktop}/icon.icns`,
    encodeIcns(
      [
        ["icp4", 16],
        ["icp5", 32],
        ["icp6", 64],
        ["ic07", 128],
        ["ic08", 256],
        ["ic09", 512],
        ["ic10", 1024],
        ["ic11", 32],
        ["ic12", 64],
        ["ic13", 256],
        ["ic14", 512],
      ].map(([type, size]) => ({ type, png: png(size) })),
    ),
  );

  add("apps/apple/store/assets/source/app-icon.svg", square);
  add(
    "apps/apple/statusline/Assets.xcassets/AppIcon.appiconset/AppIcon.png",
    png(1024, true),
  );
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    add(
      `apps/apple/StatuslineCompanion/Assets.xcassets/AppIcon.appiconset/icon-${size}.png`,
      png(size),
    );
  }
  add("apps/android/store/assets/app-icon.png", png(512, true));
  const android = "apps/android/app/src/main/res";
  add(`${android}/drawable/ic_launcher_foreground.xml`, androidVector());
  add(
    `${android}/drawable/ic_launcher_monochrome.xml`,
    androidVector({ monochrome: true }),
  );
  add(
    `${android}/mipmap-anydpi/ic_launcher.xml`,
    androidVector({ adaptive: false }),
  );
  add(
    `${android}/mipmap-anydpi/ic_launcher_round.xml`,
    androidVector({ adaptive: false }),
  );
  return assets;
}

export async function checkAssets(assets, destinationRoot = root) {
  const outdated = [];
  for (const [relativePath, expected] of assets) {
    let actual;
    try {
      actual = await readFile(resolve(destinationRoot, relativePath));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (!actual || !actual.equals(expected)) outdated.push(relativePath);
  }
  return outdated;
}

async function main() {
  const flags = process.argv.slice(2);
  assert(
    flags.every((flag) => flag === "--check"),
    "Usage: generate-brand-assets.mjs [--check]",
  );
  const checking = flags.includes("--check");
  const assets = generateAssets();
  const outdated = checking ? await checkAssets(assets) : [];
  if (!checking) {
    for (const [relativePath, expected] of assets) {
      const destination = resolve(root, relativePath);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, expected);
    }
  }
  if (outdated.length) {
    console.error(
      `Outdated brand assets:\n${outdated.map((path) => `  ${path}`).join("\n")}\nRun npm run generate --prefix branding.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `${checking ? "Verified" : "Generated"} ${assets.size} official Statusline brand assets.`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
