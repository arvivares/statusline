#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function inventory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length === 0 || entries.some((entry) => !entry.isFile())) {
    throw new Error(
      "Release download must contain only regular assets in a nonempty flat directory",
    );
  }
  return entries.map((entry) => entry.name).sort();
}

async function digest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyReleaseDownload(
  expectedDirectory,
  downloadedDirectory,
) {
  const expected = await inventory(expectedDirectory);
  const downloaded = await inventory(downloadedDirectory);
  if (JSON.stringify(expected) !== JSON.stringify(downloaded))
    throw new Error("Remote release inventory differs from verified candidate");
  for (const name of expected) {
    if (
      (await digest(join(expectedDirectory, name))) !==
      (await digest(join(downloadedDirectory, name)))
    ) {
      throw new Error(`Remote release bytes differ for ${name}`);
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [, , expected, downloaded, ...extra] = process.argv;
  if (!expected || !downloaded || extra.length)
    throw new Error(
      "Usage: verify-release-download.mjs <verified-candidate> <downloaded-release>",
    );
  await verifyReleaseDownload(expected, downloaded);
  console.log(
    "Every remote release asset matches the verified candidate byte for byte.",
  );
}
