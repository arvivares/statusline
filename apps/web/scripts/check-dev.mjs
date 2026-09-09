import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { parse } from "parse5";
import { nodes, attribute } from "./render-html.mjs";

const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  server: { host: "127.0.0.1", port: 0, strictPort: true, open: false },
});
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const original = await readFile(
    new URL("../../../docs/assets/readme/app-store-qr.svg", import.meta.url),
  );
  for (const path of ["/", "/es/"]) {
    const page = new URL(path, origin);
    const response = await fetch(page);
    assert.equal(response.status, 200);
    const document = parse(await response.text());
    const qr = [...nodes(document)].find(
      (node) => attribute(node, "id") === "app-store-qr",
    );
    assert(qr, `${path}: missing QR`);
    const image = await fetch(new URL(attribute(qr, "src"), page));
    assert.equal(image.status, 200);
    assert.match(image.headers.get("content-type"), /^image\/svg\+xml/);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), original);
  }
  console.log("Dev checks passed: shared QR loads unchanged from / and /es/.");
} finally {
  await server.close();
}
