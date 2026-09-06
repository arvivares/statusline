import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(
  new URL("./smoke-frontend-linux.sh", import.meta.url),
);
let temporary;
afterEach(async () => {
  if (temporary) await rm(temporary, { recursive: true, force: true });
  temporary = undefined;
});

async function fixture(extra = {}) {
  temporary = await realpath(
    await mkdtemp(join(tmpdir(), "statusline-readiness-test-")),
  );
  const bin = join(temporary, "bin");
  const logs = join(temporary, "tmp");
  await mkdir(bin);
  await mkdir(logs);
  const mocks = {
    uname: 'echo "${FIXTURE_OS:-Linux}"',
    id: 'echo "${FIXTURE_UID:-1000}"',
    pgrep: 'exit "${FIXTURE_PGREP:-1}"',
    setsid: 'exec "$@"',
    "dbus-run-session": 'shift; exec "$@"',
    "xvfb-run": 'shift; exec "$@"',
    sleep: "/bin/sleep 0.01",
  };
  for (const [name, body] of Object.entries(mocks))
    await writeFile(join(bin, name), `#!/usr/bin/env bash\n${body}\n`, {
      mode: 0o755,
    });
  const bashEnvironment = join(temporary, "bash-env");
  // Mock group liveness/termination, never send signals to macOS or an unrelated
  // process. The fake application exits immediately and leaves no child behind.
  await writeFile(
    bashEnvironment,
    'kill() {\n  if [[ "$1" == -0 ]]; then [[ "${FIXTURE_ALIVE:-yes}" == yes ]]; return; fi\n  printf "%s\\n" "$*" >> "$FIXTURE_KILLS"\n}\n',
  );
  const executable = join(temporary, "Statusline Companion.AppImage");
  await writeFile(
    executable,
    `#!/usr/bin/env bash
[[ "$1" == --statusline-window-smoke ]] || exit 2
printf 'relay=%s\\nsandbox=%s\\nappimage=%s\\nconfig=%s\\n' "$STATUSLINE_RELAY_BASE_URL" "\${WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS:-unset}" "$APPIMAGE_EXTRACT_AND_RUN" "$XDG_CONFIG_HOME"
case "\${FIXTURE_MARKER:-ready}" in
  ready) printf 'ready\\n' > "$2" ;;
  wrong) printf 'something else\\n' > "$2" ;;
  symlink) ln -s "$FIXTURE_STALE_MARKER" "$2" ;;
  absent) : ;;
esac
if [[ -n \${FIXTURE_ERROR:-} ]]; then printf '%s\\n' "$FIXTURE_ERROR" >&2; fi
`,
    { mode: 0o755 },
  );
  const stale = join(temporary, "stale-ready");
  await writeFile(stale, "ready\n");
  return {
    executable,
    logs,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      TMPDIR: logs,
      BASH_ENV: bashEnvironment,
      FIXTURE_KILLS: join(temporary, "kills"),
      FIXTURE_STALE_MARKER: stale,
      ...extra,
    },
  };
}

function run(f) {
  return spawnSync("bash", [script, f.executable], {
    env: f.env,
    encoding: "utf8",
    timeout: 15_000,
  });
}

describe.skipIf(process.platform === "win32")(
  "Linux frontend readiness smoke",
  () => {
    it("requires the exact frontend marker, isolates profiles/relay and keeps the sandbox enabled", async () => {
      const f = await fixture({
        WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS: "1",
      });
      const result = run(f);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("IPC handshake succeeded");
      const directories = await readdir(f.logs);
      expect(directories).toHaveLength(1);
      const log = await readFile(
        join(f.logs, directories[0], "startup.log"),
        "utf8",
      );
      expect(log).toContain("relay=\n");
      expect(log).toContain("sandbox=unset\n");
      expect(log).toContain("appimage=1\n");
      expect(log).toContain(`config=${join(f.logs, directories[0], "config")}`);
      expect(await readFile(join(temporary, "kills"), "utf8")).toMatch(
        /-TERM -- -\d+\n-KILL -- -\d+\n/,
      );
    });

    it.each(["absent", "wrong", "symlink"])(
      "fails with a %s marker even if the parent appears alive",
      async (marker) => {
        const f = await fixture({ FIXTURE_MARKER: marker });
        const result = run(f);
        expect(result.status, result.error?.message).toBe(1);
        expect(result.stderr).toContain("Frontend did not initialize");
        expect(result.stdout).not.toContain("IPC handshake succeeded");
      },
    );

    it("fails if the process exits before readiness", async () => {
      const result = run(await fixture({ FIXTURE_ALIVE: "no" }));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("exited before frontend readiness");
    });

    it.each([
      "EGL_BAD_PARAMETER",
      "undefined symbol: wl_fixes_interface",
      "undefined symbol: g_task_set_static_name",
    ])("rejects %s even when a marker exists", async (message) => {
      const result = run(await fixture({ FIXTURE_ERROR: message }));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("compatibility error");
    });

    it.each([
      { FIXTURE_OS: "Darwin" },
      { FIXTURE_UID: "0" },
      { FIXTURE_PGREP: "0" },
      { FIXTURE_PGREP: "2" },
    ])("guards the environment before launch: %j", async (environment) => {
      const f = await fixture(environment);
      expect(run(f).status).toBe(1);
      expect(await readdir(f.logs)).toEqual([]);
    });
  },
);
