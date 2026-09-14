import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const policy = readFileSync(
  new URL("../.github/dependabot.yml", import.meta.url),
  "utf8",
);
const blocks = policy.split(/(?=^  - package-ecosystem:)/m);
const block = (ecosystem) =>
  blocks.find((entry) =>
    entry.startsWith(`  - package-ecosystem: ${ecosystem}\n`),
  );

test("Cargo monitors production and the lightweight runtime harness together", () => {
  const cargo = block("cargo");
  assert.match(
    cargo,
    /runtime-major-updates:\n        group-by: dependency-name\n        update-types:\n          - major/,
  );
  assert.match(
    cargo,
    /directories:\n      - \/apps\/desktop\/src-tauri\n      - \/apps\/desktop\/runtime-tests/,
  );
  assert.equal(
    blocks.filter((entry) => entry.startsWith("  - package-ecosystem: cargo\n"))
      .length,
    1,
  );
});

test("Actions patch/minor updates cannot absorb signing major upgrades", () => {
  const actions = block("github-actions");
  assert.match(actions, /update-types:\n          - minor\n          - patch/);
  assert.doesNotMatch(actions, /- major|ignore:/);
});

test("CI tests the production Vite build without producing installers", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/repository-quality.yml", import.meta.url),
    "utf8",
  );
  assert.match(
    workflow,
    /Build companion frontend without native installers\n        run: npm run build\n        working-directory: apps\/desktop/,
  );
});
