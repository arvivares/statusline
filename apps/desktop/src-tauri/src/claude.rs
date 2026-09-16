//! Passive Claude discovery and normalization of the documented statusline data.
//! No CLI execution, vendor settings/credentials, session files or network access.
//! Installation evidence is NOT authentication evidence or a working quota source.
use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

use crate::refresh::RefreshCoordinator;

static REVISION: AtomicU64 = AtomicU64::new(0);

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

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub revision: u64,
    pub checked_at: i64,
    pub installations: Installations,
    // Never emit "ready" just because an executable exists.
    pub status: Status,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    NotFound,
    QuotaUnavailable,
    DiscoveryUnavailable,
}

impl View {
    fn from_installations(installations: Installations) -> Self {
        Self {
            revision: REVISION.fetch_add(1, Ordering::Relaxed) + 1,
            checked_at: crate::antigravity::timestamp(),
            status: if installations.detected() {
                Status::QuotaUnavailable
            } else {
                Status::NotFound
            },
            installations,
        }
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

pub async fn refresh(state: &State, age: Duration) -> View {
    state
        .cache
        .refresh(age, || async {
            // Isolate filesystem probes from the async runtime. A slow/missing
            // installation cannot hold up Codex/Gemini or the startup inventory.
            match state.scan(Duration::from_secs(3)).await {
                Some(installations) => View::from_installations(installations),
                _ => View {
                    revision: REVISION.fetch_add(1, Ordering::Relaxed) + 1,
                    checked_at: crate::antigravity::timestamp(),
                    installations: Installations::default(),
                    status: Status::DiscoveryUnavailable,
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

pub fn discover() -> Installations {
    let platform = if cfg!(target_os = "macos") {
        Platform::Mac
    } else if cfg!(windows) {
        Platform::Windows
    } else {
        Platform::Linux
    };
    #[cfg(windows)]
    let home = dirs::home_dir();
    #[cfg(not(windows))]
    let home = env::var_os("HOME").map(PathBuf::from);
    let local = env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let program_files = env::var_os("ProgramFiles").map(PathBuf::from);
    discover_candidates(&candidates(
        platform,
        home.as_deref(),
        local.as_deref(),
        program_files.as_deref(),
    ))
}

// This is a pure adapter, NOT a live transport. The caller of a future official
// integration must supply an actual capture timestamp, never the poll time of
// a cached session. Unknown/session fields are ignored, never retained.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Quota {
    pub remaining_percent: f64,
    pub resets_at: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaSample {
    pub checked_at: i64,
    pub weekly: Option<Quota>,
    pub short_window: Option<Quota>,
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
#[derive(Deserialize)]
struct RateLimits {
    five_hour: Option<RateWindow>,
    seven_day: Option<RateWindow>,
}
#[derive(Deserialize)]
struct RateWindow {
    used_percentage: f64,
    resets_at: i64,
}

/// Official fields: https://code.claude.com/docs/en/statusline#rate-limit-usage
/// Missing or expired quota is unknown, never 100% remaining. Context usage,
/// cost, spend_limit and per-model limits are not subscription quota.
pub fn parse_statusline(
    input: &[u8],
    captured_at: i64,
) -> Result<Option<QuotaSample>, ParseFailure> {
    const MAX_TIMESTAMP: i64 = 253_402_300_799;
    if input.len() > 65_536 {
        return Err(ParseFailure::TooLarge);
    }
    if !(1..=MAX_TIMESTAMP).contains(&captured_at) {
        return Err(ParseFailure::InvalidTimestamp);
    }
    let raw: StatuslineInput =
        serde_json::from_slice(input).map_err(|_| ParseFailure::InvalidData)?;
    let Some(limits) = raw.rate_limits else {
        return Ok(None);
    };
    let window = |raw: Option<RateWindow>| -> Result<Option<Quota>, ParseFailure> {
        let Some(raw) = raw else {
            return Ok(None);
        };
        if !raw.used_percentage.is_finite()
            || !(0.0..=100.0).contains(&raw.used_percentage)
            || !(1..=MAX_TIMESTAMP).contains(&raw.resets_at)
        {
            return Err(ParseFailure::InvalidData);
        }
        if raw.resets_at <= captured_at {
            return Ok(None);
        }
        Ok(Some(Quota {
            remaining_percent: 100.0 - raw.used_percentage,
            resets_at: raw.resets_at,
        }))
    };
    let weekly = window(limits.seven_day)?;
    let short_window = window(limits.five_hour)?;
    if weekly.is_none() && short_window.is_none() {
        return Ok(None);
    }
    Ok(Some(QuotaSample {
        checked_at: captured_at,
        weekly,
        short_window,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    const NOW: i64 = 1_900_000_000;

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
        let view = View::from_installations(discover_candidates(&list));
        assert_eq!(view.status, Status::QuotaUnavailable);
        assert!(view.installations.cli);
        assert!(!view.installations.desktop);
        fs::remove_file(&list[0].path).unwrap();
        assert_eq!(
            View::from_installations(discover_candidates(&list)).status,
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
        let json =
            serde_json::to_string(&View::from_installations(discover_candidates(&list))).unwrap();
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
        let fixture = include_bytes!("../../../../protocol/fixtures/claude-statusline.json");
        let sample = parse_statusline(fixture, NOW).unwrap().unwrap();
        assert_eq!(sample.weekly.as_ref().unwrap().remaining_percent, 53.0);
        assert_eq!(
            sample.short_window.as_ref().unwrap().remaining_percent,
            74.5
        );
        assert_eq!(sample.checked_at, NOW);
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
            r#"{"rate_limits":{"spend_limit":{"used_percentage":120}}}"#,
            r#"{"context_window":{"remaining_percentage":80},"cost":{"total_cost_usd":5}}"#,
            r#"{"rate_limits":{"five_hour":{"used_percentage":100,"resets_at":1900000000}}}"#,
        ] {
            assert_eq!(parse_statusline(raw.as_bytes(), NOW), Ok(None));
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
    fn rejects_malformed_or_out_of_bounds_input() {
        for raw in [
            r#"[]"#,
            r#"{"rate_limits":true}"#,
            r#"{"rate_limits":{"five_hour":{}}}"#,
            r#"{"rate_limits":{"seven_day":{"used_percentage":101,"resets_at":1900000300}}}"#,
            r#"{"rate_limits":{"seven_day":{"used_percentage":-1,"resets_at":1900000300}}}"#,
            r#"{"rate_limits":{"seven_day":{"used_percentage":"42","resets_at":1900000300}}}"#,
            r#"{"rate_limits":{"seven_day":{"used_percentage":42,"resets_at":1900000300000}}}"#,
        ] {
            assert_eq!(
                parse_statusline(raw.as_bytes(), NOW),
                Err(ParseFailure::InvalidData)
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
}
