use std::{
    path::Path,
    process::Stdio,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Deserialize;
use serde_json::{Value, json};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines},
    process::{Child, ChildStdin, ChildStdout},
    time::timeout,
};

use crate::{
    codex_installation::{configure_hidden_process, resolve_codex_launch},
    usage::{UsageResponse, normalize_usage},
};

const RESPONSE_TIMEOUT: Duration = Duration::from_secs(12);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, PartialEq, thiserror::Error)]
pub enum AppServerError {
    #[error("Codex CLI was not found; install Codex or configure its path in Statusline")]
    CodexNotFound,
    #[error("Could not start Codex App Server: {0}")]
    Spawn(String),
    #[error("Codex App Server I/O failed: {0}")]
    Io(String),
    #[error("Timed out waiting for Codex App Server during {0}")]
    Timeout(&'static str),
    #[error("Codex App Server closed stdout before responding")]
    UnexpectedEof,
    #[error("Codex App Server returned error {code}: {message}")]
    Rpc { code: i64, message: String },
    #[error("Codex App Server returned an incomplete response envelope")]
    InvalidEnvelope,
    #[error("Codex App Server returned invalid JSON: {0}")]
    InvalidJson(String),
    #[error("Codex App Server could not be stopped cleanly: {0}")]
    Shutdown(String),
}

pub async fn fetch_usage(client_version: &str, settings_directory: Option<&Path>) -> UsageResponse {
    let checked_at = unix_timestamp();
    match query_account_usage(client_version, settings_directory).await {
        Ok(results) => normalize_usage(results.account, results.rate_limits, checked_at),
        Err(error) => UsageResponse::Error {
            code: error.code().to_owned(),
            message: error.to_string(),
            checked_at,
        },
    }
}

#[must_use]
pub fn protocol_messages(client_version: &str) -> [Value; 4] {
    [
        json!({
            "method": "initialize",
            "id": 0,
            "params": {
                "clientInfo": {
                    "name": "statusline_desktop",
                    "title": "Statusline Companion",
                    "version": client_version
                }
            }
        }),
        json!({ "method": "initialized", "params": {} }),
        json!({
            "method": "account/read",
            "id": 1,
            "params": { "refreshToken": false }
        }),
        json!({ "method": "account/rateLimits/read", "id": 2 }),
    ]
}

pub fn response_result(line: &str, expected_id: u64) -> Result<Option<Value>, AppServerError> {
    let envelope = serde_json::from_str::<ResponseEnvelope>(line)
        .map_err(|error| AppServerError::InvalidJson(error.to_string()))?;
    let Some(id) = envelope.id else {
        return Ok(None);
    };
    if !id.matches(expected_id) {
        return Ok(None);
    }
    if let Some(error) = envelope.error {
        return Err(AppServerError::Rpc {
            code: error.code,
            message: error.message,
        });
    }
    envelope
        .result
        .map(Some)
        .ok_or(AppServerError::InvalidEnvelope)
}

#[derive(Debug, Deserialize)]
struct ResponseEnvelope {
    id: Option<RequestId>,
    result: Option<Value>,
    error: Option<RpcError>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum RequestId {
    Number(u64),
    String(String),
}

impl RequestId {
    fn matches(&self, expected: u64) -> bool {
        match self {
            Self::Number(value) => *value == expected,
            Self::String(value) => value.parse::<u64>() == Ok(expected),
        }
    }
}

#[derive(Debug, Deserialize)]
struct RpcError {
    code: i64,
    message: String,
}

#[derive(Debug)]
struct AccountUsageResults {
    account: Value,
    rate_limits: Value,
}

impl AppServerError {
    fn code(&self) -> &'static str {
        match self {
            Self::CodexNotFound => "codexNotFound",
            Self::Timeout(_) => "timeout",
            Self::Rpc { code: -32001, .. } => "overloaded",
            Self::Spawn(_)
            | Self::Io(_)
            | Self::UnexpectedEof
            | Self::Rpc { .. }
            | Self::InvalidEnvelope
            | Self::InvalidJson(_)
            | Self::Shutdown(_) => "appServer",
        }
    }
}

async fn query_account_usage(
    client_version: &str,
    settings_directory: Option<&Path>,
) -> Result<AccountUsageResults, AppServerError> {
    let launch = resolve_codex_launch(settings_directory).ok_or(AppServerError::CodexNotFound)?;
    let mut command = launch.command();
    command
        .arg("app-server")
        .arg("--listen")
        .arg("stdio://")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    configure_hidden_process(&mut command);

    let mut child = command
        .spawn()
        .map_err(|error| AppServerError::Spawn(error.to_string()))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppServerError::Spawn("child process did not expose stdin".to_owned()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppServerError::Spawn("child process did not expose stdout".to_owned()))?;
    let mut lines = BufReader::new(stdout).lines();
    let [initialize, initialized, account_read, rate_limits_read] =
        protocol_messages(client_version);

    write_message(&mut stdin, &initialize).await?;
    wait_for_result(&mut lines, 0, "initialization").await?;
    write_message(&mut stdin, &initialized).await?;
    write_message(&mut stdin, &account_read).await?;
    let account = wait_for_result(&mut lines, 1, "account read").await?;
    write_message(&mut stdin, &rate_limits_read).await?;
    let rate_limits = wait_for_result(&mut lines, 2, "rate-limit read").await?;

    drop(stdin);
    stop_child(&mut child).await?;
    Ok(AccountUsageResults {
        account,
        rate_limits,
    })
}

async fn write_message(stdin: &mut ChildStdin, message: &Value) -> Result<(), AppServerError> {
    let mut encoded = serde_json::to_vec(message)
        .map_err(|error| AppServerError::InvalidJson(error.to_string()))?;
    encoded.push(b'\n');
    stdin
        .write_all(&encoded)
        .await
        .map_err(|error| AppServerError::Io(error.to_string()))?;
    stdin
        .flush()
        .await
        .map_err(|error| AppServerError::Io(error.to_string()))
}

async fn wait_for_result(
    lines: &mut Lines<BufReader<ChildStdout>>,
    expected_id: u64,
    phase: &'static str,
) -> Result<Value, AppServerError> {
    timeout(RESPONSE_TIMEOUT, async {
        loop {
            let line = lines
                .next_line()
                .await
                .map_err(|error| AppServerError::Io(error.to_string()))?
                .ok_or(AppServerError::UnexpectedEof)?;
            if let Some(result) = response_result(&line, expected_id)? {
                return Ok(result);
            }
        }
    })
    .await
    .map_err(|_| AppServerError::Timeout(phase))?
}

async fn stop_child(child: &mut Child) -> Result<(), AppServerError> {
    match timeout(SHUTDOWN_TIMEOUT, child.wait()).await {
        Ok(result) => result
            .map(|_| ())
            .map_err(|error| AppServerError::Shutdown(error.to_string())),
        Err(_) => {
            child
                .kill()
                .await
                .map_err(|error| AppServerError::Shutdown(error.to_string()))?;
            child
                .wait()
                .await
                .map(|_| ())
                .map_err(|error| AppServerError::Shutdown(error.to_string()))
        }
    }
}

fn unix_timestamp() -> i64 {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    i64::try_from(seconds).unwrap_or(i64::MAX)
}
