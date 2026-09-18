//! Passive Claude discovery plus the opt-in Claude Code statusline bridge.
//!
//! Claude Code documents one supported way to expose subscription quota to an
//! external program: the user's `statusLine` command receives session JSON on
//! stdin, including `rate_limits`. The bridge below is that command. It keeps
//! only the documented rate-limit windows and a capture time, never the
//! session, transcript, workspace, cost or context fields. No credentials,
//! conversation caches or vendor HTTP endpoints are accessed, and no prompt is
//! ever used as a quota query. Installation evidence is NOT authentication
//! evidence: quota appears only after Claude Code itself reports it.
use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

use crate::antigravity::timestamp;
use crate::refresh::RefreshCoordinator;

static REVISION: AtomicU64 = AtomicU64::new(0);

/// Reduced capture written by the bridge inside Companion's own config folder.
pub const CAPTURE_FILE: &str = "claude-statusline-capture-v1.json";
/// The user's previous `statusLine` object, restored on disconnect and chained
/// by the bridge so an existing custom status line keeps working.
pub const CHAIN_FILE: &str = "claude-statusline-chain-v1.json";
/// Verbatim copy of the user's `settings.json` taken before the first edit.
pub const BACKUP_FILE: &str = "claude-settings-backup-v1.json";
/// Command-line flag that turns the Companion executable into the bridge.
pub const BRIDGE_FLAG: &str = "--statusline-claude-bridge";
/// Claude Code re-runs the command on this timer so idle sessions stay fresh.
pub const BRIDGE_REFRESH_SECONDS: u64 = 60;
const MAX_INPUT: usize = 65_536;
const MAX_SETTINGS: u64 = 1_048_576;
const MAX_TIMESTAMP: i64 = 253_402_300_799;
/// Tolerated clock skew between the bridge process and Companion.
const FUTURE_SKEW: i64 = 300;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installations {
    pub cli: bool,
    pub desktop: bool,
}

impl Installations {
    pub fn detected(self) -> bool {
        self.cli || self.desktop
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    NotFound,
    /// Installed, but no usable quota sample: bridge not connected, no session
    /// has reported yet, or every captured window already reset.
    QuotaUnavailable,
    DiscoveryUnavailable,
    /// At least one documented rate-limit window is current.
    Ready,
    /// A session reported without `rate_limits`. API-key, Bedrock, Vertex and
    /// Foundry sessions have no plan quota; a brand-new session may also report
    /// before its first API response.
    NoPlanQuota,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Connection {
    /// No `statusLine` in the user's Claude Code settings.
    None,
    /// The user's `statusLine` runs this Companion's bridge.
    Connected,
    /// The user has their own `statusLine`; connecting will chain it.
    Custom,
    /// Claude Code settings could not be read.
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub revision: u64,
    pub checked_at: i64,
    pub installations: Installations,
    // Never emit "ready" just because an executable exists.
    pub status: Status,
    pub connection: Connection,
    pub quota: Option<QuotaSample>,
    /// Last time any Claude Code session ran the bridge, even without quota.
    pub captured_at: Option<i64>,
}

impl View {
    fn build(installations: Installations, connection: Connection, reading: Reading) -> Self {
        let (status, quota, captured_at) = match reading {
            Reading::Quota {
                sample,
                captured_at,
            } if sample.weekly.is_some() || sample.short_window.is_some() => {
                (Status::Ready, Some(sample), Some(captured_at))
            }
            Reading::Quota {
                sample,
                captured_at,
            } => (Status::NoPlanQuota, Some(sample), Some(captured_at)),
            Reading::NoPlanQuota { captured_at } => (Status::NoPlanQuota, None, Some(captured_at)),
            Reading::Expired { captured_at } if installations.detected() => {
                (Status::QuotaUnavailable, None, Some(captured_at))
            }
            Reading::Expired { .. } | Reading::Missing => (
                if installations.detected() {
                    Status::QuotaUnavailable
                } else {
                    Status::NotFound
                },
                None,
                None,
            ),
        };
        Self {
            revision: REVISION.fetch_add(1, Ordering::Relaxed) + 1,
            checked_at: timestamp(),
            installations,
            status,
            connection,
            quota,
            captured_at,
        }
    }

    pub fn visible(&self) -> bool {
        self.installations.detected() || matches!(self.status, Status::Ready | Status::NoPlanQuota)
    }
}

#[derive(Default)]
pub struct State {
    cache: RefreshCoordinator<View>,
    pending: tokio::sync::Mutex<Option<tokio::task::JoinHandle<Installations>>>,
}

impl State {
    async fn scan(&self, deadline: Duration) -> Option<Installations> {
        let mut pending = self.pending.lock().await;
        let task = pending.get_or_insert_with(|| tokio::task::spawn_blocking(discover));
        match tokio::time::timeout(deadline, task).await {
            Ok(result) => {
                *pending = None;
                result.ok()
            }
            // Rust cannot cancel a blocked OS metadata call. Retain the handle
            // so future polls reuse that worker instead of accumulating them.
            Err(_) => None,
        }
    }
}

/// `directory` is Companion's own config folder holding the bridge capture.
pub async fn refresh(state: &State, directory: Option<&Path>, age: Duration) -> View {
    state
        .cache
        .refresh(age, || async {
            let now = timestamp();
            let reading = directory.map_or(Reading::Missing, |directory| {
                read_capture(&directory.join(CAPTURE_FILE), now)
            });
            let connection = connection_state(claude_config_dir().as_deref());
            // Isolate filesystem probes from the async runtime. A slow/missing
            // installation cannot hold up Codex/Gemini or the startup inventory.
            match state.scan(Duration::from_secs(3)).await {
                Some(installations) => View::build(installations, connection, reading),
                _ => View {
                    revision: REVISION.fetch_add(1, Ordering::Relaxed) + 1,
                    checked_at: now,
                    installations: Installations::default(),
                    status: Status::DiscoveryUnavailable,
                    connection,
                    quota: None,
                    captured_at: None,
                },
            }
        })
        .await
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Platform {
    Mac,
    Linux,
    Windows,
}

#[derive(Debug)]
struct Candidate {
    path: PathBuf,
    desktop: bool,
}

/// Documented native CLI launchers and conventional system installation roots.
/// The inherited PATH, shell init files, project folders and credential stores
/// are deliberately not searched. Desktop paths are presence heuristics only.
fn candidates(
    platform: Platform,
    home: Option<&Path>,
    local: Option<&Path>,
    program_files: Option<&Path>,
) -> Vec<Candidate> {
    let mut result = Vec::new();
    let mut add = |path: PathBuf, desktop| {
        if path.is_absolute() {
            result.push(Candidate { path, desktop });
        }
    };
    if let Some(home) = home {
        add(
            home.join(if platform == Platform::Windows {
                ".local/bin/claude.exe"
            } else {
                ".local/bin/claude"
            }),
            false,
        );
        if platform == Platform::Mac {
            add(
                home.join("Applications/Claude.app/Contents/MacOS/Claude"),
                true,
            );
        }
    }
    match platform {
        Platform::Mac => {
            for path in ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"] {
                add(path.into(), false);
            }
            add(
                "/Applications/Claude.app/Contents/MacOS/Claude".into(),
                true,
            );
        }
        Platform::Linux => {
            for root in ["/usr/local/bin", "/usr/bin"] {
                add(Path::new(root).join("claude"), false);
                add(Path::new(root).join("claude-desktop"), true);
            }
        }
        Platform::Windows => {
            if let Some(local) = local {
                add(local.join("Microsoft/WinGet/Links/claude.exe"), false);
                add(local.join("AnthropicClaude/claude.exe"), true);
                add(local.join("Programs/Claude/Claude.exe"), true);
            }
            if let Some(root) = program_files {
                add(root.join("Claude/Claude.exe"), true);
            }
        }
    }
    result
}

fn discover_candidates(candidates: &[Candidate]) -> Installations {
    let mut installations = Installations::default();
    for candidate in candidates {
        // Metadata only; never execute a discovered launcher (including scripts).
        // A name/path is a hint, not signature verification or an auth check.
        if executable_exists(&candidate.path) {
            if candidate.desktop {
                installations.desktop = true;
            } else {
                installations.cli = true;
            }
        }
    }
    installations
}

fn executable_exists(path: &Path) -> bool {
    if !path.is_absolute() {
        return false;
    }
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    if !metadata.is_file() || metadata.len() == 0 {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o111 == 0 {
            return false;
        }
    }
    true
}

fn home_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        dirs::home_dir()
    }
    #[cfg(not(windows))]
    {
        env::var_os("HOME").map(PathBuf::from)
    }
}

