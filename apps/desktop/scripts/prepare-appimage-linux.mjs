import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  lstat,
  mkdtemp,
  open,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const waylandLibraries = [
  "libwayland-client.so.0",
  "libwayland-server.so.0",
  "libwayland-egl.so.1",
  "libwayland-cursor.so.0",
];
const moduleDirectory = "usr/lib/x86_64-linux-gnu/gio/modules";
const hookPath = "apprun-hooks/statusline-gio.sh";
const manifestPath = "statusline-appimage-policy.json";
const launcherExec = 'exec "$this_dir"/AppRun.wrapped "$@"';
const launcherHook = 'source "$this_dir"/apprun-hooks/statusline-gio.sh';
const hookSource = new URL(
  "../../../packaging/linux/statusline-gio.sh",
  import.meta.url,
);
const policy = {
  schemaVersion: 1,
  policy: "host-wayland-isolated-gio-v1",
  architecture: "x86_64",
  excludedLibraries: waylandLibraries,
  gioModuleDirectory: moduleDirectory,
};

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function regular(root, relative) {
  const path = join(root, relative);
  const info = await lstat(path);
  requireCondition(
    info.isFile() && (await realpath(path)) === path,
    `Expected an internal regular file: ${relative}`,
  );
  return info;
}

async function elf(root, relative) {
  const info = await regular(root, relative);
  const handle = await open(join(root, relative), "r");
  const bytes = Buffer.alloc(64);
  let bytesRead;
  try {
    ({ bytesRead } = await handle.read(bytes, 0, bytes.length, 0));
  } finally {
    await handle.close();
  }
  requireCondition(
    bytesRead >= 20 &&
      bytes.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70])) &&
      bytes[4] === 2 &&
      bytes[5] === 1 &&
      bytes.readUInt16LE(18) === 62,
    `Expected x86_64 ELF: ${relative}`,
  );
  return info;
}

// Do not follow symlinks. The same inventory is used after re-extraction so the
// output plugin cannot silently alter the launcher, policy or any other payload.
export async function inventory(root, prefix = "") {
  const entries = {};
  for (const item of (
    await readdir(join(root, prefix), { withFileTypes: true })
  ).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    const path = join(root, relative);
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      entries[relative] = { link: await readlink(path) };
    } else if (info.isDirectory()) {
      entries[relative] = { directory: true, mode: info.mode & 0o777 };
      Object.assign(entries, await inventory(root, relative));
    } else {
      requireCondition(info.isFile(), `Unexpected special file: ${relative}`);
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      entries[relative] = {
        sha256: hash.digest("hex"),
        mode: info.mode & 0o777,
      };
    }
  }
  return entries;
}

async function inspect(root) {
  requireCondition(
    (await realpath(root)) === root,
    "AppDir must be a canonical directory.",
  );
  for (const path of ["usr/lib", moduleDirectory, "apprun-hooks"]) {
    requireCondition(
      (await realpath(join(root, path))) === join(root, path),
      `Unexpected directory symlink: ${path}`,
    );
  }
  const appRun = await regular(root, "AppRun");
  requireCondition((appRun.mode & 0o111) !== 0, "AppRun must be executable.");
  await elf(root, "AppRun.wrapped");
  await elf(root, "usr/bin/statusline-desktop");
  await elf(root, `${moduleDirectory}/libgiognutls.so`);
  await regular(root, "apprun-hooks/linuxdeploy-plugin-gtk.sh");
  const launcher = await readFile(join(root, "AppRun"), "utf8");
  requireCondition(
    launcher.split("\n").filter((line) => line === launcherExec).length === 1,
    "Unknown upstream AppRun layout; review before changing the bundle.",
  );
  requireCondition(
    launcher.includes(
      'source "$this_dir"/apprun-hooks/"linuxdeploy-plugin-gtk.sh"',
    ) ||
      launcher.includes(
        'source "$this_dir"/apprun-hooks/linuxdeploy-plugin-gtk.sh',
      ),
    "Missing upstream GTK hook.",
  );
  return { launcher, files: await inventory(root) };
}

export async function verifyAppDir(root) {
  const { launcher, files } = await inspect(root);
  requireCondition(
    !Object.keys(files).some((path) =>
      /^libwayland-.*\.so/.test(basename(path)),
    ),
    "The AppImage must resolve Wayland from the host, not bundled aliases.",
  );
  requireCondition(
    launcher.includes(`${launcherHook}\n${launcherExec}`),
    "Missing GIO launcher isolation.",
  );
  await regular(root, hookPath);
  await regular(root, manifestPath);
  requireCondition(
    (await readFile(join(root, hookPath), "utf8")) ===
      (await readFile(hookSource, "utf8")),
    "GIO hook differs from the reviewed source.",
  );
  requireCondition(
    JSON.stringify(
      JSON.parse(await readFile(join(root, manifestPath), "utf8")),
    ) === JSON.stringify(policy),
    "Unexpected AppImage compatibility policy.",
  );
  return files;
}

