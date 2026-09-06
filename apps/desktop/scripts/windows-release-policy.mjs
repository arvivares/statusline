import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function windowsReleasePolicy(metadata) {
  const distribution = metadata.distribution;
  if (!Array.isArray(distribution?.githubReleasePlatforms)) {
    throw new Error(
      "Windows release policy requires explicit release platforms",
    );
  }
  const enabled = distribution.githubReleasePlatforms.includes("windows");
  const mode = distribution.windowsSigning;
  if (!enabled) {
    if (mode !== undefined) {
      throw new Error("Windows signing mode requires Windows distribution");
    }
    return "disabled";
  }
  if (distribution.deferred?.windows !== undefined) {
    throw new Error("Windows cannot be both enabled and deferred");
  }
  if (mode === "signpath") return mode;
  if (mode !== "unsigned-preview") {
    throw new Error(
      "Windows requires explicit signpath or unsigned-preview policy",
    );
  }
  if (metadata.channel !== "beta" || distribution.publishPrerelease !== true) {
    throw new Error(
      "Unsigned Windows installers are restricted to beta prereleases",
    );
  }
  return mode;
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const metadata = JSON.parse(await readFile(resolve("release.json"), "utf8"));
  console.log(windowsReleasePolicy(metadata));
}
