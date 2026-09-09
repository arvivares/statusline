#[path = "../../src-tauri/src/app_server.rs"]
pub mod app_server;
#[path = "../../src-tauri/src/codex_installation.rs"]
pub mod codex_installation;
#[path = "../../src-tauri/src/localization.rs"]
pub mod localization;
#[path = "../../src-tauri/src/usage.rs"]
pub mod usage;

// Reuse the production protocol/normalization contracts without copying tests.
#[cfg(test)]
extern crate self as statusline_desktop_lib;
#[cfg(test)]
#[path = "../../src-tauri/tests/app_server_contract.rs"]
mod app_server_contract;
#[cfg(test)]
#[path = "../../src-tauri/tests/usage_contract.rs"]
mod usage_contract;
