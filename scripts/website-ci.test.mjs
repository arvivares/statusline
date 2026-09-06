import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectWebsiteScope,
  isWebsitePath,
  websiteValidationPassed,
} from "./website-ci.mjs";

const pullRequest = {
  EVENT_NAME: "pull_request",
  BASE_SHA: "a".repeat(40),
  HEAD_SHA: "b".repeat(40),
};

test("website source, assets, tooling and shared configuration need validation", () => {
  for (const path of [
    "apps/web/src/main.ts",
    "apps/web/public/fonts/font.ttf",
    "apps/web/deploy/static.conf",
    "apps/web/package-lock.json",
    "apps/web/README.md",
    ".github/workflows/website.yml",
    ".github/dependabot.yml",
    "scripts/website-ci.mjs",
    "scripts/website-ci.test.mjs",
    ".editorconfig",
    ".node-version",
  ]) {
    assert.equal(isWebsitePath(path), true, path);
  }
});

test("unrelated changes do not rebuild the website", () => {
  const paths = [
    "README.md",
    "apps/android/app/build.gradle.kts",
    "apps/apple/statusline/ContentView.swift",
    "apps/desktop/package-lock.json",
    "services/relay/src/index.ts",
    "apps/web-other/index.html",
  ];
  for (const path of paths) assert.equal(isWebsitePath(path), false, path);
  assert.equal(
    detectWebsiteScope(pullRequest, () => paths.join("\0")),
    false,
  );
  assert.equal(
    detectWebsiteScope(pullRequest, () => ""),
    false,
  );
});

test("diff uses merge base, NUL separators and no rename detection", () => {
  const result = detectWebsiteScope(pullRequest, (command, args, options) => {
    assert.equal(command, "git");
    assert.deepEqual(args, [
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      `${pullRequest.BASE_SHA}...${pullRequest.HEAD_SHA}`,
    ]);
    assert.equal(options.encoding, "utf8");
    // Also covers the deleted web path when a file moves out of apps/web.
    return "docs/moved.html\0apps/web/old\npage.html\0";
  });
  assert.equal(result, true);
});

test("manual runs and relevant main pushes always validate", () => {
  for (const EVENT_NAME of ["push", "workflow_dispatch"]) {
    assert.equal(
      detectWebsiteScope({ EVENT_NAME }, () => assert.fail("Unexpected diff")),
      true,
    );
  }
});

test("missing or malformed metadata cannot skip validation", () => {
  for (const key of ["BASE_SHA", "HEAD_SHA"]) {
    for (const value of [undefined, "", "--help", "a".repeat(39)]) {
      assert.throws(
        () => detectWebsiteScope({ ...pullRequest, [key]: value }),
        /Invalid pull request commit metadata/,
      );
    }
  }
  assert.throws(() => detectWebsiteScope({}), /Unsupported/);
});

test("git errors are propagated, not converted to an empty change list", () => {
  assert.throws(
    () =>
      detectWebsiteScope(pullRequest, () => {
        throw new Error("Missing git history");
      }),
    /Missing git history/,
  );
});

test("required gate accepts only successful validation or a deliberate skip", () => {
  const results = ["success", "failure", "cancelled", "skipped", ""];
  const accepted = new Set(["success/true/success", "success/false/skipped"]);
  for (const SCOPE_RESULT of results) {
    for (const SHOULD_RUN of ["true", "false", "", "invalid"]) {
      for (const VALIDATION_RESULT of results) {
        const env = { SCOPE_RESULT, SHOULD_RUN, VALIDATION_RESULT };
        const expected = accepted.has(
          `${SCOPE_RESULT}/${SHOULD_RUN}/${VALIDATION_RESULT}`,
        );
        assert.equal(
          websiteValidationPassed(env),
          expected,
          JSON.stringify(env),
        );
      }
    }
  }
});
