#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([
  ".git",
  ".gradle",
  ".wrangler",
  "build",
  "DerivedData",
  "dist",
  "node_modules",
  "target",
]);

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      return [];
    }

    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return markdownFiles(absolutePath);
    }

    return entry.isFile() && extname(entry.name).toLowerCase() === ".md"
      ? [absolutePath]
      : [];
  });
}

function localTargets(markdown) {
  const targets = [];
  const markdownLink =
    /!?(?:\[[^\]]*\])\((<[^>]+>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\)/g;
  const htmlLink =
    /<(?:a|img)\b[^>]*\b(?:href|src)=(?:"([^"]+)"|'([^']+)')[^>]*>/gi;

  for (const match of markdown.matchAll(markdownLink)) {
    targets.push(match[1]);
  }
  for (const match of markdown.matchAll(htmlLink)) {
    targets.push(match[1] ?? match[2]);
  }

  return targets;
}

function cleanTarget(rawTarget) {
  const unwrapped =
    rawTarget.startsWith("<") && rawTarget.endsWith(">")
      ? rawTarget.slice(1, -1)
      : rawTarget;
  return unwrapped.split("#", 1)[0].split("?", 1)[0];
}

const failures = [];
let checkedLinks = 0;

for (const markdownPath of markdownFiles(repositoryRoot)) {
  const markdown = readFileSync(markdownPath, "utf8");

  for (const rawTarget of localTargets(markdown)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(rawTarget)) {
      continue;
    }

    const target = cleanTarget(rawTarget);
    if (!target) {
      continue;
    }

    let decodedTarget;
    try {
      decodedTarget = decodeURIComponent(target);
    } catch {
      failures.push(
        `${relative(repositoryRoot, markdownPath)}: malformed link ${rawTarget}`,
      );
      continue;
    }

    const absoluteTarget = decodedTarget.startsWith("/")
      ? resolve(repositoryRoot, `.${decodedTarget}`)
      : resolve(dirname(markdownPath), decodedTarget);
    const withinRepository =
      absoluteTarget === repositoryRoot ||
      absoluteTarget.startsWith(`${repositoryRoot}${sep}`);

    checkedLinks += 1;
    if (!withinRepository || !existsSync(absoluteTarget)) {
      failures.push(
        `${relative(repositoryRoot, markdownPath)}: missing target ${rawTarget}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${checkedLinks} local Markdown links.`);
}
