import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const version = process.argv[2] || "1.1.0";
assert.ok(["1.1.0", "1.1.1"].includes(version), "Unsupported artwork version");
const root = new URL(
  `../../apps/apple/store/assets/${version}/`,
  import.meta.url,
);
const expected = [
  "01-quota.png",
  "02-gemini.png",
  "03-pairing.png",
  "04-widget.png",
  "05-privacy.png",
];
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
for (const locale of ["en-US", "es-ES"]) {
  const directory = new URL(`${locale}/`, root);
  assert.deepEqual(
    readdirSync(directory)
      .filter((name) => name.endsWith(".png"))
      .sort(),
    expected,
    `${locale} must contain exactly the five ordered store images`,
  );
  for (const name of expected) {
    const file = new URL(name, directory);
    const png = readFileSync(file);
    assert.ok(png.subarray(0, 8).equals(signature), `${name}: expected PNG`);
    assert.equal(png.toString("ascii", 12, 16), "IHDR");
    assert.equal(png.readUInt32BE(16), 1320, `${name}: width`);
    assert.equal(png.readUInt32BE(20), 2868, `${name}: height`);
    assert.equal(png[24], 8, `${name}: bit depth`);
    assert.equal(png[25], 2, `${name}: expected RGB without alpha`);
    let offset = 8;
    let ended = false;
    while (offset + 12 <= png.length) {
      const length = png.readUInt32BE(offset);
      const type = png.toString("ascii", offset + 4, offset + 8);
      assert.ok(
        offset + 12 + length <= png.length,
        `${name}: truncated PNG chunk`,
      );
      assert.notEqual(type, "tRNS", `${name}: unexpected transparency`);
      offset += length + 12;
      if (type === "IEND") {
        ended = true;
        break;
      }
    }
    assert.ok(ended, `${name}: missing IEND`);
    console.log(
      `${createHash("sha256").update(png).digest("hex")}  ${locale}/${name}`,
    );
  }
}
console.log(`PASS: 10 opaque 1320 × 2868 PNGs in ${fileURLToPath(root)}`);

for (const [locale, labels] of [
  [
    "en-US",
    [
      "Name",
      "Subtitle",
      "Promotional text",
      "Description",
      "Keywords",
      `What's new — ${version}`,
    ],
  ],
  [
    "es-ES",
    [
      "Nombre",
      "Subtítulo",
      "Texto promocional",
      "Descripción",
      "Palabras clave",
      `Novedades — ${version}`,
    ],
  ],
]) {
  const listing = readFileSync(
    new URL(`../../apps/apple/store/listing/${locale}.md`, import.meta.url),
    "utf8",
  );
  const sections = Object.fromEntries(
    listing
      .split(/^## /m)
      .slice(1)
      .map((section) => {
        const [heading, ...body] = section.split("\n");
        return [heading, body.join("\n").trim()];
      }),
  );
  const limits = [30, 30, 170, 4000, 100, 4000];
  for (const [index, label] of labels.entries()) {
    assert.ok(sections[label]?.length > 0, `${locale}: missing ${label}`);
    assert.ok(
      sections[label].length <= limits[index],
      `${locale}: ${label} exceeds ${limits[index]}`,
    );
  }
  assert.ok(
    sections[labels[3]].includes("Antigravity"),
    `${locale}: missing provider description`,
  );
}
const notes = readFileSync(
  new URL(
    `../../apps/apple/store/release-notes/${version}-review.txt`,
    import.meta.url,
  ),
  "utf8",
).trim();
assert.ok(
  notes.length > 0 && notes.length <= 4000,
  "Review notes must fit the 4000-character field",
);
console.log("PASS: EN/ES metadata and review-note field limits");
