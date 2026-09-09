import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { initializeAnalytics, plausibleScriptUrl } from "../src/analytics.ts";
import { siteOrigin } from "../src/site.ts";

function replaceGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  });
}

function mockBrowser(t, origin = siteOrigin) {
  const scripts = [];
  const browser = { location: { origin } };
  replaceGlobal(t, "window", browser);
  replaceGlobal(t, "document", {
    getElementById: (id) => scripts.find((script) => script.id === id),
    createElement(tag) {
      assert.equal(tag, "script");
      return {};
    },
    head: {
      append(script) {
        assert.equal(typeof browser.plausible, "function");
        assert.equal(typeof browser.plausible.init, "function");
        assert.deepEqual(browser.plausible.o, {});
        scripts.push(script);
      },
    },
  });
  return { scripts, browser };
}

test("production initializes the official queue before loading one async script", (t) => {
  const { scripts, browser } = mockBrowser(t);
  initializeAnalytics(true, siteOrigin);
  initializeAnalytics(true, siteOrigin);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].async, true);
  assert.equal(scripts[0].src, plausibleScriptUrl);
  // No manual pageview: the remote tracker owns pageviews and language history.
  assert.equal(browser.plausible.q, undefined);
  browser.plausible("example", { props: { example: true } });
  assert.deepEqual(browser.plausible.q, [
    ["example", { props: { example: true } }],
  ]);
});

test("preserves any pre-existing queue", (t) => {
  const { browser } = mockBrowser(t);
  const existing = (...args) => existing.q.push(args);
  existing.q = [["example"]];
  browser.plausible = existing;
  initializeAnalytics(true, siteOrigin);
  assert.equal(browser.plausible, existing);
  assert.deepEqual(existing.q, [["example"]]);
});

test("development makes no analytics requests, even on the production origin", (t) => {
  const { scripts, browser } = mockBrowser(t);
  initializeAnalytics(false, siteOrigin);
  assert.deepEqual(scripts, []);
  assert.equal(browser.plausible, undefined);
});

for (const origin of [
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://[::1]:4173",
  "http://statusline.inmerzion.io",
  "https://preview.example.com",
  "https://statusline.inmerzion.io.example.com",
]) {
  test(`production previews on ${origin} do not load analytics`, (t) => {
    const { scripts, browser } = mockBrowser(t, origin);
    initializeAnalytics(true, siteOrigin);
    assert.deepEqual(scripts, []);
    assert.equal(browser.plausible, undefined);
  });
}

test("CSP allows only the configured tracker and event endpoint", async () => {
  const config = await readFile(
    new URL("../deploy/statusline.conf", import.meta.url),
    "utf8",
  );
  const policy = config.match(/Content-Security-Policy "([^"]+)" always;/)?.[1];
  assert(policy, "Production CSP must exist");
  const directives = new Map(
    policy.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
  assert.deepEqual(directives.get("script-src"), [
    "'self'",
    plausibleScriptUrl,
  ]);
  assert.deepEqual(directives.get("connect-src"), [
    "https://plausible.inmerzion.io/api/event",
  ]);
  for (const name of [
    "default-src",
    "object-src",
    "base-uri",
    "frame-ancestors",
  ])
    assert.deepEqual(directives.get(name), ["'none'"]);
});
