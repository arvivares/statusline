import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { verifyReleaseDownload } from "./verify-release-download.mjs";

let root;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

it("requires identical remote names and bytes including the updater manifest", async () => {
  root = await mkdtemp(join(tmpdir(), "statusline-release-download-"));
  const expected = join(root, "expected");
  const remote = join(root, "remote");
  await mkdir(expected);
  await mkdir(remote);
  for (const directory of [expected, remote]) {
    await writeFile(join(directory, "updater.json"), "manifest");
    await writeFile(join(directory, "payload.AppImage.sig"), "signature");
  }
  await expect(
    verifyReleaseDownload(expected, remote),
  ).resolves.toBeUndefined();
  await writeFile(join(remote, "updater.json"), "changed!");
  await expect(verifyReleaseDownload(expected, remote)).rejects.toThrow(
    "bytes differ for updater.json",
  );
  await rm(join(remote, "payload.AppImage.sig"));
  await expect(verifyReleaseDownload(expected, remote)).rejects.toThrow(
    "inventory differs",
  );
});
