import { spawnSync } from "node:child_process";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inventory,
  prepareAppDir,
  repackUnsignedAppImage,
  verifyAppDir,
  waylandLibraries,
} from "./prepare-appimage-linux.mjs";

const elf = Buffer.alloc(64);
elf.set([127, 69, 76, 70, 2, 1]);
elf.writeUInt16LE(62, 18); // x86_64 header fixture, not an executable.
const modules = "usr/lib/x86_64-linux-gnu/gio/modules";
const hook = "apprun-hooks/statusline-gio.sh";
const launcher =
  '#!/usr/bin/env bash\nset -e\nthis_dir="$(cd -- "$(dirname -- "$0")" && pwd -P)"\nsource "$this_dir"/apprun-hooks/"linuxdeploy-plugin-gtk.sh"\nexec "$this_dir"/AppRun.wrapped "$@"\n';
let temporary;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (temporary) await rm(temporary, { recursive: true, force: true });
  temporary = undefined;
});

async function fixture() {
  temporary = await realpath(
    await mkdtemp(join(tmpdir(), "statusline-appimage-policy-test-")),
  );
  const root = join(temporary, "Statusline Companion.AppDir");
  await mkdir(join(root, modules), { recursive: true });
  await mkdir(join(root, "usr/bin"), { recursive: true });
  await mkdir(join(root, "apprun-hooks"));
  for (const path of [
    "AppRun.wrapped",
    "usr/bin/statusline-desktop",
    `${modules}/libgiognutls.so`,
    "usr/lib/libgio-2.0.so.0",
    ...waylandLibraries.map((name) => `usr/lib/${name}`),
  ]) {
    await writeFile(join(root, path), elf, { mode: 0o755 });
  }
  await writeFile(join(root, "AppRun"), launcher, { mode: 0o755 });
  await writeFile(
    join(root, "apprun-hooks/linuxdeploy-plugin-gtk.sh"),
    'export GDK_BACKEND=x11\nexport GIO_EXTRA_MODULES="/overwritten-by-statusline-hook"\n',
  );
  return root;
}

