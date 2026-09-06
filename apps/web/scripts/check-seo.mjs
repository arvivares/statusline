import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse, parseFragment, serialize } from "parse5";
import { nodes, attribute } from "./render-html.mjs";
import { staticMessages } from "../src/static-messages.ts";
import { languagePaths, pageMetadata, siteOrigin } from "../src/site.ts";

const text = (node) =>
  node.nodeName === "#text"
    ? node.value
    : (node.childNodes ?? []).map(text).join("");

export async function validateSEO(outDir) {
  assert.deepEqual(
    Object.keys(staticMessages.en).sort(),
    Object.keys(staticMessages.es).sort(),
    "Locale catalogs differ",
  );
  for (const language of ["en", "es"]) {
    const html = await readFile(
      resolve(outDir, language === "en" ? "index.html" : "es/index.html"),
      "utf8",
    );
    const document = parse(html);
    const elements = [...nodes(document)].filter((node) => node.tagName);
    const meta = (key) =>
      attribute(
        elements.find(
          (node) =>
            node.tagName === "meta" &&
            (attribute(node, "name") === key ||
              attribute(node, "property") === key),
        ),
        "content",
      );
    const canonical = pageMetadata(language).canonical;
    assert.equal(
      attribute(
        elements.find((node) => node.tagName === "html"),
        "lang",
      ),
      language,
    );
    assert.equal(
      text(elements.find((node) => node.tagName === "title")),
      staticMessages[language]["meta.title"],
    );
    assert.equal(
      meta("description"),
      staticMessages[language]["meta.description"],
    );
    assert.equal(elements.filter((node) => node.tagName === "h1").length, 1);
    assert.equal(
      elements.filter(
        (node) =>
          node.tagName === "link" && attribute(node, "rel") === "canonical",
      ).length,
      1,
    );
    assert.equal(
      attribute(
        elements.find((node) => attribute(node, "rel") === "canonical"),
        "href",
      ),
      canonical,
    );
    assert.equal(meta("og:url"), canonical);
    assert.equal(meta("og:image"), pageMetadata(language).image);
    assert.equal(meta("twitter:image"), pageMetadata(language).image);
    assert.equal(meta("twitter:title"), staticMessages[language]["meta.title"]);
    assert(!meta("robots").includes("noindex"));
    const alternates = elements.filter(
      (node) => node.tagName === "link" && attribute(node, "hreflang"),
    );
    assert.equal(alternates.length, 3);
    for (const [locale, path] of Object.entries({
      ...languagePaths,
      "x-default": "/",
    })) {
      assert.equal(
        attribute(
          alternates.find((node) => attribute(node, "hreflang") === locale),
          "href",
        ),
        `${siteOrigin}${path}`,
      );
    }
    for (const element of elements) {
      for (const [binding, target] of [
        ["data-i18n", "text"],
        ["data-i18n-html", "html"],
        ["data-i18n-content", "content"],
        ["data-i18n-aria-label", "aria-label"],
        ["data-i18n-alt", "alt"],
        ["data-i18n-title", "title"],
      ]) {
        const key = attribute(element, binding);
        if (!key) continue;
        const expected = staticMessages[language][key];
        assert.equal(typeof expected, "string", `${language}: missing ${key}`);
        if (target === "text")
          assert.equal(text(element), expected, `${language}: ${key}`);
        else if (target === "html")
          assert.equal(
            serialize(element),
            serialize(parseFragment(element, expected)),
            `${language}: ${key}`,
          );
        else
          assert.equal(
            attribute(element, target),
            expected,
            `${language}: ${key}`,
          );
      }
    }
    const languageLinks = elements.filter((node) =>
      attribute(node, "data-language"),
    );
    assert.equal(languageLinks.length, 2);
    for (const link of languageLinks) {
      const locale = attribute(link, "data-language");
      assert.equal(link.tagName, "a");
      assert.equal(attribute(link, "href"), languagePaths[locale]);
      assert.equal(
        attribute(link, "aria-current"),
        locale === language ? "true" : undefined,
      );
    }
    const tables = elements.filter(
      (node) => attribute(node, "data-platform-table") !== undefined,
    );
    assert.equal(tables.length, 1);
    const rows = [...nodes(tables[0])]
      .filter((node) => node.tagName === "tbody")
      .flatMap((body) =>
        [...nodes(body)].filter((node) => node.tagName === "tr"),
      );
    assert.equal(
      rows.length,
      5,
      "Five platform rows must be present without JavaScript",
    );
    const json = elements.filter(
      (node) =>
        node.tagName === "script" &&
        attribute(node, "type") === "application/ld+json",
    );
    assert.equal(json.length, 1);
    const graph = JSON.parse(text(json[0]));
    assert.equal(graph["@context"], "https://schema.org");
    for (const type of [
      "Organization",
      "WebSite",
      "SoftwareApplication",
      "WebPage",
    ])
      assert(graph["@graph"].some((entry) => entry["@type"] === type));
    assert.equal(
      graph["@graph"].find((entry) => entry["@type"] === "WebPage").url,
      canonical,
    );
    assert(
      !text(json[0]).includes('"aggregateRating"'),
      "Do not fabricate ratings",
    );
    assert(!html.includes("/src/main.ts") && !html.includes("/src/styles.css"));
    for (const element of elements) {
      const asset =
        element.tagName === "script"
          ? attribute(element, "src")
          : element.tagName === "link" &&
              ["stylesheet", "icon", "preload"].includes(
                attribute(element, "rel"),
              )
            ? attribute(element, "href")
            : null;
      if (asset?.startsWith("/"))
        assert(
          (await readFile(resolve(outDir, `.${asset}`))).length > 0,
          asset,
        );
    }
    const errorHTML = await readFile(
      resolve(outDir, language === "en" ? "404.html" : "es/404.html"),
      "utf8",
    );
    const errorNodes = [...nodes(parse(errorHTML))];
    assert.equal(
      attribute(
        errorNodes.find((node) => node.tagName === "html"),
        "lang",
      ),
      language,
    );
    assert.equal(
      attribute(
        errorNodes.find((node) => attribute(node, "name") === "robots"),
        "content",
      ),
      "noindex",
    );
    assert.equal(
      attribute(
        errorNodes.find((node) => attribute(node, "data-message") === "back"),
        "href",
      ),
      languagePaths[language],
    );
  }
  const sitemap = await readFile(resolve(outDir, "sitemap.xml"), "utf8");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(locations.sort(), [`${siteOrigin}/`, `${siteOrigin}/es/`]);
  const robots = await readFile(resolve(outDir, "robots.txt"), "utf8");
  assert(robots.includes(`Sitemap: ${siteOrigin}/sitemap.xml`));
  assert(!/^Disallow:\s*\/$/m.test(robots));
  const llms = await readFile(resolve(outDir, "llms.txt"), "utf8");
  assert(llms.startsWith("# Statusline"));
  assert(
    llms.includes(`${siteOrigin}/es/`) &&
      llms.includes("https://github.com/arvivares/statusline"),
  );
  console.log(
    "SEO checks passed: complete EN/ES HTML, metadata, reciprocal alternates, schema, platform table, assets, 404s and crawl files.",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await validateSEO(resolve(process.argv[2] ?? "dist"));
}
