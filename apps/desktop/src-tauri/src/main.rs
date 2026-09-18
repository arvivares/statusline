// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let mut arguments = std::env::args_os().skip(1);
    match arguments.next().as_deref() {
        Some(value) if value == std::ffi::OsStr::new("--statusline-codex-diagnostic") => {
            let Some(output_path) = arguments.next() else {
                std::process::exit(2);
            };
            if statusline_desktop_lib::write_codex_diagnostic(std::path::Path::new(&output_path))
                .is_err()
            {
                std::process::exit(1);
            }
            return;
        }
        // Claude Code runs this as the user's statusLine command. Nothing else
        // in the app starts: no window, tray, relay or update check.
        Some(value)
            if value == std::ffi::OsStr::new(statusline_desktop_lib::claude::BRIDGE_FLAG) =>
        {
            let Some(capture_path) = arguments.next() else {
                std::process::exit(2);
            };
            match statusline_desktop_lib::claude::run_bridge(std::path::Path::new(&capture_path)) {
                Ok(()) => return,
                Err(statusline_desktop_lib::claude::BridgeFailure::Input) => std::process::exit(3),
                Err(statusline_desktop_lib::claude::BridgeFailure::Output) => std::process::exit(1),
            }
        }
        Some(value) if value == std::ffi::OsStr::new("--statusline-window-smoke") => {
            let Some(output_path) = arguments.next() else {
                std::process::exit(2);
            };
            if statusline_desktop_lib::set_window_ready_marker(output_path.into()).is_err() {
                std::process::exit(2);
            }
        }
        _ => {}
    }

    statusline_desktop_lib::run()
}
