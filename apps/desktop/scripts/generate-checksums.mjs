#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const installerExtensions = new Set([
  ".appimage",
  ".deb",
  ".dmg",
  ".exe",
  ".msi",
  ".pkg",
  ".rpm",
]);

export async function generateChecksums(inputDirectory) {
  const files = await collectInstallerFiles(resolve(inputDirectory));
  if (files.length === 0) {
    throw new Error(`No installer files found in ${inputDirectory}`);
  }

  const seenNames = new Set();
  const records = [];
  for (const file of files) {
    const name = basename(file);
    if (seenNames.has(name)) {
      throw new Error(`Duplicate installer filename: ${name}`);
    }
    seenNames.add(name);
    records.push(`${await sha256(file)}  ${name}`);
  }
  return `${records.join("\n")}\n`;
}

async function collectInstallerFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectInstallerFiles(path)));
    } else if (
      entry.isFile() &&
      installerExtensions.has(extension(entry.name).toLowerCase())
    ) {
      files.push(path);
    }
  }
  return files.sort((left, right) =>
    basename(left).localeCompare(basename(right), "en"),
  );
}

function extension(filename) {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot);
}

function sha256(path) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", rejectHash);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

async function main() {
  const [, , inputDirectory, outputPath] = process.argv;
  if (!inputDirectory || !outputPath) {
    throw new Error(
      "Usage: node scripts/generate-checksums.mjs <installers> <output>",
    );
  }
  const checksums = await generateChecksums(inputDirectory);
  await writeFile(resolve(outputPath), checksums, "utf8");
  console.log(
    `Wrote ${checksums.trim().split("\n").length} SHA-256 checksums.`,
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
