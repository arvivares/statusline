import { build } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { renderPage, renderNotFound } from "./render-html.mjs";
import { notFoundMessages } from "../public/not-found-messages.js";
import { validateSEO } from "./check-seo.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--outDir")) {
  throw new Error("Usage: npm run build -- [--outDir output-directory]");
}
const outDir = resolve(root, args[1] ?? "dist");
const relativeRoot = relative(outDir, root);
if (
  relativeRoot === "" ||
  (!relativeRoot.startsWith("..") && !isAbsolute(relativeRoot))
) {
  throw new Error(
    "Build output must not be the application directory or one of its parents",
  );
}
// Vite does not empty external output directories. Stage in a new temporary
// directory, validate it, and only then publish its generated artifacts.
await build({ root, build: { outDir } });
const html = await readFile(resolve(outDir, "index.html"), "utf8");
const notFound = await readFile(resolve(outDir, "404.html"), "utf8");
await mkdir(resolve(outDir, "es"), { recursive: true });
await Promise.all([
  writeFile(resolve(outDir, "index.html"), renderPage(html, "en")),
  writeFile(resolve(outDir, "es/index.html"), renderPage(html, "es")),
  writeFile(
    resolve(outDir, "404.html"),
    renderNotFound(notFound, "en", notFoundMessages.en),
  ),
  writeFile(
    resolve(outDir, "es/404.html"),
    renderNotFound(notFound, "es", notFoundMessages.es),
  ),
]);
await validateSEO(outDir);
console.log(`Generated and validated English / and Spanish /es/ in ${outDir}`);
