import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { generateChecksums } from "./generate-checksums.mjs";

let testDirectory;

afterEach(async () => {
  if (testDirectory !== undefined) {
    await rm(testDirectory, { recursive: true, force: true });
    testDirectory = undefined;
  }
});

describe("generateChecksums", () => {
  it("hashes only installer files in deterministic filename order", async () => {
    testDirectory = await mkdtemp(join(tmpdir(), "statusline-checksums-"));
    await writeFile(join(testDirectory, "Statusline.msi"), "abc");
    await writeFile(join(testDirectory, "Statusline.exe"), "abc");
    await writeFile(join(testDirectory, "notes.txt"), "not an installer");

    const output = await generateChecksums(testDirectory);

    expect(output).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  Statusline.exe\n" +
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  Statusline.msi\n",
    );
  });

  it("fails rather than publishing an empty checksum manifest", async () => {
    testDirectory = await mkdtemp(join(tmpdir(), "statusline-checksums-"));

    await expect(generateChecksums(testDirectory)).rejects.toThrow(
      "No installer files found",
    );
  });
});
