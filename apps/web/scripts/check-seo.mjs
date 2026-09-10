import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse, parseFragment, serialize } from "parse5";
import { nodes, attribute } from "./render-html.mjs";
import { staticMessages } from "../src/static-messages.ts";
import {
  publicPageIDs,
  publicPagePath,
} from "../../../content/public-pages.ts";
import { validatePublicPages } from "./check-public-pages.mjs";
import { platformMessages } from "../src/messages.ts";
import {
  appStoreUrl,
  brandAssetVersion,
  languagePaths,
  pageMetadata,
  platformLinks,
  repository,
  siteOrigin,
} from "../src/site.ts";

const text = (node) =>
  node.nodeName === "#text"
    ? node.value
    : (node.childNodes ?? []).map(text).join("");

function validateIconLinks(elements) {
  for (const expected of [
    { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
    {
      rel: "icon",
      type: "image/png",
      sizes: "16x16",
      href: "/favicon-16x16.png",
    },
    {
      rel: "icon",
      type: "image/png",
      sizes: "32x32",
      href: "/favicon-32x32.png",
    },
    {
      rel: "icon",
      type: "image/svg+xml",
      sizes: "any",
      href: "/assets/statusline-mark.svg",
    },
    {
      rel: "apple-touch-icon",
      sizes: "180x180",
      href: "/apple-touch-icon.png",
    },
  ]) {
    expected.href += `?v=${brandAssetVersion}`;
    const matches = elements.filter(
      (node) =>
        node.tagName === "link" &&
        Object.entries(expected).every(
          ([name, value]) => attribute(node, name) === value,
        ),
    );
    assert.equal(
      matches.length,
      1,
      `Missing or duplicate icon: ${expected.href}`,
    );
  }
}

async function validateBrandAssets(outDir) {
  for (const [asset, width, height] of [
    ["favicon-16x16.png", 16, 16],
    ["favicon-32x32.png", 32, 32],
    ["apple-touch-icon.png", 180, 180],
    ["assets/statusline-mark.png", 512, 512],
    ["assets/social-card-en.png", 1200, 630],
    ["assets/social-card.png", 1200, 630],
  ]) {
    const bytes = await readFile(resolve(outDir, asset));
    assert.equal(
      bytes.subarray(0, 8).toString("hex"),
      "89504e470d0a1a0a",
      asset,
    );
    assert.equal(bytes.readUInt32BE(16), width, `${asset}: width`);
    assert.equal(bytes.readUInt32BE(20), height, `${asset}: height`);
  }
  const ico = await readFile(resolve(outDir, "favicon.ico"));
  assert.equal(ico.readUInt16LE(0), 0, "Invalid ICO header");
  assert.equal(ico.readUInt16LE(2), 1, "Invalid ICO image type");
  const sizes = [];
  for (let index = 0; index < ico.readUInt16LE(4); index++) {
    const entry = 6 + index * 16;
    sizes.push(ico[entry] || 256);
    assert.equal(ico[entry], ico[entry + 1], "Favicon frame must be square");
    assert(
      ico.readUInt32LE(entry + 12) + ico.readUInt32LE(entry + 8) <= ico.length,
      "Truncated ICO image",
    );
  }
  assert(
    sizes.includes(16) && sizes.includes(32),
    "Missing ICO fallback sizes",
  );
  for (const asset of ["statusline-symbol.svg", "statusline-mark.svg"]) {
    const svg = await readFile(resolve(outDir, "assets", asset), "utf8");
    assert(svg.includes("<svg") && svg.includes("viewBox="), asset);
  }
}

async function validateAppStoreDownload(elements, language, outDir) {
  assert.equal(
    appStoreUrl,
    "https://apps.apple.com/app/statusline/id6807851320",
    "Use the approved public App Store listing",
  );
  assert.equal(platformLinks.ios, appStoreUrl);
  assert.equal(platformLinks.android, `${repository}/releases`);
  assert.equal(
    platformMessages[language].ios.badge,
    staticMessages[language]["availability.iosStatus"],
    "Interactive and static iPhone availability must agree",
  );
  const images = elements.filter(
    (node) => attribute(node, "id") === "app-store-qr",
  );
  assert.equal(
    images.length,
    1,
    "One download QR must exist without JavaScript",
  );
  const qr = images[0];
  assert.equal(qr.tagName, "img");
  assert.equal(attribute(qr, "width"), "245");
  assert.equal(attribute(qr, "height"), "245");
  assert.equal(
    attribute(qr, "alt"),
    staticMessages[language]["appStore.qrAlt"],
  );
  const src = attribute(qr, "src");
  assert.match(src, /^\/assets\/app-store-qr-[\w-]+\.svg$/);
  const original = await readFile(
    new URL("../../../docs/assets/readme/app-store-qr.svg", import.meta.url),
  );
  const bundled = await readFile(resolve(outDir, `.${src}`));
  assert.deepEqual(
    bundled,
    original,
    "Preserve the canonical branded QR exactly",
  );
  assert(original.toString().includes(appStoreUrl));

  const cta = elements.find(
    (node) => attribute(node, "id") === "app-store-download",
  );
  const iosRow = elements.find(
    (node) => attribute(node, "data-availability-platform") === "ios",
  );
  assert(iosRow, "iPhone must remain in the no-JavaScript platform table");
  const tableLink = [...nodes(iosRow)].find((node) => node.tagName === "a");
  for (const link of [qr.parentNode, cta, tableLink]) {
    assert(link, "Missing App Store download link");
    assert.equal(link.tagName, "a");
    assert.equal(attribute(link, "href"), appStoreUrl);
    assert.equal(attribute(link, "rel"), "noopener noreferrer");
  }
}

export async function validateSEO(outDir) {
  await validateBrandAssets(outDir);
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
    validateIconLinks(elements);
    for (const link of elements.filter((node) =>
      attribute(node, "data-public-page"),
    )) {
      assert.equal(
        attribute(link, "href"),
        publicPagePath(attribute(link, "data-public-page"), language),
      );
    }
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
    await validateAppStoreDownload(elements, language, outDir);
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
    assert.equal(
      graph["@graph"].find((entry) => entry["@type"] === "SoftwareApplication")
        .image,
      `${siteOrigin}/assets/statusline-mark.png?v=${brandAssetVersion}`,
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
              ["stylesheet", "icon", "apple-touch-icon", "preload"].includes(
                attribute(element, "rel"),
              )
            ? attribute(element, "href")
            : null;
      if (asset?.startsWith("/"))
        assert(
          (
            await readFile(
              resolve(outDir, `.${new URL(asset, siteOrigin).pathname}`),
            )
          ).length > 0,
          asset,
        );
    }
    const errorHTML = await readFile(
      resolve(outDir, language === "en" ? "404.html" : "es/404.html"),
      "utf8",
    );
    const errorNodes = [...nodes(parse(errorHTML))];
    validateIconLinks(errorNodes);
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
  assert.deepEqual(
    locations.sort(),
    [
      `${siteOrigin}/`,
      `${siteOrigin}/es/`,
      ...["en", "es"].flatMap((language) =>
        publicPageIDs.map(
          (id) => `${siteOrigin}${publicPagePath(id, language)}`,
        ),
      ),
    ].sort(),
  );
  await validatePublicPages(outDir);
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
    "SEO checks passed: complete EN/ES HTML, metadata, reciprocal alternates, schema, platform table, App Store links and shared QR, brand icons, assets, 404s and crawl files.",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await validateSEO(resolve(process.argv[2] ?? "dist"));
}
