# macOS 27 tray click compatibility

This is the published `tray-icon` **0.24.2** crate with only the macOS menu
attachment fix backported from [upstream PR #365](https://github.com/tauri-apps/tray-icon/pull/365),
merged as `42eb44ea1507d51b68a8b2fbb0d96a9c85f5b4cd` on 2026-09-16.
Original MIT/Apache-2.0 notices and licenses are retained.

## Why a local patch

Statusline pins Tauri 2.11.5, which depends on `tray-icon ^0.24` and its `gtk`
feature with `muda ^0.19`. The fixed 0.25 series changes those dependencies and
features, so forcing that version is not a compatible dependency update.

On macOS 27, permanently attaching `NSMenu` to `NSStatusItem` intercepts the
left click before our handler, despite `show_menu_on_left_click(false)`.
The upstream change retains the menu separately, attaches it only while showing
the context menu and detaches it immediately afterwards. It clones the retained
menu out of the `RefCell` before the nested AppKit event loop, so changing menu
items while the menu is open does not cause a borrow panic.

## Scope and reproducibility

- Base archive and per-file SHA-256 values are recorded in [UPSTREAM.json](UPSTREAM.json).
  The archive hash matches the registry checksum previously in Companion's lockfile.
- Only `src/platform_impl/macos/mod.rs` differs from the published runtime code.
  Windows/Linux files and both Cargo manifests are byte-for-byte unchanged.
- `LICENSE.spdx` has a final newline added; its original text hash is also verified.
- The crate's unused development lockfile and registry bookkeeping are omitted.
  Companion's lockfile remains authoritative: no dependency versions or edges change.
- `npm test -- scripts/tray-icon-vendor.test.mjs` checks the inventory and hashes
  offline on every CI platform; normal native CI compiles the selected patch.
- The patch does not own synchronization, account state, pairing or window
  auto-hide. Companion's existing window-policy tests continue to cover those
  visibility interactions without running agents.

## Removal

When the pinned Tauri release supports a fixed upstream `tray-icon`, upgrade
through the normal dependency review, remove `[patch.crates-io]`, this directory
and its integrity test, then regenerate the lockfile. Validate left-click
open/close, right-click menu, outside-click hide and native file-picker focus on
macOS 26 and 27 before removing the compatibility patch.

## Native verification

On 2026-09-20 the isolated probe passed on macOS **27.0 (26A428)** using mouse
events posted through the OS, not calls directly into the click handlers:

- Left Down/Up opens the window; a second click closes it.
- Right click shows the two diagnostic menu actions without opening the window.
- Selecting an action replaces the menu without a borrow panic; the following
  left click still opens the window.
- Clicking the separate blank diagnostic window hides the focused probe.
- The diagnostic menu can exit the probe cleanly.

Run it manually on a graphical macOS session from the repository root:

```sh
cargo run --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --example macos-tray-smoke
```

An **SL Test** icon and blank test window appear for at most 60 seconds. No
agents, credentials, relay or actual Companion settings are loaded. Output
contains only the probe's own mouse/menu events and visibility. The example
reuses the production `WindowBehavior` policy; it is not an installed-app or
installer test. CI checks that it compiles, but does not claim graphical coverage.
macOS 26 was not available locally for an interactive rerun; that remains part
of release validation, alongside Windows/Linux native CI.
