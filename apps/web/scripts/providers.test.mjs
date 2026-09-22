import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "parse5";
import { renderPage, nodes, attribute } from "./render-html.mjs";
import { staticMessages } from "../src/static-messages.ts";
import { structuredData } from "../src/site.ts";
import { renderPublicPage } from "./render-public-pages.mjs";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const content = (node) =>
  node.nodeName === "#text"
    ? node.value
    : (node.childNodes ?? []).map(content).join("");
for (const language of ["en", "es"]) {
  test(`${language}: all providers and boundaries are in crawlable, localized HTML`, () => {
    const elements = [...nodes(parse(renderPage(html, language)))];
    const cards = elements.filter((node) => attribute(node, "data-provider"));
    assert.deepEqual(
      cards.map((node) => attribute(node, "data-provider")),
      ["codex", "antigravity", "claude"],
    );
    for (const [index, id] of ["codex", "antigravity", "claude"].entries()) {
      for (const suffix of ["Label", "Description", "Requirement"]) {
        assert(
          content(cards[index]).includes(
            staticMessages[language][`providers.${id}${suffix}`],
          ),
        );
      }
    }
    const note = elements.find(
      (node) => attribute(node, "data-i18n") === "providers.note",
    );
    assert.equal(content(note), staticMessages[language]["providers.note"]);
    assert.match(
      content(note),
      language === "en"
        ? /Claude Code is desktop-only/
        : /Claude Code.*solo.*escritorio/,
    );
    const faq = staticMessages[language]["faq.agentsAnswer"];
    for (const name of ["Codex", "Antigravity", "Claude Code"]) {
      assert(faq.includes(name));
      assert(staticMessages[language]["meta.description"].includes(name));
    }
    const graph = structuredData(
      language,
      staticMessages[language]["meta.title"],
      staticMessages[language]["meta.description"],
    );
    const app = graph["@graph"].find(
      (item) => item["@type"] === "SoftwareApplication",
    );
    for (const name of ["Codex", "Antigravity", "Claude Code"])
      assert(app.description.includes(name));
    assert.equal(elements.filter((node) => node.tagName === "h1").length, 1);
  });
  test(`${language}: privacy and support cover Claude consent and mobile boundaries`, () => {
    const privacy = renderPublicPage("privacy", language);
    assert(privacy.includes("statusLine"));
    assert(privacy.includes("Claude"));
    assert(
      !privacy.includes("Companion-only release") &&
        !privacy.includes("entrega exclusiva de Companion"),
    );
    const support = renderPublicPage("support", language);
    for (const name of ["Codex", "Antigravity", "Claude Code"])
      assert(support.includes(name));
  });
}
