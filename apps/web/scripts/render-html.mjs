import { parse, parseFragment, serialize } from "parse5";
import { staticMessages } from "../src/static-messages.ts";
import { publicPagePath } from "../../../content/public-pages.ts";
import { interfaceMessages, platformMessages } from "../src/messages.ts";
import {
  languagePaths,
  pageMetadata,
  structuredData,
  siteOrigin,
} from "../src/site.ts";

export function* nodes(node) {
  yield node;
  for (const child of node.childNodes ?? []) yield* nodes(child);
}

export function attribute(node, name) {
  return node?.attrs?.find((attr) => attr.name === name)?.value;
}

export function setAttribute(node, name, value) {
  const current = node.attrs.find((attr) => attr.name === name);
  if (current) current.value = value;
  else node.attrs.push({ name, value });
}

export function setText(node, value) {
  node.childNodes = [{ nodeName: "#text", value, parentNode: node }];
}

function appendElement(parent, tag, attrs = {}) {
  const element = {
    nodeName: tag,
    tagName: tag,
    namespaceURI: "http://www.w3.org/1999/xhtml",
    attrs: Object.entries(attrs).map(([name, value]) => ({ name, value })),
    childNodes: [],
    parentNode: parent,
  };
  parent.childNodes.push(element);
  return element;
}

export function renderPage(html, language) {
  const document = parse(html);
  const elements = [...nodes(document)].filter((node) => node.tagName);
  const head = elements.find((node) => node.tagName === "head");
  const messages = staticMessages[language];
  const ui = interfaceMessages[language];
  const metadata = pageMetadata(language);
  const bindings = [
    ["data-i18n", "text"],
    ["data-i18n-html", "html"],
    ["data-i18n-aria-label", "aria-label"],
    ["data-i18n-content", "content"],
    ["data-i18n-title", "title"],
    ["data-i18n-alt", "alt"],
  ];
  for (const element of elements) {
    for (const [binding, target] of bindings) {
      const key = attribute(element, binding);
      if (!key) continue;
      if (typeof messages[key] !== "string")
        throw new Error(`Missing ${language} translation: ${key}`);
      if (target === "text") setText(element, messages[key]);
      else if (target === "html") {
        element.childNodes = parseFragment(element, messages[key]).childNodes;
        for (const child of element.childNodes) child.parentNode = element;
      } else setAttribute(element, target, messages[key]);
    }
  }
  setAttribute(
    elements.find((node) => node.tagName === "html"),
    "lang",
    language,
  );
  for (const link of elements.filter((node) =>
    attribute(node, "data-public-page"),
  )) {
    setAttribute(
      link,
      "href",
      publicPagePath(attribute(link, "data-public-page"), language),
    );
  }
  const byId = (id) => elements.find((node) => attribute(node, "id") === id);
  const platform = platformMessages[language].macos;
  for (const [id, content] of Object.entries({
    "demo-status": ui.quotaAvailable,
    "demo-window-label": ui.weeklyLabel,
    "motion-label": ui.motionPause,
    "platform-title": platform.title,
    "platform-badge": platform.badge,
    "platform-description": platform.description,
    "platform-requirement": platform.requirement,
    "platform-link-label": platform.cta,
  }))
    setText(byId(id), content);
  setAttribute(
    byId("quota-slider"),
    "aria-valuetext",
    ui.quotaValue.replace("{value}", "73").replace("{window}", ui.weeklyWindow),
  );
  setAttribute(
    elements.find((node) =>
      attribute(node, "class")?.split(" ").includes("menu-toggle"),
    ),
    "aria-label",
    ui.menuOpen,
  );
  setAttribute(
    elements.find((node) =>
      attribute(node, "class")?.split(" ").includes("motion-toggle"),
    ),
    "aria-label",
    ui.motionDisable,
  );
  for (const link of elements.filter((node) =>
    attribute(node, "data-language"),
  )) {
    const target = attribute(link, "data-language");
    setAttribute(link, "href", languagePaths[target]);
    link.attrs = link.attrs.filter(
      (attr) => !["aria-current", "aria-pressed"].includes(attr.name),
    );
    if (target === language) setAttribute(link, "aria-current", "true");
  }
  const setMeta = (kind, key, content, messageKey) => {
    if (typeof content !== "string")
      throw new Error(`Missing metadata: ${key} (${language})`);
    const meta =
      elements.find(
        (node) => node.tagName === "meta" && attribute(node, kind) === key,
      ) ?? appendElement(head, "meta", { [kind]: key });
    setAttribute(meta, "content", content);
    if (messageKey) setAttribute(meta, "data-i18n-content", messageKey);
  };
  setMeta("name", "robots", "index,follow,max-image-preview:large");
  setMeta("property", "og:site_name", "Statusline");
  setMeta("property", "og:url", metadata.canonical);
  setMeta("property", "og:locale", metadata.locale);
  setMeta("property", "og:locale:alternate", metadata.alternateLocale);
  setMeta("property", "og:image", metadata.image);
  setMeta(
    "property",
    "og:image:alt",
    messages["meta.imageAlt"],
    "meta.imageAlt",
  );
  setMeta("name", "twitter:title", messages["meta.title"], "meta.title");
  setMeta(
    "name",
    "twitter:description",
    messages["meta.socialDescription"],
    "meta.socialDescription",
  );
  setMeta("name", "twitter:image", metadata.image);
  setMeta(
    "name",
    "twitter:image:alt",
    messages["meta.imageAlt"],
    "meta.imageAlt",
  );
  setAttribute(
    elements.find(
      (node) =>
        node.tagName === "link" && attribute(node, "rel") === "canonical",
    ),
    "href",
    metadata.canonical,
  );
  head.childNodes = head.childNodes.filter(
    (node) => !(node.tagName === "link" && attribute(node, "hreflang")),
  );
  for (const [locale, path] of Object.entries({
    ...languagePaths,
    "x-default": "/",
  })) {
    appendElement(head, "link", {
      rel: "alternate",
      hreflang: locale,
      href: `${siteOrigin}${path}`,
    });
  }
  let schema = byId("structured-data");
  if (!schema)
    schema = appendElement(head, "script", {
      id: "structured-data",
      type: "application/ld+json",
    });
  setText(
    schema,
    JSON.stringify(
      structuredData(
        language,
        messages["meta.title"],
        messages["meta.description"],
      ),
    ).replace(/</g, "\\u003c"),
  );
  return serialize(document);
}

export function renderNotFound(html, language, messages) {
  const document = parse(html);
  for (const node of nodes(document)) {
    if (node.tagName === "html") setAttribute(node, "lang", language);
    if (node.tagName === "title") setText(node, messages.title);
    const key = attribute(node, "data-message");
    if (key) {
      if (!messages[key]) throw new Error(`Missing 404 translation: ${key}`);
      setText(node, messages[key]);
      if (key === "back") setAttribute(node, "href", languagePaths[language]);
    }
    if (attribute(node, "class") === "language-switch")
      setAttribute(node, "aria-label", messages.language);
    if (attribute(node, "data-language"))
      setAttribute(
        node,
        "aria-pressed",
        String(attribute(node, "data-language") === language),
      );
  }
  return serialize(document);
}