pub fn discover() -> Installations {
    let platform = if cfg!(target_os = "macos") {
        Platform::Mac
    } else if cfg!(windows) {
        Platform::Windows
    } else {
        Platform::Linux
    };
    let home = home_dir();
    let local = env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let program_files = env::var_os("ProgramFiles").map(PathBuf::from);
    discover_candidates(&candidates(
        platform,
        home.as_deref(),
        local.as_deref(),
        program_files.as_deref(),
    ))
}

/// Claude Code's user settings folder: `CLAUDE_CONFIG_DIR` or `~/.claude`.
/// Only `settings.json` is ever read or written there; credentials, sessions
/// and transcripts in that folder are never opened.
pub fn claude_config_dir() -> Option<PathBuf> {
    if let Some(custom) = env::var_os("CLAUDE_CONFIG_DIR") {
        let path = PathBuf::from(custom);
        return path.is_absolute().then_some(path);
    }
    home_dir().map(|home| home.join(".claude"))
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Quota {
    pub remaining_percent: f64,
    pub resets_at: i64,
}

/// A Claude apps gateway spend cap. Consumption can exceed 100%; this is not
/// subscription quota and never enters the shared `services-v1` projection.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendLimit {
    pub used_percent: f64,
    pub resets_at: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaSample {
    /// When Claude Code last reported these limits, never the read time.
    pub checked_at: i64,
    pub weekly: Option<Quota>,
    pub short_window: Option<Quota>,
    pub spend_limit: Option<SpendLimit>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ParseFailure {
    TooLarge,
    InvalidData,
    InvalidTimestamp,
}

#[derive(Deserialize)]
struct StatuslineInput {
    rate_limits: Option<RateLimits>,
}

/// Official fields: https://code.claude.com/docs/en/statusline#rate-limit-usage
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
struct RateLimits {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    five_hour: Option<RateWindow>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    seven_day: Option<RateWindow>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    spend_limit: Option<RateWindow>,
}

impl RateLimits {
    fn is_empty(&self) -> bool {
        self.five_hour.is_none() && self.seven_day.is_none() && self.spend_limit.is_none()
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
struct RateWindow {
    used_percentage: f64,
    resets_at: i64,
}

fn valid_timestamp(value: i64) -> bool {
    (1..=MAX_TIMESTAMP).contains(&value)
}

fn window(
    raw: Option<&RateWindow>,
    captured_at: i64,
    quota: bool,
) -> Result<Option<(f64, i64)>, ParseFailure> {
    let Some(raw) = raw else {
        return Ok(None);
    };
    let bounded = if quota {
        (0.0..=100.0).contains(&raw.used_percentage)
    } else {
        raw.used_percentage >= 0.0
    };
    if !raw.used_percentage.is_finite() || !bounded || !valid_timestamp(raw.resets_at) {
        return Err(ParseFailure::InvalidData);
    }
    if raw.resets_at <= captured_at {
        return Ok(None);
    }
    Ok(Some((raw.used_percentage, raw.resets_at)))
}

/// Missing or expired quota is unknown, never 100% remaining. Context usage,
/// cost and per-model limits are not subscription quota and are discarded.
fn normalize(limits: &RateLimits, captured_at: i64) -> Result<Option<QuotaSample>, ParseFailure> {
    if !valid_timestamp(captured_at) {
        return Err(ParseFailure::InvalidTimestamp);
    }
    let quota = |raw| {
        window(raw, captured_at, true).map(|w| {
            w.map(|(used, resets_at)| Quota {
                remaining_percent: 100.0 - used,
                resets_at,
            })
        })
    };
    let weekly = quota(limits.seven_day.as_ref())?;
    let short_window = quota(limits.five_hour.as_ref())?;
    let spend_limit = window(limits.spend_limit.as_ref(), captured_at, false)?.map(
        |(used_percent, resets_at)| SpendLimit {
            used_percent,
            resets_at,
        },
    );
    if weekly.is_none() && short_window.is_none() && spend_limit.is_none() {
        return Ok(None);
    }
    Ok(Some(QuotaSample {
        checked_at: captured_at,
        weekly,
        short_window,
        spend_limit,
    }))
}

fn parse_input(input: &[u8]) -> Result<Option<RateLimits>, ParseFailure> {
    if input.len() > MAX_INPUT {
        return Err(ParseFailure::TooLarge);
    }
    let raw: StatuslineInput =
        serde_json::from_slice(input).map_err(|_| ParseFailure::InvalidData)?;
    Ok(raw.rate_limits)
}

/// Pure normalization of one statusline payload. The caller supplies the real
/// capture time; unknown and session fields are ignored, never retained.
pub fn parse_statusline(
    input: &[u8],
    captured_at: i64,
) -> Result<Option<QuotaSample>, ParseFailure> {
    if !valid_timestamp(captured_at) {
        return Err(ParseFailure::InvalidTimestamp);
    }
    match parse_input(input)? {
        Some(limits) => normalize(&limits, captured_at),
        None => Ok(None),
    }
}

/// Everything the bridge persists. Only documented rate-limit fields survive.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Capture {
    schema_version: u8,
    /// Last bridge run, with or without quota.
    captured_at: i64,
    /// When `rate_limits` was last present in a payload.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    limits_captured_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    rate_limits: Option<RateLimits>,
}

fn load_capture(path: &Path) -> Option<Capture> {
    let metadata = fs::metadata(path).ok()?;
    if !metadata.is_file() || metadata.len() > MAX_INPUT as u64 {
        return None;
    }
    let capture: Capture = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    (capture.schema_version == 1 && valid_timestamp(capture.captured_at)).then_some(capture)
}

/// Merge a new payload into the previous capture. A payload without
/// `rate_limits` (session start, API-key session) records activity but keeps
/// the last limits Claude Code reported; a payload with limits replaces them
/// entirely, so windows Claude Code dropped after their reset disappear too.
fn reduce(input: &[u8], now: i64, previous: Option<Capture>) -> Result<Capture, ParseFailure> {
    if !valid_timestamp(now) {
        return Err(ParseFailure::InvalidTimestamp);
    }
    let incoming = parse_input(input)?.filter(|limits| !limits.is_empty());
    let previous = previous.unwrap_or_default();
    let (limits_captured_at, rate_limits) = match incoming {
        Some(limits) => {
            normalize(&limits, now)?;
            (Some(now), Some(limits))
        }
        None => (previous.limits_captured_at, previous.rate_limits),
    };
    Ok(Capture {
        schema_version: 1,
        captured_at: now,
        limits_captured_at,
        rate_limits,
    })
}

fn write_atomically(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let directory = path.parent().ok_or(std::io::ErrorKind::InvalidInput)?;
    fs::create_dir_all(directory)?;
    let mut temp = tempfile::NamedTempFile::new_in(directory)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        temp.as_file()
            .set_permissions(fs::Permissions::from_mode(0o600))?;
    }
    temp.write_all(bytes)?;
    temp.as_file().sync_all()?;
    temp.persist(path).map_err(|error| error.error)?;
    Ok(())
}

#[derive(Debug, PartialEq, Eq)]
pub enum BridgeFailure {
    /// stdin was not a Claude Code statusline payload; nothing was written.
    Input,
    /// The capture could not be stored in Companion's folder.
    Output,
}

/// Human-readable status line printed when the user had no custom command.
fn summary(sample: Option<&QuotaSample>) -> String {
    let mut parts = vec!["Claude".to_owned()];
    if let Some(sample) = sample {
        if let Some(short) = &sample.short_window {
            parts.push(
                crate::localization::text("5h {0}% left")
                    .replace("{0}", &format!("{:.0}", short.remaining_percent)),
            );
        }
        if let Some(weekly) = &sample.weekly {
            parts.push(
                crate::localization::text("7d {0}% left")
                    .replace("{0}", &format!("{:.0}", weekly.remaining_percent)),
            );
        }
        if let Some(spend) = &sample.spend_limit {
            parts.push(
                crate::localization::text("spend limit {0}% used")
                    .replace("{0}", &format!("{:.0}", spend.used_percent)),
            );
        }
    }
    if parts.len() == 1 {
        parts.push(crate::localization::text("plan quota not reported"));
    }
    parts.join(" · ")
}

#[derive(Deserialize)]
struct Chain {
    #[serde(rename = "statusLine")]
    status_line: serde_json::Value,
}

fn chained_command(directory: &Path) -> Option<String> {
    let metadata = fs::metadata(directory.join(CHAIN_FILE)).ok()?;
    if !metadata.is_file() || metadata.len() > MAX_INPUT as u64 {
        return None;
    }
    let chain: Chain = serde_json::from_slice(&fs::read(directory.join(CHAIN_FILE)).ok()?).ok()?;
    let command = chain.status_line.get("command")?.as_str()?.trim();
    (!command.is_empty() && !command.contains(BRIDGE_FLAG)).then(|| command.to_owned())
}

fn run_chained(command: &str, input: &[u8]) -> bool {
    #[cfg(windows)]
    let mut shell = Command::new("cmd");
    #[cfg(windows)]
    shell.args(["/C", command]);
    #[cfg(not(windows))]
    let mut shell = Command::new("sh");
    #[cfg(not(windows))]
    shell.args(["-c", command]);
    let Ok(mut child) = shell
        .stdin(Stdio::piped())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
    else {
        return false;
    };
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input);
    }
    child.wait().is_ok()
}