describe.skipIf(process.platform === "win32")(
  "AppImage packaging policy",
  () => {
    it("removes only four Wayland files and keeps every other payload byte and mode", async () => {
      const root = await fixture();
      const before = await inventory(root);
      const after = await prepareAppDir(root);
      expect(await verifyAppDir(root)).toEqual(after);
      for (const [path, value] of Object.entries(before)) {
        if (
          path === "AppRun" ||
          waylandLibraries.includes(path.replace("usr/lib/", ""))
        )
          continue;
        expect(after[path], path).toEqual(value);
      }
      for (const name of waylandLibraries)
        expect(after[`usr/lib/${name}`]).toBeUndefined();
      expect(
        Object.keys(after)
          .filter((path) => !(path in before))
          .sort(),
      ).toEqual([hook, "statusline-appimage-policy.json"]);
      expect(await readFile(join(root, "AppRun"), "utf8")).toBe(
        launcher.replace(
          'exec "$this_dir"/AppRun.wrapped',
          'source "$this_dir"/apprun-hooks/statusline-gio.sh\nexec "$this_dir"/AppRun.wrapped',
        ),
      );
      expect(after.AppRun.mode).toBe(before.AppRun.mode);
    });

    it.each([
      "missing-wayland",
      "extra-alias",
      "symlink",
      "non-elf",
      "wrong-architecture",
      "missing-tls",
      "unknown-launcher",
      "symlink-parent",
    ])("rejects %s before changing the input tree", async (problem) => {
      const root = await fixture();
      const library = join(root, "usr/lib/libwayland-client.so.0");
      if (problem === "missing-wayland") await rm(library);
      if (problem === "extra-alias")
        await writeFile(join(root, "usr/lib/libwayland-client.so"), elf);
      if (problem === "symlink") {
        await rm(library);
        await symlink("libgio-2.0.so.0", library);
      }
      if (problem === "non-elf") await writeFile(library, "not ELF");
      if (problem === "wrong-architecture") {
        const arm = Buffer.from(elf);
        arm.writeUInt16LE(183, 18);
        await writeFile(library, arm);
      }
      if (problem === "missing-tls")
        await rm(join(root, modules, "libgiognutls.so"));
      if (problem === "unknown-launcher")
        await writeFile(join(root, "AppRun"), "#!/bin/bash\nexit 0\n");
      if (problem === "symlink-parent") {
        const external = join(temporary, "external-modules");
        await cp(join(root, modules), external, { recursive: true });
        await rm(join(root, modules), { recursive: true });
        await symlink(external, join(root, modules));
      }
      const before = await inventory(root);
      await expect(prepareAppDir(root)).rejects.toThrow();
      expect(await inventory(root)).toEqual(before);
    });

    it("rejects a second preparation without mutating the corrected tree", async () => {
      const root = await fixture();
      const before = await prepareAppDir(root);
      await expect(prepareAppDir(root)).rejects.toThrow("already prepared");
      expect(await inventory(root)).toEqual(before);
    });

    it.each([
      "reintroduced-wayland",
      "changed-hook",
      "missing-launcher-hook",
      "changed-policy",
    ])("rejects output corruption: %s", async (problem) => {
      const root = await fixture();
      await prepareAppDir(root);
      if (problem === "reintroduced-wayland")
        await writeFile(join(root, "usr/lib/libwayland-client.so.0"), elf);
      if (problem === "changed-hook")
        await writeFile(join(root, hook), "exit 0\n");
      if (problem === "missing-launcher-hook")
        await writeFile(join(root, "AppRun"), launcher);
      if (problem === "changed-policy")
        await writeFile(join(root, "statusline-appimage-policy.json"), "{}");
      await expect(verifyAppDir(root)).rejects.toThrow();
    });

    it.skipIf(process.platform === "win32")(
      "scopes GIO to the relocated AppDir, retains TLS and forwards arguments verbatim",
      async () => {
        const root = await fixture();
        await prepareAppDir(root);
        // Only the subprocess boundary is replaced; execute the real generated
        // AppRun and hook, including paths with spaces and hostile inherited vars.
        await writeFile(
          join(root, "AppRun.wrapped"),
          '#!/usr/bin/env bash\nprintf "%s\\n" "$GIO_MODULE_DIR" "$GIO_EXTRA_MODULES" "$GDK_BACKEND" "${LIBGL_ALWAYS_SOFTWARE:-unset}" "$@"\n',
        );
        await chmod(join(root, "AppRun.wrapped"), 0o755);
        const result = spawnSync(
          "bash",
          [join(root, "AppRun"), "argument with spaces", "$(not-a-command)"],
          {
            encoding: "utf8",
            env: {
              ...process.env,
              APPDIR: "/wrong",
              GIO_MODULE_DIR: "/host",
              GIO_EXTRA_MODULES: "/host",
              LIBGL_ALWAYS_SOFTWARE: "false",
            },
          },
        );
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout.trim().split("\n")).toEqual([
          join(root, modules),
          join(root, modules),
          "x11",
          "false",
          "argument with spaces",
          "$(not-a-command)",
        ]);
        await rm(join(root, modules, "libgiognutls.so"));
        expect(spawnSync("bash", [join(root, "AppRun")]).status).not.toBe(0);
      },
    );
  },
);

