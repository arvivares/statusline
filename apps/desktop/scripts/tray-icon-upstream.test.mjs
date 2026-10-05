import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const native = new URL("../src-tauri/", import.meta.url);
const cargo = readFileSync(new URL("Cargo.toml", native), "utf8");
const lock = readFileSync(new URL("Cargo.lock", native), "utf8");
const entries = (name) =>
  lock
    .split("[[package]]")
    .filter((entry) => entry.includes(`\nname = "${name}"\n`));

describe("upstream macOS 27 tray compatibility", () => {
  it("selects the registry release containing the upstream click-forwarding fix", () => {
    // tray-icon#365 is included in 0.25.1. The registry checksum replaces
    // the retired vendor inventory; Cargo verifies the actual downloaded crate.
    expect(entries("tray-icon")).toHaveLength(1);
    expect(entries("tray-icon")[0]).toContain('version = "0.25.1"');
    expect(entries("tray-icon")[0]).toContain(
      'source = "registry+https://github.com/rust-lang/crates.io-index"',
    );
    expect(entries("tray-icon")[0]).toContain(
      'checksum = "b2b9c52859a94554803ccd4a24b98f74148ebc73b90676d783f3490b1bff9d72"',
    );
    expect(cargo).not.toMatch(/\[patch\.|vendor\/tray-icon/);
    expect(existsSync(new URL("vendor/tray-icon/Cargo.toml", native))).toBe(
      false,
    );
  });

  it("keeps the JS dialog and native dialog on the same Tauri series", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", native), "utf8"),
    );
    expect(cargo).toContain('tauri = { version = "=2.12.1"');
    expect(entries("tauri")).toHaveLength(1);
    expect(entries("tauri")[0]).toContain('version = "2.12.1"');
    expect(pkg.dependencies["@tauri-apps/plugin-dialog"]).toBe("2.8.1");
    expect(cargo).toContain('tauri-plugin-dialog = "=2.8.1"');
    expect(entries("tauri-plugin-dialog")).toHaveLength(1);
    expect(entries("tauri-plugin-dialog")[0]).toContain('version = "2.8.1"');
  });

  it("preserves left-click toggling instead of showing the menu on macOS", () => {
    for (const file of ["src/lib.rs", "examples/macos-tray-smoke.rs"]) {
      const source = readFileSync(new URL(file, native), "utf8");
      expect(source, file).toContain(".show_menu_on_left_click(false)");
      expect(source, file).toContain("MouseButton::Left");
      expect(source, file).toContain("MouseButtonState::Up");
    }
  });
});
