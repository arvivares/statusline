import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(
  await readFile(path.join(root, "localization/messages.json"), "utf8"),
);
execFileSync(
  process.execPath,
  [path.join(root, "scripts/generate-localizations.mjs"), "--check"],
  { stdio: "inherit" },
);

async function sources(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, item.name);
    if (
      item.isDirectory() &&
      !["build", "target", "node_modules", ".gradle"].includes(item.name)
    ) {
      result.push(...(await sources(target)));
    } else if (item.isFile() && /\.(swift|kt|ts|rs|html)$/.test(item.name))
      result.push(target);
  }
  return result;
}

let checked = 0;
for (const directory of [
  "apps/apple",
  "apps/android/app/src",
  "apps/desktop/src",
  "apps/desktop/src-tauri/src",
]) {
  for (const file of await sources(path.join(root, directory))) {
    const source = await readFile(file, "utf8");
    if (/\.(swift|kt)$/.test(file) && !/Tests\/|\/test\//.test(file)) {
      for (const match of source.matchAll(
        /(?:\bText\(\s*|\btext\s*=\s*|\.accessibility(?:Label|Hint|Value)\(\s*)("(?:\\.|[^"\\])*")/g,
      )) {
        const value = JSON.parse(match[1]);
        if (
          !/^[\d\s%.:—-]*$/.test(value) &&
          !value.startsWith("statusline://")
        ) {
          throw new Error(
            `Unlocalized UI literal in ${path.relative(root, file)}: ${value}`,
          );
        }
      }
    }
    for (const match of source.matchAll(
      /(?:\bt|L10n\.(?:text|translate)|localization::text(?:_for_language)?)\(\s*("(?:\\.|[^"\\])*")/g,
    )) {
      const key = JSON.parse(match[1]);
      if (!Object.hasOwn(catalog, key))
        throw new Error(
          `Missing translation in ${path.relative(root, file)}: ${key}`,
        );
      checked++;
    }
  }
}
const html = await readFile(path.join(root, "apps/desktop/index.html"), "utf8");
for (const [, raw] of html.matchAll(
  /data-i18n(?:-(?:aria-label|alt|title))?="([^"]+)"/g,
)) {
  const key = raw.replaceAll("&quot;", '"').replaceAll("&amp;", "&");
  if (!Object.hasOwn(catalog, key))
    throw new Error(`Missing HTML translation: ${key}`);
  checked++;
}
console.log(
  `Localization: ${checked} source references resolve to the shared catalog.`,
);
