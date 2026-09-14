import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "parse5";
import { productMediaPlugin, productAssets } from "./product-media.mjs";
import { productImage, productViews } from "../src/product-media.ts";
import { renderPage, nodes, attribute } from "./render-html.mjs";

test("only known product views can produce a public asset path", () => {
  assert.equal(productAssets.size, 8);
  for (const invalid of ["", "../../secret", "companion-en.png", "constructor"])
    assert.throws(() => productImage(invalid, "en"));
});

test("build emits the eight original PNGs without transformations", async () => {
  const emitted = [];
  await productMediaPlugin().generateBundle.call({
    emitFile: (asset) => emitted.push(asset),
  });
  assert.equal(emitted.length, 8);
  for (const asset of emitted) {
    assert.equal(asset.type, "asset");
    assert.deepEqual(
      asset.source,
      await readFile(productAssets.get(`/${asset.fileName}`)),
    );
    assert.equal(asset.source.subarray(1, 4).toString(), "PNG");
  }
});

test("EN and ES HTML contain real, localized captures before JavaScript", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  for (const language of ["en", "es"]) {
    const document = parse(renderPage(html, language));
    const images = [...nodes(document)].filter(
      (node) => node.tagName === "img" && attribute(node, "data-product-image"),
    );
    assert.deepEqual(
      images.map((node) => attribute(node, "data-product-image")).sort(),
      [...productViews].sort(),
    );
    for (const image of images) {
      assert.equal(
        attribute(image, "src"),
        productImage(attribute(image, "data-product-image"), language),
      );
      assert.ok(attribute(image, "alt").length > 20);
      assert.ok(Number(attribute(image, "width")) > 0);
      assert.ok(Number(attribute(image, "height")) > 0);
    }
  }
});