export async function prepareAppDir(root) {
  const { launcher, files } = await inspect(root);
  requireCondition(
    !(await exists(join(root, hookPath))) &&
      !(await exists(join(root, manifestPath))),
    "AppDir is already prepared; rebuild a clean unsigned input.",
  );
  const actual = Object.keys(files)
    .filter((path) => /^libwayland-.*\.so/.test(basename(path)))
    .sort();
  const expected = waylandLibraries.map((name) => `usr/lib/${name}`).sort();
  requireCondition(
    JSON.stringify(actual) === JSON.stringify(expected),
    "Expected exactly four known Wayland files; unknown aliases/layout require review.",
  );
  for (const path of expected) await elf(root, path);
  const hook = await readFile(hookSource);
  // All checks precede mutations, which affect only a fresh, private build copy.
  for (const path of expected) await rm(join(root, path));
  await writeFile(join(root, hookPath), hook, {
    flag: "wx",
    mode: 0o644,
  });
  await writeFile(
    join(root, manifestPath),
    JSON.stringify(policy, null, 2) + "\n",
    { flag: "wx", mode: 0o644 },
  );
  await writeFile(
    join(root, "AppRun"),
    launcher.replace(launcherExec, `${launcherHook}\n${launcherExec}`),
  );
  return verifyAppDir(root);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  requireCondition(
    result.status === 0,
    `${basename(command)} failed (${result.status}): ${result.stderr ?? ""}`,
  );
  return result.stdout?.trim();
}

async function prepareBundle(bundleArgument) {
  requireCondition(
    process.platform === "linux" && process.arch === "x64",
    "Build AppImages on Linux x86_64.",
  );
  requireCondition(
    process.getuid() !== 0,
    "Do not build or run AppImage as root.",
  );
  const bundle = await realpath(bundleArgument);
  requireCondition(
    basename(bundle) === "bundle",
    "Use the local Tauri build's bundle directory, not a published release.",
  );
  const output = join(bundle, "appimage");
  requireCondition(
    (await realpath(output)) === output,
    "Unexpected AppImage output symlink.",
  );
  const names = (await readdir(output)).filter((name) =>
    name.endsWith(".AppImage"),
  );
  requireCondition(
    names.length === 1,
    "Expected exactly one newly built AppImage.",
  );
  const name = names[0];
  const original = join(output, name);
  await elf(output, name);
  requireCondition(
    !(await exists(`${original}.asc`)) && !(await exists(`${original}.sig`)),
    "Never rewrite a signed installer. Rebuild an unsigned candidate first.",
  );
  const plugin = join(
    process.env.XDG_CACHE_HOME || join(homedir(), ".cache"),
    "tauri/linuxdeploy-plugin-appimage.AppImage",
  );
  requireCondition(
    await exists(plugin),
    "Missing Tauri's cached AppImage output plugin. Complete the Tauri build first.",
  );
  await repackUnsignedAppImage(original, plugin);
}

export async function repackUnsignedAppImage(original, plugin, execute = run) {
  const output = dirname(original);
  const name = basename(original);
  await elf(output, name);
  requireCondition(
    !(await exists(`${original}.asc`)) && !(await exists(`${original}.sig`)),
    "Never rewrite a signed installer. Rebuild an unsigned candidate first.",
  );
  const temporary = await mkdtemp(join(output, ".statusline-appimage-"));
  try {
    await execute(original, ["--appimage-extract"], { cwd: temporary });
    const root = join(temporary, "squashfs-root");
    const expected = await prepareAppDir(root);
    // Reuse the already-built Type 2 runtime, avoiding a new runtime download.
    const offset = Number(await execute(original, ["--appimage-offset"]));
    const bytes = await readFile(original);
    requireCondition(
      Number.isSafeInteger(offset) &&
        offset > 64 &&
        offset < 10 * 1024 * 1024 &&
        bytes.subarray(8, 11).equals(Buffer.from([65, 73, 2])) &&
        bytes.toString("ascii", offset, offset + 4) === "hsqs",
      "Unexpected AppImage Type 2 runtime/SquashFS offset.",
    );
    const runtime = join(temporary, "runtime");
    await writeFile(runtime, bytes.subarray(0, offset), { flag: "wx" });
    const candidate = join(temporary, name);
    const environment = { ...process.env };
    for (const key of [
      "SIGN",
      "LDAI_SIGN",
      "UPDATE_INFORMATION",
      "UPD_INFO",
      "LDAI_UPDATE_INFORMATION",
      "LDAI_GUESS_UPDATE_INFORMATION",
      "LDAI_UPD_INFO",
      "LDAI_SIGN_KEY",
      "SIGN_KEY",
      "LDAI_SIGN_ARGS",
      "SIGN_ARGS",
    ])
      delete environment[key];
    Object.assign(environment, {
      ARCH: "x86_64",
      APPIMAGE_EXTRACT_AND_RUN: "1",
      OUTPUT: candidate,
      LDAI_OUTPUT: candidate,
      LDAI_RUNTIME_FILE: runtime,
    });
    // Invoke only the output plugin, not linuxdeploy (which would re-add libraries).
    await execute(plugin, ["--appimage-extract-and-run", "--appdir", root], {
      cwd: temporary,
      env: environment,
      stdio: "inherit",
    });
    await regular(temporary, name);
    await chmod(candidate, 0o755);
    // Extract in a separate directory and compare all payload bytes/links/modes.
    const verifyDirectory = await mkdtemp(join(temporary, "verify-"));
    await execute(candidate, ["--appimage-extract"], { cwd: verifyDirectory });
    const actual = await verifyAppDir(join(verifyDirectory, "squashfs-root"));
    requireCondition(
      JSON.stringify(actual) === JSON.stringify(expected),
      "Repacked payload differs from the validated AppDir.",
    );
    await rename(candidate, original);
    console.log(
      `Prepared and verified ${name}: host Wayland + isolated bundled GIO. Not yet signed or runtime-tested.`,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [argument, ...extra] = process.argv.slice(2);
  try {
    if (argument === "--verify-appdir" && extra.length === 1) {
      await verifyAppDir(await realpath(extra[0]));
      console.log("AppImage compatibility policy verified.");
    } else {
      requireCondition(
        argument && extra.length === 0,
        "Usage: node prepare-appimage-linux.mjs <tauri-bundle-root> | --verify-appdir <AppDir>",
      );
      await prepareBundle(argument);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
