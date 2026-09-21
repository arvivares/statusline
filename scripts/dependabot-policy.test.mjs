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

test("both SignPath stages use the reviewed v3 commit and retain explicit opt-in", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/desktop-installers.yml", import.meta.url),
    "utf8",
  );
  const preflight = readFileSync(
    new URL("../apps/desktop/scripts/check-release.mjs", import.meta.url),
    "utf8",
  );
  const action =
    "signpath/github-action-submit-signing-request@f6d04783b4569d051e0c80105fe66e82819d0092";
  const steps = workflow
    .split("\n      - name: ")
    .filter((step) =>
      /^Sign Windows (application|installers) through SignPath\n/u.test(step),
    );
  assert.equal(steps.length, 2);
  assert.ok(preflight.includes(action));
  assert.match(workflow, /permissions:\n  actions: read\n  contents: read/u);
  for (const step of steps) {
    assert.ok(step.includes(`uses: ${action} # v3.0`));
    assert.ok(
      step.includes(
        "if: runner.os == 'Windows' && env.WINDOWS_SIGNED_BUILD == 'true'",
      ),
    );
    assert.ok(step.includes("api-token: ${{ secrets.SIGNPATH_API_TOKEN }}"));
    assert.ok(step.includes("wait-for-completion: true"));
    assert.ok(step.includes('wait-for-completion-timeout-in-seconds: "3600"'));
    assert.ok(step.includes("output-artifact-directory: ${{ runner.temp }}/"));
    assert.doesNotMatch(
      step,
      /continue-on-error:|connector-url:|github-token:/u,
    );
  }
  assert.ok(
    steps[0].includes(
      "github-artifact-id: ${{ steps.signpath-application-input.outputs.artifact-id }}",
    ),
  );
  assert.ok(
    steps[1].includes(
      "github-artifact-id: ${{ steps.signpath-installers-input.outputs.artifact-id }}",
    ),
  );
});
