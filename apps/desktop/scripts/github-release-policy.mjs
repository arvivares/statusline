import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// GitHub visibility is independent of product maturity and platform signing.
// A Latest release can still contain explicitly labelled beta Windows previews.
export function githubReleasePolicy(metadata) {
  const prerelease = metadata.distribution?.publishPrerelease;
  if (typeof prerelease !== "boolean") {
    throw new Error(
      "GitHub release visibility requires explicit publishPrerelease boolean",
    );
  }
  return { prerelease, latest: !prerelease };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const metadata = JSON.parse(await readFile(resolve("release.json"), "utf8"));
  console.log(JSON.stringify(githubReleasePolicy(metadata)));
}
