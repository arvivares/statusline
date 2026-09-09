#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const relevantFiles = new Set([
  ".github/workflows/website.yml",
  ".github/dependabot.yml",
  "scripts/website-ci.mjs",
  "scripts/website-ci.test.mjs",
  "scripts/generate-brand-assets.mjs",
  "docs/assets/readme/app-store-qr.svg",
  ".editorconfig",
  ".node-version",
]);

export function isWebsitePath(path) {
  return (
    path.startsWith("apps/web/") ||
    path.startsWith("branding/") ||
    relevantFiles.has(path)
  );
}

export function detectWebsiteScope(env, runGit = execFileSync) {
  if (["push", "workflow_dispatch"].includes(env.EVENT_NAME)) {
    return true;
  }
  if (env.EVENT_NAME !== "pull_request") {
    throw new Error("Unsupported website workflow event.");
  }
  if (
    !/^[0-9a-f]{40}$/.test(env.BASE_SHA ?? "") ||
    !/^[0-9a-f]{40}$/.test(env.HEAD_SHA ?? "")
  ) {
    throw new Error("Invalid pull request commit metadata.");
  }

  // Compare against the merge base, and retain deletions and both sides of
  // renames. NUL separators preserve filenames containing whitespace/newlines.
  // A failed diff throws: unavailable history must never mean 'no changes'.
  const paths = runGit(
    "git",
    [
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      `${env.BASE_SHA}...${env.HEAD_SHA}`,
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return paths.split("\0").some(isWebsitePath);
}

export function websiteValidationPassed(env) {
  if (env.SCOPE_RESULT !== "success") {
    return false;
  }
  return (
    (env.SHOULD_RUN === "true" && env.VALIDATION_RESULT === "success") ||
    (env.SHOULD_RUN === "false" && env.VALIDATION_RESULT === "skipped")
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const mode = process.argv[2];
  if (mode === "scope") {
    const shouldRun = detectWebsiteScope(process.env);
    if (!process.env.GITHUB_OUTPUT) {
      throw new Error("GITHUB_OUTPUT is required to report website scope.");
    }
    appendFileSync(process.env.GITHUB_OUTPUT, `should_run=${shouldRun}\n`);
    console.log(`Website validation needed: ${shouldRun}`);
  } else if (mode === "gate") {
    if (!websiteValidationPassed(process.env)) {
      throw new Error("Website scope detection or validation did not pass.");
    }
    console.log(
      process.env.SHOULD_RUN === "true"
        ? "Website validation passed."
        : "No website changes; production build intentionally skipped.",
    );
  } else {
    throw new Error("Usage: node scripts/website-ci.mjs <scope|gate>");
  }
}
