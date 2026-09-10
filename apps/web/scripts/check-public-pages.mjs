import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "parse5";
import { attribute, nodes } from "./render-html.mjs";
import {
  publicPageIDs,
  publicPagePath,
  publicPageContent,
  publicSiteOrigin,
} from "../../../content/public-pages.ts";

export function validatePublicDocument(html, id, language) {
  const elements = [...nodes(parse(html))].filter((node) => node.tagName);
  const page = publicPageContent(id, language);
  const text = (node) =>
    node.nodeName === "#text"
      ? node.value
      : (node.childNodes ?? []).map(text).join("");
  const links = elements.filter((node) => node.tagName === "a");
  const find = (tag, attr, value) =>
    elements.find(
      (node) => node.tagName === tag && attribute(node, attr) === value,
    );
  assert.equal(
    attribute(
      elements.find((node) => node.tagName === "html"),
      "lang",
    ),
    language,
  );
  assert.equal(
    text(elements.find((node) => node.tagName === "title")),
    `${page.title} — Statusline`,
  );
  assert.equal(elements.filter((node) => node.tagName === "h1").length, 1);
  assert.equal(
    text(elements.find((node) => node.tagName === "h1")),
    page.title,
  );
  assert.equal(
    attribute(find("link", "rel", "canonical"), "href"),
    `${publicSiteOrigin}${publicPagePath(id, language)}`,
  );
  for (const locale of ["en", "es", "x-default"]) {
    assert.equal(
      attribute(find("link", "hreflang", locale), "href"),
      `${publicSiteOrigin}${publicPagePath(id, locale === "es" ? "es" : "en")}`,
    );
  }
  assert.equal(
    elements.filter((node) =>
      ["script", "iframe", "form"].includes(node.tagName),
    ).length,
    0,
  );
  assert(
    links.some(
      (link) => attribute(link, "href") === "mailto:founder@inmerzion.io",
    ),
  );
  const headings = [...page.content.matchAll(/<h2>([^<]+)<\/h2>/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    elements.filter((node) => node.tagName === "h2").map(text),
    headings,
  );
  for (const link of links) {
    const href = attribute(link, "href");
    assert(
      !href.includes("workers.dev"),
      "Public information must not depend on a relay host",
    );
    if (href.startsWith("#"))
      assert(
        elements.some((node) => attribute(node, "id") === href.slice(1)),
        href,
      );
  }
  for (const linkedID of publicPageIDs) {
    assert(
      links.some(
        (link) =>
          attribute(link, "href") === publicPagePath(linkedID, language),
      ),
    );
  }
}

export async function validatePublicPages(outDir) {
  for (const language of ["en", "es"]) {
    for (const id of publicPageIDs) {
      const path = publicPagePath(id, language);
      const html = await readFile(resolve(outDir, `.${path}.html`), "utf8");
      validatePublicDocument(html, id, language);
      assert.equal(
        await readFile(resolve(outDir, `.${path}/index.html`), "utf8"),
        html,
      );
    }
  }
  const css = await readFile(resolve(outDir, "information.css"), "utf8");
  for (const [, path] of css.matchAll(/url\("([^\"]+)"\)/g)) {
    assert((await readFile(resolve(outDir, `.${path}`))).length > 0, path);
  }
  console.log(
    "Public pages: 6 static EN/ES documents, directory aliases, navigation, metadata, fonts and no scripts verified.",
  );
}