/// Entry point for `statusline-desktop --statusline-claude-bridge <capture>`.
/// Reads one payload from stdin, stores the reduced capture and prints either
/// the user's previous status line (with the same stdin) or a short summary.
pub fn run_bridge(capture_path: &Path) -> Result<(), BridgeFailure> {
    let mut input = Vec::new();
    std::io::stdin()
        .lock()
        .take(MAX_INPUT as u64 + 1)
        .read_to_end(&mut input)
        .map_err(|_| BridgeFailure::Input)?;
    let now = timestamp();
    let capture =
        reduce(&input, now, load_capture(capture_path)).map_err(|_| BridgeFailure::Input)?;
    let encoded = serde_json::to_vec(&capture).map_err(|_| BridgeFailure::Output)?;
    write_atomically(capture_path, &encoded).map_err(|_| BridgeFailure::Output)?;
    let chained = capture_path
        .parent()
        .and_then(chained_command)
        .is_some_and(|command| run_chained(&command, &input));
    if !chained {
        let sample = capture
            .rate_limits
            .as_ref()
            .zip(capture.limits_captured_at)
            .and_then(|(limits, at)| normalize(limits, at).ok().flatten());
        println!("{}", summary(sample.as_ref()));
    }
    Ok(())
}

#[derive(Debug, PartialEq)]
enum Reading {
    Missing,
    /// A session ran the bridge but no window is current any more.
    Expired {
        captured_at: i64,
    },
    NoPlanQuota {
        captured_at: i64,
    },
    Quota {
        sample: QuotaSample,
        captured_at: i64,
    },
}

