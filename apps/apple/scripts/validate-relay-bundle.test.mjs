import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const directory = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(directory, "validate-relay-bundle.sh");
const macOnly = { skip: process.platform !== "darwin" };
const defaults = {
  StatuslineRelayBaseURL: "https://relay.example",
  CFBundleShortVersionString: "1.0.1",
  CFBundleVersion: "6",
};
function plist(values) {
  const escape = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>${Object.entries(
    values,
  )
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `<key>${key}</key><string>${escape(value)}</string>`)
    .join("")}</dict></plist>`;
}

const cases = [
  { name: "matching custom HTTPS relay", pass: true },
  {
    name: "optional trailing slash",
    widget: { StatuslineRelayBaseURL: "https://relay.example/" },
    pass: true,
  },
  {
    name: "custom HTTPS port",
    app: { StatuslineRelayBaseURL: "https://relay.example:8443" },
    widget: { StatuslineRelayBaseURL: "https://relay.example:8443" },
    pass: true,
  },
  {
    name: "build-5 regression: empty widget relay",
    widget: { StatuslineRelayBaseURL: "" },
    error: /Widget relay endpoint is empty or invalid/,
  },
  {
    name: "missing widget relay key",
    widget: { StatuslineRelayBaseURL: undefined },
    error: /Missing StatuslineRelayBaseURL in widget/,
  },
  {
    name: "empty app relay",
    app: { StatuslineRelayBaseURL: "" },
    error: /App relay endpoint is empty or invalid/,
  },
  {
    name: "unexpanded build setting",
    widget: { StatuslineRelayBaseURL: "$(STATUSLINE_RELAY_BASE_URL)" },
    error: /Widget relay endpoint is empty or invalid/,
  },
  {
    name: "mismatched relay",
    widget: { StatuslineRelayBaseURL: "https://other.example" },
    error: /endpoints differ/,
  },
  {
    name: "HTTP forbidden in Release",
    app: { StatuslineRelayBaseURL: "http://localhost:8080" },
    error: /App relay endpoint is empty or invalid/,
  },
  {
    name: "HTTP loopback in Debug",
    configuration: "Debug",
    app: { StatuslineRelayBaseURL: "http://localhost:8080" },
    widget: { StatuslineRelayBaseURL: "http://localhost:8080" },
    pass: true,
  },
  {
    name: "HTTP non-loopback forbidden in Debug",
    configuration: "Debug",
    app: { StatuslineRelayBaseURL: "http://relay.example" },
    error: /App relay endpoint is empty or invalid/,
  },
  ...[
    "https://user:password@relay.example",
    "https://relay.example/path",
    "https://relay.example?key=fixture",
    "https://relay.example#fragment",
    "https://relay.example\nhttps://other.example",
    " ",
  ].map((url, index) => ({
    name: `reject unsafe or invalid origin ${index + 1}`,
    widget: { StatuslineRelayBaseURL: url },
    error: /Widget relay endpoint is empty or invalid/,
  })),
  {
    name: "missing widget file",
    missingWidget: true,
    error: /Embedded widget Info.plist was not found/,
  },
  {
    name: "mismatched build",
    widget: { CFBundleVersion: "5" },
    error: /CFBundleVersion must be nonempty and equal/,
  },
  {
    name: "mismatched version",
    widget: { CFBundleShortVersionString: "1.0" },
    error: /CFBundleShortVersionString must be nonempty and equal/,
  },
  {
    name: "missing version",
    widget: { CFBundleVersion: undefined },
    error: /Missing CFBundleVersion in widget/,
  },
  {
    name: "empty versions",
    app: { CFBundleVersion: "" },
    widget: { CFBundleVersion: "" },
    error: /CFBundleVersion must be nonempty and equal/,
  },
];

for (const sample of cases) {
  test(sample.name, macOnly, (t) => {
    const temporary = mkdtempSync(
      path.join(tmpdir(), "statusline-relay-guard-test-"),
    );
    t.after(() => rmSync(temporary, { recursive: true, force: true }));
    const app = path.join(temporary, "App Info.plist");
    const widget = path.join(temporary, "Widget Info.plist");
    writeFileSync(app, plist({ ...defaults, ...sample.app }));
    if (!sample.missingWidget)
      writeFileSync(widget, plist({ ...defaults, ...sample.widget }));
    const result = spawnSync(
      "/bin/sh",
      [script, app, widget, sample.configuration ?? "Release"],
      { encoding: "utf8" },
    );
    assert.ifError(result.error);
    if (sample.pass) {
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /validation passed/);
    } else {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, sample.error);
    }
  });
}

test(
  "every target inherits the project relay and the bundle guard is wired into app builds",
  macOnly,
  () => {
    const projectPath = path.join(
      directory,
      "../statusline.xcodeproj/project.pbxproj",
    );
    const { objects, rootObject } = JSON.parse(
      execFileSync(
        "/usr/bin/plutil",
        ["-convert", "json", "-o", "-", projectPath],
        { encoding: "utf8" },
      ),
    );
    const configurations = (owner) =>
      objects[owner.buildConfigurationList].buildConfigurations.map(
        (id) => objects[id],
      );
    const project = objects[rootObject];
    for (const configuration of configurations(project)) {
      assert.match(
        configuration.buildSettings.STATUSLINE_RELAY_BASE_URL,
        /^https:\/\//,
      );
    }
    for (const id of project.targets) {
      const target = objects[id];
      for (const configuration of configurations(target)) {
        assert.equal(
          configuration.buildSettings.STATUSLINE_RELAY_BASE_URL,
          undefined,
          `${target.name} must inherit its relay`,
        );
      }
      if (target.name === "statusline") {
        const guards = target.buildPhases
          .map((phase) => objects[phase])
          .filter((phase) => phase.name === "Validate app and widget relay");
        assert.equal(guards.length, 1);
        assert.match(guards[0].shellScript, /validate-relay-bundle\.sh/);
        assert.equal(guards[0].inputPaths.length, 3);
        assert.equal(String(guards[0].runOnlyForDeploymentPostprocessing), "0");
      }
    }
  },
);
