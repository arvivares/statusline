import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(
  new URL("./diagnose-appimage-linux.sh", import.meta.url),
);
const digest = "a".repeat(64);
const waylandLibraries = [
  "libwayland-client.so.0",
  "libwayland-server.so.0",
  "libwayland-egl.so.1",
  "libwayland-cursor.so.0",
];
let fixtureRoot;

afterEach(async () => {
  if (fixtureRoot) {
    await rm(fixtureRoot, { recursive: true, force: true });
    fixtureRoot = undefined;
  }
});

async function executable(path, body) {
  await writeFile(path, `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
}

async function fixture(overrides = {}) {
  fixtureRoot = await mkdtemp(join(tmpdir(), "statusline-appimage-test-"));
  const bin = join(fixtureRoot, "bin");
  const appdir = join(fixtureRoot, "source-appdir");
  const modules = join(appdir, "usr/lib/x86_64-linux-gnu/gio/modules");
  const temporary = join(fixtureRoot, "tmp");
  const hostLibraries = join(fixtureRoot, "host-libraries");
  await Promise.all([
    mkdir(bin),
    mkdir(modules, { recursive: true }),
    mkdir(join(appdir, "apprun-hooks"), { recursive: true }),
    mkdir(temporary),
    mkdir(hostLibraries),
  ]);
  for (const name of waylandLibraries) {
    await writeFile(join(appdir, "usr/lib", name), `bundled:${name}`);
    await writeFile(join(hostLibraries, name), `host:${name}`);
  }
  const hostCache = join(fixtureRoot, "host-cache.txt");
  await writeFile(
    hostCache,
    waylandLibraries
      .map((name) => `\t${name} (libc6,x86-64) => ${join(hostLibraries, name)}`)
      .join("\n") + "\n",
  );
  // Mock Linux/tool boundaries, not the diagnostic logic. No real app, GPU,
  // process group, credentials, package manager or network is involved.
  const mocks = {
    uname: 'printf "%s\\n" "${FIXTURE_OS:-Linux}"',
    id: 'printf "%s\\n" "${FIXTURE_UID:-1000}"',
    file: 'printf "ELF 64-bit LSB executable\\n"',
    realpath: 'printf "%s\\n" "${@: -1}"',
    sha256sum: `printf '${digest}  %s\\n' "\${@: -1}"`,
    pgrep: 'exit "${FIXTURE_PROCESS_STATUS:-1}"',
    setsid: 'exec "$@"',
    timeout: 'shift 3; exec "$@"',
    sleep: "exit 0",
    find: 'if [[ "${@: -1}" == -print0 ]]; then exec /usr/bin/find "$1" -name "libwayland-*.so*" -print0; fi; printf "libgio-2.0.so.0.7200.4\\nlibwayland-client.so.0\\n"',
    ldconfig: 'cat "$FIXTURE_HOST_CACHE"',
  };
  await Promise.all(
    Object.entries(mocks).map(([name, body]) =>
      executable(join(bin, name), body),
    ),
  );
  const bashEnvironment = join(fixtureRoot, "bash-env");
  await writeFile(bashEnvironment, "kill() { return 0; }\n");
  await writeFile(
    join(appdir, "apprun-hooks/linuxdeploy-plugin-gtk.sh"),
    "export GDK_BACKEND=x11\n",
  );
  await executable(
    join(appdir, "AppRun"),
    `
export GDK_BACKEND=x11
export GIO_EXTRA_MODULES="$PWD/usr/lib/x86_64-linux-gnu/gio/modules"
printf 'module=%s\\nextra=%s\\nsoftware=%s\\nrelay=%s\\n' "\${GIO_MODULE_DIR:-unset}" "$GIO_EXTRA_MODULES" "\${LIBGL_ALWAYS_SOFTWARE:-unset}" "\${STATUSLINE_RELAY_BASE_URL:-disabled}"
printf 'config=%s\\ndata=%s\\ncache=%s\\nregistry=%s\\n' "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$GST_REGISTRY"
if [[ -z \${GIO_MODULE_DIR:-} ]]; then printf 'undefined symbol: g_task_set_static_name\\n' >&2; fi
if [[ \${FIXTURE_WAYLAND_EXPERIMENT:-} == yes ]]; then
  if [[ -f "$PWD/usr/lib/libwayland-client.so.0" || \${FIXTURE_PERSIST_EGL:-} == yes ]]; then printf 'EGL_BAD_PARAMETER\\n' >&2; fi
elif [[ -z \${GIO_MODULE_DIR:-} || \${LIBGL_ALWAYS_SOFTWARE:-} != true ]]; then printf 'EGL_BAD_PARAMETER\\n' >&2; fi
if [[ -n \${LD_DEBUG_OUTPUT:-} ]]; then printf 'fixture loader trace\\n' > "$LD_DEBUG_OUTPUT.fixture"; fi
if [[ -n \${LD_DEBUG_OUTPUT:-} && \${FIXTURE_WAYLAND_EXPERIMENT:-} == yes ]]; then
  if [[ -f "$PWD/usr/lib/libwayland-client.so.0" ]]; then library_directory="$PWD/usr/lib"; else library_directory="$FIXTURE_HOST_LIBRARIES"; fi
  printf '100: initialize program: %s/usr/lib/WebKitWebProcess\\n100: calling init: %s/libwayland-client.so.0\\n100: trying file=/irrelevant/libwayland-client.so.0\\n' "$PWD" "$library_directory" >> "$LD_DEBUG_OUTPUT.fixture"
fi
exit 124
`,
  );
  const appimage = join(fixtureRoot, "Statusline Companion.AppImage");
  await executable(
    appimage,
    `
[[ "\${1:-}" == --appimage-extract ]] || exit 2
[[ "\${FIXTURE_EXTRACT_FAIL:-}" != yes ]] || exit 42
cp -R "$FIXTURE_APPDIR" squashfs-root
`,
  );
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    BASH_ENV: bashEnvironment,
    TMPDIR: temporary,
    DISPLAY: ":99",
    WAYLAND_DISPLAY: "",
    FIXTURE_APPDIR: appdir,
    FIXTURE_HOST_LIBRARIES: hostLibraries,
    FIXTURE_HOST_CACHE: hostCache,
    ...overrides,
  };
  const run = (args = []) =>
    spawnSync("bash", [script, appimage, ...args], {
      env,
      encoding: "utf8",
      timeout: 15000,
    });
  const outputDirectory = async () => {
    const entries = await readdir(temporary);
    return entries.length ? join(temporary, entries[0]) : undefined;
  };
  return {
    run,
    outputDirectory,
    appimage,
    appdir,
    hostLibraries,
    hostCache,
    modules,
    temporary,
  };
}

describe.skipIf(process.platform === "win32")(
  "AppImage diagnostic runner",
  () => {
    it("shows help without launching or extracting an app", () => {
      const result = spawnSync("bash", [script, "--help"], {
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("nothing is uploaded");
    });

    it.each([
      [{ FIXTURE_OS: "Darwin" }, "needs Linux"],
      [{ FIXTURE_UID: "0" }, "Do not run as root"],
      [{ DISPLAY: "" }, "graphical desktop"],
      [{ FIXTURE_PROCESS_STATUS: "0" }, "Statusline is running"],
      [{ FIXTURE_PROCESS_STATUS: "2" }, "process check failed"],
    ])("rejects unsafe launch conditions: %o", async (environment, message) => {
      const f = await fixture(environment);
      const result = f.run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
      expect(await f.outputDirectory()).toBeUndefined();
    });

    it.each([
      ["--seconds", "0"],
      ["--seconds", "61"],
      ["--seconds", "20;true"],
      ["--sha256"],
      ["--sha256", "invalid"],
      ["--unknown"],
      ["--wayland-comparison"],
    ])("rejects invalid arguments: %s %s", async (...args) => {
      const f = await fixture();
      expect(f.run(args).status).toBe(1);
      expect(await f.outputDirectory()).toBeUndefined();
    });

    it("fails before extraction on checksum mismatch", async () => {
      const f = await fixture();
      const result = f.run(["--sha256", "b".repeat(64)]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("SHA-256 mismatch");
      expect(await f.outputDirectory()).toBeUndefined();
    });

    it("does not change executable permissions of the original", async () => {
      const f = await fixture();
      await chmod(f.appimage, 0o644);
      expect(f.run().status).toBe(1);
      expect((await stat(f.appimage)).mode & 0o777).toBe(0o644);
      expect(await f.outputDirectory()).toBeUndefined();
    });

    it("retains extraction errors without attempting a launch", async () => {
      const f = await fixture({ FIXTURE_EXTRACT_FAIL: "yes" });
      const result = f.run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Extraction failed");
      expect(await readdir(await f.outputDirectory())).not.toContain(
        "baseline",
      );
    });

    it("runs the controlled 2x2 matrix without equating a surviving process or clean log with rendering", async () => {
      const f = await fixture({
        GIO_MODULE_DIR: "/private/host/modules",
        LIBGL_ALWAYS_SOFTWARE: "unexpected",
        STATUSLINE_RELAY_BASE_URL: "https://private.invalid",
      });
      const original = await readFile(f.appimage);
      const result = f.run([
        "--sha256",
        digest.toUpperCase(),
        "--seconds",
        "10",
        "--trace",
      ]);
      expect(result.status, result.stderr).toBe(0);
      const directory = await f.outputDirectory();
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
      expect(await readFile(join(directory, "summary.tsv"), "utf8")).toBe(
        "case\texit_code\tgio_symbol_error\tegl_bad_parameter\tui_observation\n" +
          "baseline\t124\tyes\tyes\tnot-observed\n" +
          "gio-bundled-only\t124\tno\tyes\tnot-observed\n" +
          "software\t124\tyes\tyes\tnot-observed\n" +
          "gio-bundled-only-software\t124\tno\tno\tnot-observed\n",
      );
      const baseline = await readFile(
        join(directory, "baseline/startup.log"),
        "utf8",
      );
      const isolated = await readFile(
        join(directory, "gio-bundled-only/startup.log"),
        "utf8",
      );
      expect(baseline).toContain("module=unset");
      expect(baseline).toContain("software=unset");
      expect(baseline).toContain("relay=disabled");
      expect(baseline).toContain(`config=${directory}/baseline/config`);
      expect(baseline).toContain(
        `registry=${directory}/baseline/cache/gstreamer-registry.bin`,
      );
      expect(isolated).toContain(
        `module=${directory}/extracted/squashfs-root/usr/lib/x86_64-linux-gnu/gio/modules`,
      );
      expect(result.stdout).toContain("forces X11");
      expect(result.stdout).toContain("does NOT prove successful rendering");
      expect(result.stdout).not.toContain("private.invalid");
      expect(result.stdout).not.toContain("/private/host/modules");
      expect(
        await readFile(join(directory, "baseline/loader.fixture"), "utf8"),
      ).toContain("fixture loader trace");
      expect(await readFile(f.appimage)).toEqual(original);
    });

    it("runs the original matrix without loader tracing", async () => {
      const f = await fixture();
      const result = f.run();
      expect(result.status, result.stderr).toBe(0);
      const directory = await f.outputDirectory();
      expect(await readdir(join(directory, "baseline"))).not.toContain(
        "loader.fixture",
      );
      expect(await readFile(join(directory, "summary.tsv"), "utf8")).toContain(
        "baseline\t124\tyes\tyes\tnot-observed",
      );
    });

    it("compares bundled and host Wayland with identical isolated GIO and no software override", async () => {
      const f = await fixture({ FIXTURE_WAYLAND_EXPERIMENT: "yes" });
      const original = await readFile(f.appimage);
      const result = f.run(["--wayland-comparison", "--sha256", digest]);
      expect(result.status, result.stderr).toBe(0);
      const directory = await f.outputDirectory();
      const control = join(directory, "extracted/squashfs-root");
      const experiment = join(directory, "host-wayland-appdir");
      const quarantine = join(directory, "wayland-quarantine");
      for (const name of waylandLibraries) {
        expect(await readFile(join(control, "usr/lib", name), "utf8")).toBe(
          `bundled:${name}`,
        );
        expect(await readFile(join(quarantine, name), "utf8")).toBe(
          `bundled:${name}`,
        );
        expect(await readFile(join(f.hostLibraries, name), "utf8")).toBe(
          `host:${name}`,
        );
        await expect(stat(join(experiment, "usr/lib", name))).rejects.toThrow();
        expect((await stat(join(quarantine, name))).ino).not.toBe(
          (await stat(join(control, "usr/lib", name))).ino,
        );
      }
      expect(await readFile(join(control, "AppRun"))).toEqual(
        await readFile(join(experiment, "AppRun")),
      );
      expect(
        await readFile(join(control, "apprun-hooks/linuxdeploy-plugin-gtk.sh")),
      ).toEqual(
        await readFile(
          join(experiment, "apprun-hooks/linuxdeploy-plugin-gtk.sh"),
        ),
      );
      expect(await readFile(f.appimage)).toEqual(original);
      expect(await readFile(join(directory, "summary.tsv"), "utf8")).toBe(
        "case\texit_code\tgio_symbol_error\tegl_bad_parameter\tui_observation\n" +
          "gio-bundled-wayland\t124\tno\tyes\tnot-observed\n" +
          "gio-host-wayland\t124\tno\tno\tnot-observed\n",
      );
      for (const [name, root] of [
        ["gio-bundled-wayland", control],
        ["gio-host-wayland", experiment],
      ]) {
        const log = await readFile(
          join(directory, name, "startup.log"),
          "utf8",
        );
        expect(log).toContain(
          `module=${root}/usr/lib/x86_64-linux-gnu/gio/modules`,
        );
        expect(log).toContain("software=unset");
        expect(log).toContain("relay=disabled");
      }
      const evidence = await readFile(
        join(directory, "gio-host-wayland/loader-evidence.txt"),
        "utf8",
      );
      expect(evidence).toContain("loader.fixture:100: initialize program:");
      expect(evidence).toContain(`${f.hostLibraries}/libwayland-client.so.0`);
      expect(evidence).not.toContain("/irrelevant/");
      expect(result.stdout).toContain("all are retained");
    });

    it("reports persistent EGL after quarantine without declaring a fix", async () => {
      const f = await fixture({
        FIXTURE_WAYLAND_EXPERIMENT: "yes",
        FIXTURE_PERSIST_EGL: "yes",
      });
      expect(f.run(["--wayland-comparison", "--sha256", digest]).status).toBe(
        0,
      );
      const directory = await f.outputDirectory();
      expect(await readFile(join(directory, "summary.tsv"), "utf8")).toContain(
        "gio-host-wayland\t124\tno\tyes\tnot-observed",
      );
    });

    it.each([
      "missing",
      "symlink",
      "extra-alias",
      "missing-host",
      "wrong-host-architecture",
    ])(
      "refuses an unexpected Wayland layout before quarantine: %s",
      async (scenario) => {
        const f = await fixture();
        const first = waylandLibraries[0];
        if (scenario === "missing" || scenario === "symlink") {
          await rm(join(f.appdir, "usr/lib", first));
        }
        if (scenario === "symlink")
          await symlink(
            join(f.hostLibraries, first),
            join(f.appdir, "usr/lib", first),
          );
        if (scenario === "extra-alias")
          await symlink(first, join(f.appdir, "usr/lib/libwayland-client.so"));
        if (scenario === "missing-host") await rm(join(f.hostLibraries, first));
        if (scenario === "wrong-host-architecture") {
          const cache = await readFile(f.hostCache, "utf8");
          await writeFile(f.hostCache, cache.replaceAll("x86-64", "AArch64"));
        }
        const result = f.run(["--wayland-comparison", "--sha256", digest]);
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Nothing was moved.");
        const directory = await f.outputDirectory();
        expect(await readdir(directory)).not.toContain("wayland-quarantine");
        expect(await readdir(directory)).not.toContain("gio-bundled-wayland");
      },
    );
  },
);