/// Re-reading the capture never refreshes its sample time, and windows whose
/// reset already passed are dropped at read time rather than shown as stale.
fn read_capture(path: &Path, now: i64) -> Reading {
    let Some(capture) = load_capture(path) else {
        return Reading::Missing;
    };
    if capture.captured_at > now + FUTURE_SKEW {
        return Reading::Missing;
    }
    let captured_at = capture.captured_at;
    match (capture.rate_limits, capture.limits_captured_at) {
        (Some(limits), Some(at)) if valid_timestamp(at) && at <= captured_at => {
            match normalize(&limits, at) {
                Ok(Some(mut sample)) => {
                    // Evaluate expiry against now, not the capture time.
                    sample.weekly = sample.weekly.filter(|w| w.resets_at > now);
                    sample.short_window = sample.short_window.filter(|w| w.resets_at > now);
                    sample.spend_limit = sample.spend_limit.filter(|w| w.resets_at > now);
                    if sample.weekly.is_none()
                        && sample.short_window.is_none()
                        && sample.spend_limit.is_none()
                    {
                        Reading::Expired { captured_at }
                    } else {
                        Reading::Quota {
                            sample,
                            captured_at,
                        }
                    }
                }
                Ok(None) => Reading::Expired { captured_at },
                Err(_) => Reading::Missing,
            }
        }
        (Some(_), _) => Reading::Missing,
        (None, _) => Reading::NoPlanQuota { captured_at },
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, thiserror::Error)]
#[serde(rename_all = "camelCase")]
pub enum ConnectFailure {
    #[error("Claude Code settings could not be read or written")]
    SettingsUnavailable,
    #[error("Claude Code settings are not a JSON object")]
    InvalidSettings,
    #[error("Companion paths contain characters the status line command cannot quote")]
    UnsupportedPath,
    #[error("Companion could not store the bridge capture")]
    StorageUnavailable,
}

fn read_settings(
    path: &Path,
) -> Result<(Vec<u8>, serde_json::Map<String, serde_json::Value>), ConnectFailure> {
    match fs::metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok((Vec::new(), serde_json::Map::new()))
        }
        Ok(metadata) if metadata.is_file() && metadata.len() <= MAX_SETTINGS => {
            let bytes = fs::read(path).map_err(|_| ConnectFailure::SettingsUnavailable)?;
            if bytes.iter().all(u8::is_ascii_whitespace) {
                return Ok((bytes, serde_json::Map::new()));
            }
            match serde_json::from_slice::<serde_json::Value>(&bytes) {
                Ok(serde_json::Value::Object(map)) => Ok((bytes, map)),
                _ => Err(ConnectFailure::InvalidSettings),
            }
        }
        _ => Err(ConnectFailure::SettingsUnavailable),
    }
}

fn is_bridge(status_line: Option<&serde_json::Value>) -> bool {
    status_line
        .and_then(|value| value.get("command"))
        .and_then(serde_json::Value::as_str)
        .is_some_and(|command| command.contains(BRIDGE_FLAG))
}

/// Reads only `statusLine` from the user's settings to report whether the
/// bridge is active. Never fails loudly: an unreadable file is `Unknown`.
pub fn connection_state(claude_dir: Option<&Path>) -> Connection {
    let Some(claude_dir) = claude_dir else {
        return Connection::Unknown;
    };
    match read_settings(&claude_dir.join("settings.json")) {
        Ok((_, settings)) => match settings.get("statusLine") {
            None | Some(serde_json::Value::Null) => Connection::None,
            Some(value) if is_bridge(Some(value)) => Connection::Connected,
            Some(_) => Connection::Custom,
        },
        Err(_) => Connection::Unknown,
    }
}

fn quoted(path: &Path) -> Result<String, ConnectFailure> {
    let text = path.to_str().ok_or(ConnectFailure::UnsupportedPath)?;
    // These break a double-quoted argument in sh or cmd. Companion and its
    // config folder never need them; refuse rather than guess an escape.
    let forbidden: &[char] = if cfg!(windows) {
        &['"', '%', '\n', '\r', '\0']
    } else {
        &['"', '$', '`', '\\', '\n', '\r', '\0']
    };
    if !path.is_absolute() || text.contains(forbidden) {
        return Err(ConnectFailure::UnsupportedPath);
    }
    Ok(format!("\"{text}\""))
}

