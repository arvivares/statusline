# Companion window behavior

The companion is a transient tray/menu-bar window, not a process that exits when
its window disappears. This policy is shared by macOS, Windows and Linux; mobile
apps and widgets are unchanged.

## Interaction contract

- Clicking outside or switching to another app hides the companion when the OS
  reports focus loss. The native refresh/publish loop keeps running.
- A 180 ms deferred check confirms the window is still visible and unfocused.
  Regaining focus, showing/hiding the window or a newer interaction invalidates
  old checks. There is no persistent polling or global input/accessibility hook.
- Hovering/pressing the tray icon suspends blur dismissal until its own interaction
  completes. A click still toggles the window once; it must not hide on mouse-down
  and unexpectedly reopen on mouse-up. Leaving the tray resumes the focus check.
- Close hides the window; only the explicit **Quit** command exits. **Show**, the
  tray toggle and launching a second instance can reopen it. Existing settings,
  sample state and in-progress operations are preserved.
- The Codex file picker is opened by native code with the main window as parent.
  A callback-owned guard suspends auto-hide until selection, cancellation or
  callback disposal. The WebView cannot accidentally leave a permanent blur
  suppression flag behind. Source controls disable while the picker is active and
  re-enable in `finally`, including cancellation/error paths. Showing an existing
  dialog does not open a second one, and a tray click cannot hide its parent.
- After the picker closes, focus is checked again rather than forcibly activating
  the app if the user has switched away.

Tauri does not emit raw tray mouse events on Linux; its tray context menu remains
the portable **Show** entry point. Linux focus-loss dismissal does not depend on
those mouse events. The tray and native focus behavior still depend on desktop/
window-manager support. See [Tauri system tray](https://v2.tauri.app/learn/system-tray/)
and [native dialogs](https://v2.tauri.app/plugin/dialog/).

## Implementation and verification

`apps/desktop/src-tauri/src/window_behavior.rs` contains the platform-independent
state policy, imported directly by the lightweight runtime test crate. Native
events, deferred main-thread focus checks and the dialog guard are wired in
`lib.rs`. Visibility code neither owns nor cancels the refresh coordinator.

Previously, `BlurPolicy::Preserve` explicitly kept macOS/Windows visible on blur;
only Linux used `Hide`. Simply changing the flag would have reintroduced the
tray-click race and hidden the parent of native file dialogs.

Before release, check each platform with a running companion:

1. Open the window, click another application, and click the desktop. Confirm
   dismissal when focus leaves, then reopen it from the tray/menu.
2. Repeat a normal and a slow tray click while the window is visible. It closes
   once, without flicker/reopening. Quickly switch away and back; an old pending
   hide must not dismiss the newly focused window.
3. Open Source Settings and the file picker. Its parent stays visible. Cancel,
   choose a file, and switch to another app while the picker is open. On return,
   finish/cancel and verify normal outside-click dismissal resumes.
4. Confirm the Windows frontend-ready startup still works, macOS stays out of the
   Dock, and Linux can reopen via **Show** in the tray menu. Closing is not quitting.
5. Leave the window hidden across two refreshes. Compare read/publication times
   and mobile samples without re-pairing or changing credentials.

Local evidence: all 50 lightweight Rust tests passed, including seven window-policy
regressions. The native macOS library passed `cargo check`; the lightweight crate's
Windows target and all test targets passed cross-target type checking. Desktop
tests passed (141 passed, one existing skip), as did TypeScript, formatting,
localization (413 messages) and 236 local Markdown links. Clippy reports only the
existing `refresh.rs` `collapsible_if` warning. This is **not** physical
click/OS-window-manager validation. The subsequent CI run passed the production
Rust tests on Windows, Linux and macOS, plus the Windows PowerShell fixture test.
Release preparation includes these changes in companion `0.1.16`. Separately, `release.json` records
iOS build 6 to match the project and the already-uploaded TestFlight candidate;
this metadata alignment does not upload a new build or replace App Review.
