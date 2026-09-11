#[path = "../../src-tauri/src/app_server.rs"]
pub mod app_server;
#[path = "../../src-tauri/src/codex_installation.rs"]
pub mod codex_installation;
#[path = "../../src-tauri/src/localization.rs"]
pub mod localization;
#[cfg(target_os = "macos")]
#[path = "../../src-tauri/src/macos_update.rs"]
pub mod macos_update;
#[path = "../../src-tauri/src/refresh.rs"]
pub mod refresh;
#[path = "../../src-tauri/src/update_policy.rs"]
pub mod update_policy;
#[path = "../../src-tauri/src/update_signature.rs"]
pub mod update_signature;
#[path = "../../src-tauri/src/update_transaction.rs"]
pub mod update_transaction;
#[path = "../../src-tauri/src/usage.rs"]
pub mod usage;
#[path = "../../src-tauri/src/window_behavior.rs"]
pub mod window_behavior;

// Reuse the production protocol/normalization contracts without copying tests.
#[cfg(test)]
extern crate self as statusline_desktop_lib;
#[cfg(test)]
#[path = "../../src-tauri/tests/app_server_contract.rs"]
mod app_server_contract;
#[cfg(test)]
#[path = "../../src-tauri/tests/usage_contract.rs"]
mod usage_contract;