pub fn bridge_command(executable: &Path, capture: &Path) -> Result<String, ConnectFailure> {
    Ok(format!(
        "{} {BRIDGE_FLAG} {}",
        quoted(executable)?,
        quoted(capture)?
    ))
}

/// Writes the bridge into the user's `settings.json` `statusLine`. Every other
/// key is preserved. An existing custom status line is stored in the chain
/// file, keeps running through the bridge and is restored by `disconnect`.
pub fn connect(
    directory: &Path,
    claude_dir: &Path,
    executable: &Path,
) -> Result<Connection, ConnectFailure> {
    let capture = directory.join(CAPTURE_FILE);
    let command = bridge_command(executable, &capture)?;
    let settings_path = claude_dir.join("settings.json");
    let (original, mut settings) = read_settings(&settings_path)?;
    fs::create_dir_all(directory).map_err(|_| ConnectFailure::StorageUnavailable)?;
    let backup = directory.join(BACKUP_FILE);
    if !original.is_empty() && !backup.exists() {
        write_atomically(&backup, &original).map_err(|_| ConnectFailure::StorageUnavailable)?;
    }
    let previous = settings.get("statusLine").cloned();
    let mut status_line = serde_json::Map::new();
    if let Some(previous) = previous.as_ref().filter(|v| v.is_object()) {
        if !is_bridge(Some(previous)) {
            let chain = serde_json::json!({ "statusLine": previous });
            write_atomically(
                &directory.join(CHAIN_FILE),
                &serde_json::to_vec(&chain).map_err(|_| ConnectFailure::StorageUnavailable)?,
            )
            .map_err(|_| ConnectFailure::StorageUnavailable)?;
        }
        if let Some(padding) = previous.get("padding") {
            status_line.insert("padding".into(), padding.clone());
        }
        if let Some(interval) = previous
            .get("refreshInterval")
            .and_then(serde_json::Value::as_u64)
            && (1..BRIDGE_REFRESH_SECONDS).contains(&interval)
        {
            status_line.insert("refreshInterval".into(), interval.into());
        }
    }
    status_line.insert("type".into(), "command".into());
    status_line.insert("command".into(), command.into());
    status_line
        .entry("refreshInterval")
        .or_insert_with(|| BRIDGE_REFRESH_SECONDS.into());
    settings.insert("statusLine".into(), serde_json::Value::Object(status_line));
    let encoded = serde_json::to_vec_pretty(&serde_json::Value::Object(settings))
        .map_err(|_| ConnectFailure::SettingsUnavailable)?;
    write_atomically(&settings_path, &encoded).map_err(|_| ConnectFailure::SettingsUnavailable)?;
    Ok(Connection::Connected)
}

/// Restores the user's previous `statusLine` (or removes ours) and deletes the
/// capture. A custom status line that is not ours is left untouched.
pub fn disconnect(directory: &Path, claude_dir: &Path) -> Result<Connection, ConnectFailure> {
    let settings_path = claude_dir.join("settings.json");
    let (_, mut settings) = read_settings(&settings_path)?;
    let chain_path = directory.join(CHAIN_FILE);
    let chained = fs::read(&chain_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Chain>(&bytes).ok())
        .map(|chain| chain.status_line)
        .filter(|value| value.is_object() && !is_bridge(Some(value)));
    if is_bridge(settings.get("statusLine")) {
        match chained {
            Some(previous) => {
                settings.insert("statusLine".into(), previous);
            }
            None => {
                settings.remove("statusLine");
            }
        }
        let encoded = serde_json::to_vec_pretty(&serde_json::Value::Object(settings))
            .map_err(|_| ConnectFailure::SettingsUnavailable)?;
        write_atomically(&settings_path, &encoded)
            .map_err(|_| ConnectFailure::SettingsUnavailable)?;
    }
    let _ = fs::remove_file(chain_path);
    let _ = fs::remove_file(directory.join(CAPTURE_FILE));
    Ok(connection_state(Some(claude_dir)))
}

#[cfg(test)]
mod tests {
    use super::*;
    const NOW: i64 = 1_900_000_000;
    const FIXTURE: &[u8] = include_bytes!("../../../../protocol/fixtures/claude-statusline.json");

