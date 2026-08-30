use std::path::PathBuf;

use serde_json::json;
use statusline_desktop_lib::{
    app_server::{AppServerError, protocol_messages, response_result},
    codex_installation::{codex_candidates, unix_common_paths, windows_common_paths},
};

#[test]
fn protocol_messages_match_the_documented_handshake_and_account_calls() {
    let messages = protocol_messages("0.1.0");

    assert_eq!(
        messages,
        [
            json!({
                "method": "initialize",
                "id": 0,
                "params": {
                    "clientInfo": {
                        "name": "statusline_desktop",
                        "title": "Statusline Companion",
                        "version": "0.1.0"
                    }
                }
            }),
            json!({ "method": "initialized", "params": {} }),
            json!({
                "method": "account/read",
                "id": 1,
                "params": { "refreshToken": false }
            }),
            json!({ "method": "account/rateLimits/read", "id": 2 })
        ]
    );
}

#[test]
fn response_result_ignores_notifications_while_waiting_for_a_request() {
    let line = r#"{"method":"account/rateLimits/updated","params":{"rateLimits":null}}"#;

    let result = response_result(line, 2).expect("a notification should be valid protocol data");

    assert_eq!(result, None);
}

#[test]
fn response_result_ignores_a_response_for_another_request_id() {
    let line = r#"{"id":1,"result":{"account":{"type":"chatgpt"}}}"#;

    let result =
        response_result(line, 2).expect("another response should remain valid protocol data");

    assert_eq!(result, None);
}

#[test]
fn response_result_returns_the_result_for_the_expected_request_id() {
    let line = r#"{"id":2,"result":{"rateLimitsByLimitId":{}}}"#;

    let result = response_result(line, 2).expect("matching response should parse");

    assert_eq!(result, Some(json!({ "rateLimitsByLimitId": {} })));
}

#[test]
fn response_result_preserves_app_server_error_code_and_message() {
    let line = r#"{"id":2,"error":{"code":-32600,"message":"Not initialized"}}"#;

    let error = response_result(line, 2).expect_err("an RPC error must not become a result");

    assert_eq!(
        error,
        AppServerError::Rpc {
            code: -32600,
            message: "Not initialized".to_owned(),
        }
    );
}

#[test]
fn response_result_rejects_a_matching_envelope_without_result_or_error() {
    let line = r#"{"id":2}"#;

    let error = response_result(line, 2).expect_err("an incomplete response must be rejected");

    assert_eq!(error, AppServerError::InvalidEnvelope);
}

#[test]
fn codex_candidates_prioritize_configuration_then_known_install_then_path() {
    let configured = PathBuf::from("C:/configured/codex.exe");
    let known_install = PathBuf::from("C:/known/codex.exe");
    let path_entries = [PathBuf::from("C:/first"), PathBuf::from("C:/second")];

    let candidates = codex_candidates(
        Some(&configured),
        std::slice::from_ref(&known_install),
        &path_entries,
        &["codex.exe"],
    );

    assert_eq!(
        candidates,
        vec![
            configured,
            known_install,
            PathBuf::from("C:/first/codex.exe"),
            PathBuf::from("C:/second/codex.exe"),
        ]
    );
}

#[test]
fn codex_candidates_remove_duplicates_without_changing_precedence() {
    let configured = PathBuf::from("C:/same/codex.exe");
    let path_entries = [PathBuf::from("C:/same"), PathBuf::from("C:/other")];

    let candidates = codex_candidates(Some(&configured), &[], &path_entries, &["codex.exe"]);

    assert_eq!(
        candidates,
        vec![configured, PathBuf::from("C:/other/codex.exe")]
    );
}

#[test]
fn windows_common_paths_cover_standalone_npm_volta_and_nvm() {
    let paths = windows_common_paths(
        Some(PathBuf::from("C:/Users/Ada").as_path()),
        Some(PathBuf::from("C:/Users/Ada/AppData/Roaming").as_path()),
        Some(PathBuf::from("C:/Users/Ada/AppData/Local").as_path()),
        Some(PathBuf::from("C:/Program Files").as_path()),
        Some(PathBuf::from("C:/nvm/current").as_path()),
    );

    assert!(paths.contains(&PathBuf::from("C:/Users/Ada/.local/bin/codex.exe")));
    assert!(paths.contains(&PathBuf::from(
        "C:/Users/Ada/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe"
    )));
    assert!(paths.contains(&PathBuf::from("C:/Users/Ada/AppData/Roaming/npm/codex.cmd")));
    assert!(paths.contains(&PathBuf::from("C:/Users/Ada/.volta/bin/codex.exe")));
    assert!(paths.contains(&PathBuf::from(
        "C:/Users/Ada/AppData/Local/Volta/bin/codex.exe"
    )));
    assert!(paths.contains(&PathBuf::from(
        "C:/Users/Ada/AppData/Local/Microsoft/WindowsApps/codex.exe"
    )));
    assert!(paths.contains(&PathBuf::from("C:/nvm/current/codex.cmd")));
}

#[test]
fn unix_common_paths_cover_gui_safe_install_locations() {
    let home = PathBuf::from("/home/ada");
    let paths = unix_common_paths(Some(&home));

    assert!(paths.contains(&PathBuf::from("/home/ada/.local/bin/codex")));
    assert!(paths.contains(&PathBuf::from("/home/ada/.volta/bin/codex")));
    assert!(paths.contains(&PathBuf::from("/opt/homebrew/bin/codex")));
}
