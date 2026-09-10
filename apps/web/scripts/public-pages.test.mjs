import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  publicPageIDs,
  publicPageMatch,
  publicPagePath,
  publicSiteOrigin,
} from "../../../content/public-pages.ts";
import { siteOrigin } from "../src/site.ts";
import { renderPublicPage } from "./render-public-pages.mjs";
import { validatePublicDocument } from "./check-public-pages.mjs";

test("public information and the landing page use the same canonical origin", () => {
  assert.equal(publicSiteOrigin, siteOrigin);
});

for (const language of ["en", "es"]) {
  for (const id of publicPageIDs) {
    test(`${language}/${id} works as a complete static document`, () => {
      const path = publicPagePath(id, language);
      assert.deepEqual(publicPageMatch(path), { id, language });
      assert.deepEqual(publicPageMatch(`${path}/`), { id, language });
      validatePublicDocument(renderPublicPage(id, language), id, language);
    });
  }
}

test("only explicit public page paths are accepted", () => {
  for (const path of [
    "/",
    "/v1/channels",
    "/health",
    "/privacy/other",
    "//example.com/privacy",
    "/__proto__",
    "/constructor",
    "/es/support//",
  ]) {
    assert.equal(publicPageMatch(path), null, path);
  }
});

test("iOS and Android public links are independent of configured relays", async () => {
  const swift = await readFile(
    new URL("../../apple/statusline/ContentView.swift", import.meta.url),
    "utf8",
  );
  const helper = swift
    .split("private enum StatuslinePublicPage {")[1]
    .split("private struct StatuslineLegalFooter")[0];
  assert(helper.includes('"https://statusline.inmerzion.io"'));
  assert(!helper.includes("StatusRelayConfiguration"));
  assert(helper.includes('L10n.language == "es"'));
  const android = await readFile(
    new URL(
      "../../android/app/src/main/java/inmerzion/statusline/MainActivity.kt",
      import.meta.url,
    ),
    "utf8",
  );
  const openPage = android
    .split("private fun openPublicPage")[1]
    .split("private fun consumePairingUri")[0];
  assert(openPage.includes("https://statusline.inmerzion.io"));
  assert(!openPage.includes("RELAY_BASE_URL"));
  assert(openPage.includes('L10n.locale.language == "es"'));
});