async function repackFixture(problem) {
  const root = await fixture();
  const original = join(temporary, "Statusline_0.1.13.AppImage");
  const bytes = Buffer.alloc(256);
  elf.copy(bytes);
  bytes.set([65, 73, 2], 8);
  bytes.write("hsqs", 128);
  await writeFile(original, bytes, { mode: 0o755 });
  const plugin = join(temporary, "cached-output-plugin.AppImage");
  let prepared;
  const execute = vi.fn(async (command, args, options = {}) => {
    if (args[0] === "--appimage-offset")
      return problem === "invalid-runtime" ? "garbage" : "128";
    if (command === plugin) {
      if (problem === "plugin-failed") throw new Error("plugin failed");
      prepared = args[2];
      expect(options.env.LDAI_SIGN).toBeUndefined();
      expect(options.env.SIGN).toBeUndefined();
      expect(options.env.OUTPUT).toBe(options.env.LDAI_OUTPUT);
      expect(await readFile(options.env.LDAI_RUNTIME_FILE)).toEqual(
        bytes.subarray(0, 128),
      );
      await writeFile(
        options.env.OUTPUT,
        Buffer.concat([bytes, Buffer.from("new candidate")]),
      );
      return "";
    }
    expect(args).toEqual(["--appimage-extract"]);
    const extraction = join(options.cwd, "squashfs-root");
    await cp(command === original ? root : prepared, extraction, {
      recursive: true,
    });
    if (command !== original && problem === "corrupt-payload")
      await writeFile(
        join(extraction, "usr/bin/statusline-desktop"),
        Buffer.concat([elf, Buffer.from("altered")]),
      );
    return "";
  });
  return { original, bytes, plugin, execute };
}

describe.skipIf(process.platform === "win32")(
  "Unsigned AppImage output pipeline",
  () => {
    it("re-extracts and verifies payload before replacing only the local unsigned output", async () => {
      const f = await repackFixture();
      vi.stubEnv("SIGN", "1");
      vi.stubEnv("LDAI_SIGN", "1");
      await repackUnsignedAppImage(f.original, f.plugin, f.execute);
      expect(await readFile(f.original)).not.toEqual(f.bytes);
      expect(f.execute).toHaveBeenCalledTimes(4);
      expect(
        (await readdir(temporary)).some((name) =>
          name.startsWith(".statusline-appimage-"),
        ),
      ).toBe(false);
    });

    it.each(["plugin-failed", "corrupt-payload", "invalid-runtime"])(
      "preserves the original if %s",
      async (problem) => {
        const f = await repackFixture(problem);
        await expect(
          repackUnsignedAppImage(f.original, f.plugin, f.execute),
        ).rejects.toThrow();
        expect(await readFile(f.original)).toEqual(f.bytes);
        expect(
          (await readdir(temporary)).some((name) =>
            name.startsWith(".statusline-appimage-"),
          ),
        ).toBe(false);
      },
    );

    it.each(["asc", "sig"])(
      "refuses to rewrite an artifact with a .%s signature",
      async (extension) => {
        const f = await repackFixture();
        await writeFile(`${f.original}.${extension}`, "signature");
        await expect(
          repackUnsignedAppImage(f.original, f.plugin, f.execute),
        ).rejects.toThrow("signed installer");
        expect(f.execute).not.toHaveBeenCalled();
        expect(await readFile(f.original)).toEqual(f.bytes);
      },
    );
  },
);

it("gates Linux upload on packaging, readiness and signatures, and reuses the same artifact on Ubuntu 24.04", async () => {
  const workflow = await readFile(
    new URL(
      "../../../.github/workflows/desktop-installers.yml",
      import.meta.url,
    ),
    "utf8",
  );
  const steps = [
    "Prepare AppImage compatibility policy before signing",
    "Smoke test Linux packages",
    "Sign Linux installers with OpenPGP",
    "Verify Linux installer signatures independently",
    "Upload validated Linux installers",
  ];
  const positions = steps.map((name) => workflow.indexOf(`- name: ${name}`));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  expect(workflow).toContain(
    "uploadWorkflowArtifacts: ${{ runner.os == 'Windows' }}",
  );
  expect(workflow).toContain("runs-on: ubuntu-24.04");
  expect(workflow).toContain(
    "Validate AppImage and DEB frontend readiness without rebuilding",
  );
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  expect(packageJson.scripts["bundle:linux"]).toContain(
    "prepare-appimage-linux.mjs",
  );
});