    #[test]
    fn timed_out_discovery_reuses_one_worker_and_can_recover() {
        tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap()
            .block_on(async {
                tokio::time::pause();
                let state = State::default();
                let (release, receive) = tokio::sync::oneshot::channel();
                let task = tokio::spawn(async move { receive.await.unwrap() });
                let id = task.id();
                *state.pending.lock().await = Some(task);
                for _ in 0..3 {
                    assert_eq!(state.scan(Duration::from_secs(3)).await, None);
                    assert_eq!(state.pending.lock().await.as_ref().unwrap().id(), id);
                }
                let expected = Installations {
                    cli: true,
                    desktop: true,
                };
                release.send(expected).unwrap();
                assert_eq!(state.scan(Duration::from_secs(3)).await, Some(expected));
                assert!(state.pending.lock().await.is_none());
            });
    }
    fn file(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, b"fixture, must never execute").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(path, fs::Permissions::from_mode(0o700)).unwrap();
        }
    }

    #[test]
    fn native_launchers_are_dynamic_and_independent_of_project_path() {
        let root = tempfile::tempdir().unwrap();
        for platform in [Platform::Mac, Platform::Linux, Platform::Windows] {
            let list = candidates(
                platform,
                Some(root.path()),
                Some(root.path()),
                Some(root.path()),
            );
            assert!(list.iter().all(|c| c.path.is_absolute()));
            assert_eq!(
                list[0].path,
                root.path().join(if platform == Platform::Windows {
                    ".local/bin/claude.exe"
                } else {
                    ".local/bin/claude"
                })
            );
            assert!(
                !list
                    .iter()
                    .any(|c| c.path.to_string_lossy().contains("node_modules"))
            );
        }
        assert!(candidates(Platform::Windows, Some(Path::new("relative")), None, None).is_empty());
    }

    #[test]
    fn discovery_is_passive_and_removal_hides_service() {
        let root = tempfile::tempdir().unwrap();
        let list = vec![Candidate {
            path: root.path().join("claude"),
            desktop: false,
        }];
        assert!(!discover_candidates(&list).detected());
        file(&list[0].path);
        let view = View::build(
            discover_candidates(&list),
            Connection::None,
            Reading::Missing,
        );
        assert_eq!(view.status, Status::QuotaUnavailable);
        assert!(view.installations.cli);
        assert!(!view.installations.desktop);
        assert!(view.quota.is_none());
        fs::remove_file(&list[0].path).unwrap();
        assert_eq!(
            View::build(
                discover_candidates(&list),
                Connection::None,
                Reading::Missing
            )
            .status,
            Status::NotFound
        );
    }

    #[test]
    fn desktop_and_cli_evidence_are_kept_separate() {
        let root = tempfile::tempdir().unwrap();
        let list = vec![
            Candidate {
                path: root.path().join("desktop"),
                desktop: true,
            },
            Candidate {
                path: root.path().join("cli"),
                desktop: false,
            },
        ];
        file(&list[0].path);
        assert_eq!(
            discover_candidates(&list),
            Installations {
                cli: false,
                desktop: true
            }
        );
        file(&list[1].path);
        assert_eq!(
            discover_candidates(&list),
            Installations {
                cli: true,
                desktop: true
            }
        );
        let json = serde_json::to_string(&View::build(
            discover_candidates(&list),
            Connection::None,
            Reading::Missing,
        ))
        .unwrap();
        assert!(!json.contains(root.path().to_str().unwrap()));
        assert!(!json.contains("ready"));
    }

    #[cfg(unix)]
    #[test]
    fn native_symlink_supported_but_directories_empty_and_nonexecutable_files_are_not() {
        use std::os::unix::{fs::PermissionsExt, fs::symlink};
        let root = tempfile::tempdir().unwrap();
        let version = root.path().join("version");
        file(&version);
        let launcher = root.path().join("claude");
        symlink(&version, &launcher).unwrap();
        assert!(executable_exists(&launcher));
        assert!(!executable_exists(root.path()));
        fs::set_permissions(&version, fs::Permissions::from_mode(0o600)).unwrap();
        assert!(!executable_exists(&launcher));
        fs::write(&version, b"").unwrap();
        assert!(!executable_exists(&launcher));
        fs::remove_file(&version).unwrap();
        assert!(!executable_exists(&launcher));
    }

    #[test]
    fn normalizes_official_fields_without_retaining_session_data() {
        let sample = parse_statusline(FIXTURE, NOW).unwrap().unwrap();
        assert_eq!(sample.weekly.as_ref().unwrap().remaining_percent, 53.0);
        assert_eq!(
            sample.short_window.as_ref().unwrap().remaining_percent,
            74.5
        );
        assert_eq!(sample.checked_at, NOW);
        assert!(sample.spend_limit.is_none());
        let json = serde_json::to_string(&sample).unwrap();
        for forbidden in [
            "workspace",
            "session",
            "transcript",
            "fixture-private",
            "cost",
            "context",
            "token",
        ] {
            assert!(!json.contains(forbidden));
        }
    }

    #[test]
    fn missing_expired_or_unsupported_windows_do_not_fabricate_remaining_quota() {
        for raw in [
            r#"{}"#,
            r#"{"rate_limits":null}"#,
            r#"{"rate_limits":{}}"#,
            r#"{"context_window":{"remaining_percentage":80},"cost":{"total_cost_usd":5}}"#,
            r#"{"rate_limits":{"five_hour":{"used_percentage":100,"resets_at":1900000000}}}"#,
            r#"{"rate_limits":{"per_model":{"used_percentage":10,"resets_at":1900000300}}}"#,
        ] {
            assert_eq!(parse_statusline(raw.as_bytes(), NOW), Ok(None), "{raw}");
        }
        let sample = parse_statusline(
            br#"{"rate_limits":{"five_hour":{"used_percentage":100,"resets_at":1900000300}}}"#,
            NOW,
        )
        .unwrap()
        .unwrap();
        assert!(sample.weekly.is_none());
        assert_eq!(sample.short_window.unwrap().remaining_percent, 0.0);
    }

    #[test]
    fn enterprise_seat_with_only_a_short_window_is_a_valid_sample() {
        // Observed on a real Enterprise seat: seven_day absent, five_hour present.
        let sample = parse_statusline(
            br#"{"rate_limits":{"five_hour":{"used_percentage":52,"resets_at":1900000300}}}"#,
            NOW,
        )
        .unwrap()
        .unwrap();
        assert!(sample.weekly.is_none());
        assert_eq!(
            sample.short_window.as_ref().unwrap().remaining_percent,
            48.0
        );
        let view = View::build(
            Installations::default(),
            Connection::Connected,
            Reading::Quota {
                sample,
                captured_at: NOW,
            },
        );
        assert_eq!(view.status, Status::Ready);
        assert!(view.visible());
    }

    #[test]
    fn gateway_spend_limit_is_kept_apart_from_quota_and_may_exceed_100() {
        let sample = parse_statusline(
            br#"{"rate_limits":{"spend_limit":{"used_percentage":120,"resets_at":1900000300}}}"#,
            NOW,
        )
        .unwrap()
        .unwrap();
        assert!(sample.weekly.is_none() && sample.short_window.is_none());
        assert_eq!(sample.spend_limit.as_ref().unwrap().used_percent, 120.0);
        let view = View::build(
            Installations::default(),
            Connection::Connected,
            Reading::Quota {
                sample,
                captured_at: NOW,
            },
        );
        assert_eq!(view.status, Status::NoPlanQuota);
        assert!(view.visible());
        assert!(view.quota.unwrap().spend_limit.is_some());
    }

    #[test]
    fn rejects_malformed_or_out_of_bounds_input() {
        for raw in [
            r#"[]"#,
            r#"{"rate_limits":true}"#,
            r#"{"rate_limits":{"five_hour":{}}}"#,
            r#"{"rate_limits":{"spend_limit":{"used_percentage":120}}}"#,
            r#"{"rate_limits":{"spend_limit":{"used_percentage":-1,"resets_at":1900000300}}}"#,
            r#"{"rate_limits":{"seven_day":{"used_percentage":101,"resets_at":1900000300}}}"#,
            r#"{"rate_limits":{"seven_day":{"used_percentage":-1,"resets_at":1900000300}}}"#,
            r#"{"rate_limits":{"seven_day":{"used_percentage":"42","resets_at":1900000300}}}"#,
            r#"{"rate_limits":{"seven_day":{"used_percentage":42,"resets_at":1900000300000}}}"#,
        ] {
            assert_eq!(
                parse_statusline(raw.as_bytes(), NOW),
                Err(ParseFailure::InvalidData),
                "{raw}"
            );
        }
        assert_eq!(
            parse_statusline(b"{}", 0),
            Err(ParseFailure::InvalidTimestamp)
        );
        assert_eq!(
            parse_statusline(&vec![b' '; 65_537], NOW),
            Err(ParseFailure::TooLarge)
        );
    }

    #[test]
    fn bridge_capture_keeps_only_rate_limits_and_merges_sessions_without_them() {
        let capture = reduce(FIXTURE, NOW, None).unwrap();
        let json = serde_json::to_string(&capture).unwrap();
        for forbidden in [
            "workspace",
            "session",
            "transcript",
            "fixture-private",
            "cost",
            "context",
        ] {
            assert!(!json.contains(forbidden), "{json}");
        }
        assert_eq!(capture.limits_captured_at, Some(NOW));
        // A new session before its first API response has no rate_limits: keep
        // the last reported limits, but record the activity time.
        let later = reduce(
            br#"{"model":{"id":"x"},"context_window":{"used_percentage":3}}"#,
            NOW + 60,
            Some(capture.clone()),
        )
        .unwrap();
        assert_eq!(later.captured_at, NOW + 60);
        assert_eq!(later.limits_captured_at, Some(NOW));
        assert_eq!(later.rate_limits, capture.rate_limits);
        // Limits present again replace the whole object, dropping reset windows.
        let replaced = reduce(
            br#"{"rate_limits":{"five_hour":{"used_percentage":10,"resets_at":1900018000}}}"#,
            NOW + 120,
            Some(later),
        )
        .unwrap();
        assert!(replaced.rate_limits.as_ref().unwrap().seven_day.is_none());
        assert_eq!(replaced.limits_captured_at, Some(NOW + 120));
        // Garbage on stdin is never persisted as a capture.
        assert_eq!(
            reduce(b"not json", NOW, None),
            Err(ParseFailure::InvalidData)
        );
        assert_eq!(
            reduce(
                br#"{"rate_limits":{"five_hour":{"used_percentage":500,"resets_at":1900018000}}}"#,
                NOW,
                None
            ),
            Err(ParseFailure::InvalidData)
        );
    }

    #[test]
    fn reading_a_capture_uses_its_own_times_and_expires_windows_at_read_time() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join(CAPTURE_FILE);
        assert_eq!(read_capture(&path, NOW), Reading::Missing);
        let capture = reduce(FIXTURE, NOW, None).unwrap();
        write_atomically(&path, &serde_json::to_vec(&capture).unwrap()).unwrap();
        match read_capture(&path, NOW + 1_000) {
            Reading::Quota {
                sample,
                captured_at,
            } => {
                assert_eq!(captured_at, NOW);
                assert_eq!(sample.checked_at, NOW); // never the read time
                assert!(sample.weekly.is_some() && sample.short_window.is_some());
            }
            other => panic!("{other:?}"),
        }
        // Past the five-hour reset only the weekly window survives.
        match read_capture(&path, 1_900_018_001) {
            Reading::Quota { sample, .. } => {
                assert!(sample.short_window.is_none());
                assert!(sample.weekly.is_some());
            }
            other => panic!("{other:?}"),
        }
        assert_eq!(
            read_capture(&path, 1_900_604_801),
            Reading::Expired { captured_at: NOW }
        );
        // A capture from the future (clock skew beyond tolerance) is ignored.
        assert_eq!(read_capture(&path, NOW - FUTURE_SKEW - 1), Reading::Missing);
        let none = reduce(b"{}", NOW, None).unwrap();
        write_atomically(&path, &serde_json::to_vec(&none).unwrap()).unwrap();
        assert_eq!(
            read_capture(&path, NOW),
            Reading::NoPlanQuota { captured_at: NOW }
        );
        fs::write(&path, b"{\"schemaVersion\":2,\"capturedAt\":1}").unwrap();
        assert_eq!(read_capture(&path, NOW), Reading::Missing);
        fs::write(&path, vec![b' '; MAX_INPUT + 1]).unwrap();
        assert_eq!(read_capture(&path, NOW), Reading::Missing);
    }

    #[test]
    fn view_status_follows_the_capture_not_the_plan() {
        let installed = Installations {
            cli: true,
            desktop: false,
        };
        let sample = parse_statusline(FIXTURE, NOW).unwrap().unwrap();
        let ready = View::build(
            installed,
            Connection::Connected,
            Reading::Quota {
                sample,
                captured_at: NOW + 5,
            },
        );
        assert_eq!(ready.status, Status::Ready);
        assert_eq!(ready.captured_at, Some(NOW + 5));
        assert_eq!(ready.quota.as_ref().unwrap().checked_at, NOW);
        let api_key = View::build(
            installed,
            Connection::Connected,
            Reading::NoPlanQuota { captured_at: NOW },
        );
        assert_eq!(api_key.status, Status::NoPlanQuota);
        assert!(api_key.quota.is_none());
        let expired = View::build(
            installed,
            Connection::Connected,
            Reading::Expired { captured_at: NOW },
        );
        assert_eq!(expired.status, Status::QuotaUnavailable);
        assert_eq!(expired.captured_at, Some(NOW));
        // Nothing installed in the conventional places and nothing captured.
        let absent = View::build(
            Installations::default(),
            Connection::None,
            Reading::Expired { captured_at: NOW },
        );
        assert_eq!(absent.status, Status::NotFound);
        assert!(!absent.visible());
        // A custom installation that still runs the bridge is visible.
        assert!(
            View::build(
                Installations::default(),
                Connection::Connected,
                Reading::NoPlanQuota { captured_at: NOW }
            )
            .visible()
        );
    }

    #[test]
    fn summary_line_reports_only_present_windows() {
        let sample = parse_statusline(FIXTURE, NOW).unwrap().unwrap();
        let line = summary(Some(&sample));
        assert!(line.contains("74") && line.contains("53"), "{line}");
        assert!(!line.contains("spend"));
        assert!(summary(None).starts_with("Claude"));
    }

    #[test]
    fn connect_preserves_settings_chains_custom_status_lines_and_disconnect_restores() {
        let root = tempfile::tempdir().unwrap();
        let companion = root.path().join("companion");
        let claude = root.path().join("claude");
        fs::create_dir_all(&claude).unwrap();
        let settings = claude.join("settings.json");
        fs::write(
            &settings,
            br#"{"model":"opus","statusLine":{"type":"command","command":"my-line.sh","padding":2,"refreshInterval":30}}"#,
        )
        .unwrap();
        assert_eq!(connection_state(Some(&claude)), Connection::Custom);
        let exe = root
            .path()
            .join("Statusline Companion.app/Contents/MacOS/statusline");
        assert_eq!(
            connect(&companion, &claude, &exe).unwrap(),
            Connection::Connected
        );
        assert_eq!(connection_state(Some(&claude)), Connection::Connected);
        let written: serde_json::Value =
            serde_json::from_slice(&fs::read(&settings).unwrap()).unwrap();
        assert_eq!(written["model"], "opus");
        let line = &written["statusLine"];
        assert_eq!(line["type"], "command");
        assert_eq!(line["padding"], 2);
        assert_eq!(line["refreshInterval"], 30); // never slower than the user's own
        let command = line["command"].as_str().unwrap();
        assert!(command.starts_with(&format!("\"{}\" {BRIDGE_FLAG} \"", exe.display())));
        assert!(command.ends_with(&format!("{}\"", companion.join(CAPTURE_FILE).display())));
        assert_eq!(chained_command(&companion).as_deref(), Some("my-line.sh"));
        assert!(companion.join(BACKUP_FILE).exists());
        // Connecting twice does not chain the bridge to itself.
        connect(&companion, &claude, &exe).unwrap();
        assert_eq!(chained_command(&companion).as_deref(), Some("my-line.sh"));
        fs::write(companion.join(CAPTURE_FILE), b"{}").unwrap();
        assert_eq!(disconnect(&companion, &claude).unwrap(), Connection::Custom);
        let restored: serde_json::Value =
            serde_json::from_slice(&fs::read(&settings).unwrap()).unwrap();
        assert_eq!(restored["statusLine"]["command"], "my-line.sh");
        assert_eq!(restored["statusLine"]["refreshInterval"], 30);
        assert_eq!(restored["model"], "opus");
        assert!(!companion.join(CHAIN_FILE).exists());
        assert!(!companion.join(CAPTURE_FILE).exists());
    }

    #[test]
    fn connect_without_settings_creates_them_and_disconnect_removes_only_ours() {
        let root = tempfile::tempdir().unwrap();
        let companion = root.path().join("companion");
        let claude = root.path().join("claude");
        let exe = root.path().join("statusline");
        assert_eq!(connection_state(Some(&claude)), Connection::None);
        connect(&companion, &claude, &exe).unwrap();
        let written: serde_json::Value =
            serde_json::from_slice(&fs::read(claude.join("settings.json")).unwrap()).unwrap();
        assert_eq!(
            written["statusLine"]["refreshInterval"],
            BRIDGE_REFRESH_SECONDS
        );
        assert!(!companion.join(BACKUP_FILE).exists()); // nothing to back up
        assert!(chained_command(&companion).is_none());
        assert_eq!(disconnect(&companion, &claude).unwrap(), Connection::None);
        let restored: serde_json::Value =
            serde_json::from_slice(&fs::read(claude.join("settings.json")).unwrap()).unwrap();
        assert!(restored.get("statusLine").is_none());
        // Someone else's status line is never removed by disconnect.
        fs::write(
            claude.join("settings.json"),
            br#"{"statusLine":{"type":"command","command":"theirs"}}"#,
        )
        .unwrap();
        assert_eq!(disconnect(&companion, &claude).unwrap(), Connection::Custom);
    }

    #[test]
    fn connect_refuses_invalid_settings_and_unquotable_paths() {
        let root = tempfile::tempdir().unwrap();
        let companion = root.path().join("companion");
        let claude = root.path().join("claude");
        fs::create_dir_all(&claude).unwrap();
        fs::write(claude.join("settings.json"), b"[1,2]").unwrap();
        assert_eq!(
            connect(&companion, &claude, &root.path().join("exe")),
            Err(ConnectFailure::InvalidSettings)
        );
        assert_eq!(connection_state(Some(&claude)), Connection::Unknown);
        fs::write(claude.join("settings.json"), b"{}").unwrap();
        assert_eq!(
            connect(&companion, &claude, &root.path().join("ex\"e")),
            Err(ConnectFailure::UnsupportedPath)
        );
        assert_eq!(connection_state(None), Connection::Unknown);
    }

    #[test]
    fn claude_config_dir_honors_absolute_override_only() {
        // SAFETY: tests in this module that read the variable run after this
        // set; no other thread depends on it.
        unsafe { env::set_var("CLAUDE_CONFIG_DIR", "relative/dir") };
        assert!(claude_config_dir().is_none());
        let absolute = env::temp_dir();
        unsafe { env::set_var("CLAUDE_CONFIG_DIR", &absolute) };
        assert_eq!(claude_config_dir(), Some(absolute));
        unsafe { env::remove_var("CLAUDE_CONFIG_DIR") };
        assert!(claude_config_dir().is_some_and(|dir| dir.ends_with(".claude")));
    }
}
