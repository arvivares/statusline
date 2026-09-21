import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const nodeVersion = read(".node-version").trim();
const major = Number(nodeVersion.split(".")[0]);
const projects = ["apps/desktop", "apps/web", "branding", "services/relay"];

test("the shared Node toolchain pins an exact version", () => {
  assert.match(nodeVersion, /^\d+\.\d+\.\d+$/u);
  assert.equal(major, 26);
});

test("npm manifests and lockfiles agree on the tested Node range", () => {
  for (const project of projects) {
    const manifest = JSON.parse(read(`${project}/package.json`));
    const lock = JSON.parse(read(`${project}/package-lock.json`));
    assert.equal(
      manifest.engines.node,
      `>=${nodeVersion} <${major + 1}`,
      project,
    );
    assert.equal(
      lock.packages[""].engines.node,
      manifest.engines.node,
      project,
    );
    assert.equal(manifest.packageManager, "npm@11.19.1", project);
  }
});

test("relay type declarations target the actual Node major", () => {
  const relay = JSON.parse(read("services/relay/package.json"));
  assert.equal(
    Number(relay.devDependencies["@types/node"].split(".")[0]),
    major,
  );
});

test("release workflows preserve their non-Node environment settings", () => {
  for (const [name, keys] of [
    ["release.yml", ["RUST_VERSION", "STATUSLINE_RELAY_BASE_URL"]],
    ["recover-release.yml", ["RUST_VERSION", "RELEASE_TAG", "SOURCE_RUN_ID"]],
  ]) {
    const workflow = read(`.github/workflows/${name}`);
    const environment = workflow.match(/^env:\n(?:  [^\n]+\n)+/mu)?.[0];
    assert.ok(environment, `${name}: top-level environment is required`);
    for (const key of keys) {
      assert.ok(environment.includes(`  ${key}:`), `${name}: ${key}`);
    }
  }
});

test("every setup-node step reads the shared version file", () => {
  let count = 0;
  for (const name of readdirSync(new URL(".github/workflows/", root))) {
    if (!/\.ya?ml$/u.test(name)) continue;
    const workflow = read(`.github/workflows/${name}`);
    const steps = workflow.split(/(?=^      - )/mu);
    for (const step of steps) {
      if (!/uses: actions\/setup-node@/u.test(step)) continue;
      count++;
      assert.match(step, /node-version-file: "\.node-version"/u, name);
      assert.doesNotMatch(step, /node-version:/u, name);
    }
    assert.doesNotMatch(workflow, /NODE_VERSION:/u, name);
  }
  assert.ok(count >= 15, "all existing Node setup steps must be inspected");
});

test("jobs invoking Node tooling do not rely on the runner's default Node", () => {
  for (const name of readdirSync(new URL(".github/workflows/", root))) {
    if (!/\.ya?ml$/u.test(name)) continue;
    const jobs = read(`.github/workflows/${name}`).split(
      /(?=^  [a-z][\w-]*:\n)/mu,
    );
    for (const job of jobs) {
      if (!job.includes("    steps:\n")) continue;
      if (!/\b(?:node|npm|npx) [^\n]/u.test(job)) continue;
      assert.match(
        job,
        /uses: actions\/setup-node@/u,
        `${name}: ${job.split("\n")[0]}`,
      );
    }
  }
});

test("CI runs the toolchain guard and cross-platform relay smoke checks", () => {
  const workflow = read(".github/workflows/repository-quality.yml");
  assert.ok(workflow.includes("scripts/node-toolchain.test.mjs"));
  assert.ok(workflow.includes("os: [ubuntu-22.04, macos-14, windows-latest]"));
  for (const command of [
    "npm run db:migrate:local",
    "npx wrangler deploy --dry-run",
    "npm test",
    "npm run build",
  ]) {
    assert.ok(workflow.split("  codex-runtime:")[0].includes(command), command);
  }
});
