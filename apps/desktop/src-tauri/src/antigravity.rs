//! Google-only quota adapter. No prompts, vendor credentials or third-party
//! model payloads cross this module's public boundary.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    env, fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

#[path = "antigravity_runtime.rs"]
mod runtime;

const SETTINGS_FILE: &str = "antigravity-source-v1.json";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    Desktop,
    Cli,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// A discovered source is pinned just like a manual selection. Never switch
    /// Desktop/CLI accounts because an existing source fails or disappears.
    #[serde(default)]
    pub source: Option<Source>,
    #[serde(default)]
    pub path: Option<PathBuf>,
    /// Missing in v0.1.22 files means manual/disabled, preserving explicit choices.
    #[serde(default)]
    pub automatic: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            source: None,
            path: None,
            automatic: true,
        }
    }
}

impl Settings {
    pub fn disabled() -> Self {
        Self {
            automatic: false,
            ..Self::default()
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Quota {
    pub remaining_percent: f64,
    pub resets_at: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleQuota {
    pub weekly: Option<Quota>,
    pub short_window: Option<Quota>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Failure {
    NotFound,
    NotSignedIn,
    UnsupportedVersion,
    InvalidData,
    Timeout,
    SourceUnavailable,
    InvalidPath,
    SettingsUnavailable,
    UntrustedRuntime,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Usage {
    Disabled,
    Ready {
        source: Source,
        checked_at: i64,
        quota: GoogleQuota,
    },
    Unavailable {
        source: Option<Source>,
        checked_at: i64,
        reason: Failure,
    },
}

pub fn timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(1, |v| v.as_secs() as i64)
}

pub fn load_settings(directory: &Path) -> Result<Settings, Failure> {
    let path = directory.join(SETTINGS_FILE);
    match fs::metadata(&path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Settings::default()),
        Ok(metadata) if metadata.is_file() && metadata.len() <= 16_384 => {
            serde_json::from_slice(&fs::read(path).map_err(|_| Failure::SettingsUnavailable)?)
                .map_err(|_| Failure::SettingsUnavailable)
        }
        _ => Err(Failure::SettingsUnavailable),
    }
}

pub fn save_settings(directory: &Path, settings: &Settings) -> Result<(), Failure> {
    if let Some(path) = &settings.path {
        let source = settings.source.ok_or(Failure::InvalidPath)?;
        let _ = normalize_path(path, source)?;
    }
    fs::create_dir_all(directory).map_err(|_| Failure::SettingsUnavailable)?;
    let mut temp =
        tempfile::NamedTempFile::new_in(directory).map_err(|_| Failure::SettingsUnavailable)?;
    use std::io::Write;
    temp.write_all(&serde_json::to_vec(settings).map_err(|_| Failure::SettingsUnavailable)?)
        .map_err(|_| Failure::SettingsUnavailable)?;
    temp.as_file()
        .sync_all()
        .map_err(|_| Failure::SettingsUnavailable)?;
    temp.persist(directory.join(SETTINGS_FILE))
        .map_err(|_| Failure::SettingsUnavailable)?;
    Ok(())
}

/// Reject shell scripts/aliases and implicit project-local paths. A .app folder
/// or desktop installation folder may be selected, but only the native binary
/// inside it is executed; never the Electron launcher.
pub fn normalize_path(path: &Path, source: Source) -> Result<PathBuf, Failure> {
    if !path.is_absolute() || path.as_os_str().len() > 4096 {
        return Err(Failure::InvalidPath);
    }
    let path = if path.is_dir() && source == Source::Desktop {
        if path.extension().is_some_and(|extension| extension == "app") {
            path.join("Contents/Resources/bin/language_server")
        } else {
            path.join(if cfg!(windows) {
                "resources/bin/language_server.exe"
            } else {
                "resources/bin/language_server"
            })
        }
    } else {
        path.to_owned()
    };
    let name = path
        .file_name()
        .and_then(|v| v.to_str())
        .ok_or(Failure::InvalidPath)?;
    let allowed = match source {
        Source::Desktop => ["language_server", "language_server.exe"].contains(&name),
        Source::Cli => ["agy", "agy.exe"].contains(&name),
    };
    if !allowed || !path.is_file() {
        return Err(Failure::InvalidPath);
    }
    let canonical = path.canonicalize().map_err(|_| Failure::InvalidPath)?;
    let mut magic = [0u8; 4];
    use std::io::Read;
    fs::File::open(&canonical)
        .and_then(|mut file| file.read_exact(&mut magic))
        .map_err(|_| Failure::InvalidPath)?;
    // Only native executables, never a shell/batch script renamed to a vendor
    // binary. This checks format, not publisher trust (codesign does that on Mac).
    let native = magic == *b"\x7fELF"
        || magic[..2] == *b"MZ"
        || [
            [0xfe, 0xed, 0xfa, 0xce],
            [0xce, 0xfa, 0xed, 0xfe],
            [0xfe, 0xed, 0xfa, 0xcf],
            [0xcf, 0xfa, 0xed, 0xfe],
            [0xca, 0xfe, 0xba, 0xbe],
            [0xca, 0xfe, 0xba, 0xbf],
        ]
        .contains(&magic);
    if !native {
        return Err(Failure::InvalidPath);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if fs::metadata(&canonical)
            .map_err(|_| Failure::InvalidPath)?
            .permissions()
            .mode()
            & 0o111
            == 0
        {
            return Err(Failure::InvalidPath);
        }
    }
    Ok(canonical)
}

/// Pure discovery policy shared by production and all platform fixtures.
pub fn candidates(
    source: Source,
    platform: &str,
    home: Option<&Path>,
    local: Option<&Path>,
    program_files: Option<&Path>,
    path_dirs: &[PathBuf],
) -> Vec<PathBuf> {
    let mut result = Vec::new();
    let mut add = |path: PathBuf| {
        if path.is_absolute() && !result.contains(&path) {
            result.push(path);
        }
    };
    match source {
        Source::Cli => {
            if let Some(home) = home {
                add(home.join(".local/bin").join(if platform == "windows" {
                    "agy.exe"
                } else {
                    "agy"
                }));
            }
            if platform == "windows"
                && let Some(local) = local
            {
                add(local.join("agy/bin/agy.exe"));
            }
            for dir in path_dirs {
                add(dir.join(if platform == "windows" {
                    "agy.exe"
                } else {
                    "agy"
                }));
            }
        }
        Source::Desktop => match platform {
            "macos" => {
                add(PathBuf::from(
                    "/Applications/Antigravity.app/Contents/Resources/bin/language_server",
                ));
                if let Some(home) = home {
                    add(home.join(
                        "Applications/Antigravity.app/Contents/Resources/bin/language_server",
                    ));
                }
            }
            "windows" => {
                if let Some(local) = local {
                    for suffix in ["Programs/Antigravity", "Antigravity"] {
                        add(local.join(suffix).join("resources/bin/language_server.exe"));
                    }
                }
                if let Some(root) = program_files {
                    add(root.join("Antigravity/resources/bin/language_server.exe"));
                }
            }
            "linux" => {
                for root in [
                    "/opt/Antigravity",
                    "/opt/antigravity",
                    "/usr/share/antigravity",
                ] {
                    add(PathBuf::from(root).join("resources/bin/language_server"));
                }
                if let Some(home) = home {
                    for root in [".local/share/Antigravity", ".local/share/antigravity"] {
                        add(home.join(root).join("resources/bin/language_server"));
                    }
                }
            }
            _ => {}
        },
    }
    result
}

pub fn resolve(settings: &Settings) -> Result<PathBuf, Failure> {
    let source = settings.source.ok_or(Failure::NotFound)?;
    if let Some(path) = settings.path.as_deref() {
        return normalize_path(path, source);
    }
    let home = env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    let local = env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let program_files = env::var_os("ProgramFiles").map(PathBuf::from);
    let path_dirs = if settings.automatic {
        // Automatic discovery must not execute a project-local binary from an
        // inherited PATH. Custom locations remain an explicit advanced choice.
        automatic_path_dirs(env::consts::OS)
    } else {
        env::var_os("PATH")
            .map(|v| {
                env::split_paths(&v)
                    .filter(|p| p.is_absolute())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    };
    candidates(
        source,
        env::consts::OS,
        home.as_deref(),
        local.as_deref(),
        program_files.as_deref(),
        &path_dirs,
    )
    .iter()
    .find_map(|candidate| normalize_path(candidate, source).ok())
    .ok_or(Failure::NotFound)
}

fn automatic_path_dirs(platform: &str) -> Vec<PathBuf> {
    match platform {
        "macos" => ["/opt/homebrew/bin", "/usr/local/bin"]
            .into_iter()
            .map(PathBuf::from)
            .collect(),
        "linux" => ["/usr/local/bin", "/usr/bin"]
            .into_iter()
            .map(PathBuf::from)
            .collect(),
        _ => Vec::new(),
    }
}

fn select_discovered_source(
    mut settings: Settings,
    mut installed: impl FnMut(Source) -> bool,
) -> Settings {
    if settings.automatic && settings.source.is_none() && settings.path.is_none() {
        settings.source = [Source::Desktop, Source::Cli]
            .into_iter()
            .find(|source| installed(*source));
    }
    settings
}

fn prepare_settings(directory: &Path, settings: Settings) -> Result<Settings, Failure> {
    let selected = select_discovered_source(settings.clone(), |source| {
        resolve(&Settings {
            source: Some(source),
            ..Settings::default()
        })
        .is_ok()
    });
    // Persist before reading a session. A restart or later install must not
    // silently move a user from CLI to Desktop (or the reverse).
    if selected != settings {
        save_settings(directory, &selected)?;
    }
    Ok(selected)
}

pub fn supported_cli_version(raw: &str) -> bool {
    let value = raw.trim().strip_prefix("agy ").unwrap_or(raw.trim());
    let Some(parts) = version_parts(value) else {
        return false;
    };
    // A future major must prove that /usage is still a read-only built-in.
    parts.0 == 1 && (parts.1, parts.2) >= (1, 11)
}

fn version_parts(raw: &str) -> Option<(u32, u32, u32)> {
    let parts = raw.split('.').collect::<Vec<_>>();
    if parts.len() != 3
        || parts
            .iter()
            .any(|v| v.is_empty() || !v.bytes().all(|b| b.is_ascii_digit()))
    {
        return None;
    }
    Some((
        parts[0].parse().ok()?,
        parts[1].parse().ok()?,
        parts[2].parse().ok()?,
    ))
}

fn parse_quota(value: &Value, fraction_field: &str, reset_field: &str) -> Result<Quota, Failure> {
    if value.get("disabled").and_then(Value::as_bool) == Some(true)
        || value.get("enabled").and_then(Value::as_bool) == Some(false)
    {
        return Err(Failure::InvalidData);
    }
    let fraction = value
        .get(fraction_field)
        .and_then(Value::as_f64)
        .ok_or(Failure::InvalidData)?;
    let reset = value
        .get(reset_field)
        .and_then(Value::as_str)
        .ok_or(Failure::InvalidData)?;
    if !fraction.is_finite() || !(0.0..=1.0).contains(&fraction) || reset.len() > 40 {
        return Err(Failure::InvalidData);
    }
    let resets_at = OffsetDateTime::parse(reset, &Rfc3339)
        .map_err(|_| Failure::InvalidData)?
        .unix_timestamp();
    if resets_at <= 0 {
        return Err(Failure::InvalidData);
    }
    Ok(Quota {
        remaining_percent: fraction * 100.0,
        resets_at,
    })
}

pub fn parse_usage(value: &Value, source: Source) -> Result<GoogleQuota, Failure> {
    let (groups, id, fraction, reset) = match source {
        Source::Cli => {
            if value.get("status").and_then(Value::as_str) != Some("SUCCESS")
                || value.get("num_turns").and_then(Value::as_u64) != Some(0)
                || value.pointer("/command/name").and_then(Value::as_str) != Some("usage")
            {
                return Err(Failure::InvalidData);
            }
            let usage = value
                .get("usage")
                .and_then(Value::as_object)
                .ok_or(Failure::InvalidData)?;
            for key in [
                "input_tokens",
                "output_tokens",
                "thinking_tokens",
                "cache_read_tokens",
                "total_tokens",
            ] {
                if usage.get(key).and_then(Value::as_u64) != Some(0) {
                    return Err(Failure::InvalidData);
                }
            }
            (
                value.pointer("/command/data/groups"),
                "id",
                "remaining_fraction",
                "reset_time",
            )
        }
        Source::Desktop => (
            value.pointer("/response/groups"),
            "bucketId",
            "remainingFraction",
            "resetTime",
        ),
    };
    let groups = groups
        .and_then(Value::as_array)
        .ok_or(Failure::InvalidData)?;
    if groups.len() > 32 {
        return Err(Failure::InvalidData);
    }
    let mut result = GoogleQuota {
        weekly: None,
        short_window: None,
    };
    for group in groups {
        let buckets = group
            .get("buckets")
            .and_then(Value::as_array)
            .ok_or(Failure::InvalidData)?;
        if buckets.len() > 128 {
            return Err(Failure::InvalidData);
        }
        for bucket in buckets {
            let (destination, window) = match bucket.get(id).and_then(Value::as_str) {
                Some("gemini-weekly") => (&mut result.weekly, "weekly"),
                Some("gemini-5h") => (&mut result.short_window, "5h"),
                _ => continue, // Third-party and unknown quotas never escape the parser.
            };
            if destination.is_some() || bucket.get("window").and_then(Value::as_str) != Some(window)
            {
                return Err(Failure::InvalidData);
            }
            *destination = Some(parse_quota(bucket, fraction, reset)?);
        }
    }
    if result.weekly.is_none() && result.short_window.is_none() {
        return Err(Failure::InvalidData);
    }
    Ok(result)
}

pub async fn collect(settings: &Settings) -> Usage {
    let Some(source) = settings.source else {
        return Usage::Disabled;
    };
    let result = async {
        let path = resolve(settings)?;
        let value = runtime::read_usage(&path, source).await?;
        parse_usage(&value, source)
    }
    .await;
    match result {
        Ok(quota) => Usage::Ready {
            source,
            checked_at: timestamp(),
            quota,
        },
        Err(reason) => Usage::Unavailable {
            source: Some(source),
            checked_at: timestamp(),
            reason,
        },
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub revision: u64,
    pub settings: Settings,
    pub usage: Usage,
}

#[derive(Default)]
pub struct State(tokio::sync::Mutex<Option<(std::time::Instant, View)>>);

impl State {
    /// One independent cache/lock for Google. Changing this source can never
    /// acquire Codex's refresh lock or the relay credential/publisher lock.
    pub async fn refresh(&self, directory: Option<&Path>, age: std::time::Duration) -> View {
        let mut cache = self.0.lock().await;
        if let Some((instant, view)) = cache.as_ref()
            && instant.elapsed() < age
        {
            return view.clone();
        }
        let settings = directory
            .ok_or(Failure::SettingsUnavailable)
            .and_then(|directory| prepare_settings(directory, load_settings(directory)?));
        let revision = cache.as_ref().map_or(1, |(_, view)| view.revision + 1);
        let view = match settings {
            Ok(settings) => View {
                revision,
                usage: collect(&settings).await,
                settings,
            },
            Err(reason) => View {
                revision,
                settings: Settings::default(),
                usage: Usage::Unavailable {
                    source: None,
                    checked_at: timestamp(),
                    reason,
                },
            },
        };
        *cache = Some((std::time::Instant::now(), view.clone()));
        view
    }

    pub async fn configure(&self, directory: &Path, settings: Settings) -> Result<View, Failure> {
        // Serialize with collection so disabling cannot be undone by an older
        // in-flight result. A missing new installation never creates a service.
        let mut cache = self.0.lock().await;
        let settings = prepare_settings(directory, settings)?;
        if settings.source.is_some() {
            resolve(&settings)?;
        }
        save_settings(directory, &settings)?;
        let view = View {
            revision: cache.as_ref().map_or(1, |(_, view)| view.revision + 1),
            usage: collect(&settings).await,
            settings,
        };
        *cache = Some((std::time::Instant::now(), view.clone()));
        Ok(view)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn discovery_selects_desktop_then_cli_without_requiring_configuration() {
        for (desktop, cli, expected) in [
            (true, true, Some(Source::Desktop)),
            (true, false, Some(Source::Desktop)),
            (false, true, Some(Source::Cli)),
            (false, false, None),
        ] {
            let selected = select_discovered_source(Settings::default(), |source| match source {
                Source::Desktop => desktop,
                Source::Cli => cli,
            });
            assert_eq!(selected.source, expected);
            assert!(selected.automatic);
        }
    }

    #[test]
    fn discovery_never_overrides_a_pinned_source_or_explicit_opt_out() {
        for original in [
            Settings::disabled(),
            Settings {
                source: Some(Source::Cli),
                ..Settings::default()
            },
            Settings {
                source: Some(Source::Desktop),
                automatic: false,
                path: None,
            },
        ] {
            let selected = select_discovered_source(original.clone(), |_| {
                panic!("must not probe another account")
            });
            assert_eq!(selected, original);
        }
    }

    #[test]
    fn discovering_later_preserves_source_across_restart_and_other_settings() {
        let absent = select_discovered_source(Settings::default(), |_| false);
        assert_eq!(absent.source, None);
        let selected = select_discovered_source(absent, |source| source == Source::Cli);
        let directory = tempfile::tempdir().unwrap();
        fs::write(
            directory.path().join("settings.json"),
            b"unchanged Codex settings",
        )
        .unwrap();
        save_settings(directory.path(), &selected).unwrap();
        let restored = select_discovered_source(load_settings(directory.path()).unwrap(), |_| {
            panic!("new Desktop install must not change the pinned CLI source")
        });
        assert_eq!(restored.source, Some(Source::Cli));
        assert!(restored.automatic);
        assert_eq!(
            fs::read(directory.path().join("settings.json")).unwrap(),
            b"unchanged Codex settings"
        );
    }

    #[test]
    fn legacy_settings_keep_manual_selections_and_disabled_services() {
        let directory = tempfile::tempdir().unwrap();
        assert!(load_settings(directory.path()).unwrap().automatic);
        for source in [Value::Null, json!("cli"), json!("desktop")] {
            fs::write(
                directory.path().join(SETTINGS_FILE),
                serde_json::to_vec(&json!({"source":source,"path":null})).unwrap(),
            )
            .unwrap();
            let settings = load_settings(directory.path()).unwrap();
            assert!(!settings.automatic);
            assert_eq!(serde_json::to_value(settings.source).unwrap(), source);
        }
    }

    #[test]
    fn automatic_discovery_does_not_use_inherited_project_paths() {
        assert_eq!(
            automatic_path_dirs("linux"),
            vec![PathBuf::from("/usr/local/bin"), PathBuf::from("/usr/bin")]
        );
        assert_eq!(
            automatic_path_dirs("macos"),
            vec![
                PathBuf::from("/opt/homebrew/bin"),
                PathBuf::from("/usr/local/bin")
            ]
        );
        assert!(automatic_path_dirs("windows").is_empty());
    }

    #[tokio::test]
    async fn explicitly_disabled_refresh_and_remove_never_touch_legacy_state() {
        let directory = tempfile::tempdir().unwrap();
        let legacy = directory.path().join("settings.json");
        fs::write(&legacy, b"original Codex settings").unwrap();
        save_settings(directory.path(), &Settings::disabled()).unwrap();
        let state = State::default();
        let initial = state
            .refresh(Some(directory.path()), std::time::Duration::from_secs(60))
            .await;
        assert_eq!(initial.usage, Usage::Disabled);
        assert_eq!(initial.revision, 1);
        let cached = state
            .refresh(Some(directory.path()), std::time::Duration::from_secs(60))
            .await;
        assert_eq!(cached.revision, 1);
        let removed = state
            .configure(directory.path(), Settings::disabled())
            .await
            .unwrap();
        assert_eq!(removed.revision, 2);
        assert_eq!(removed.usage, Usage::Disabled);
        assert_eq!(fs::read(legacy).unwrap(), b"original Codex settings");
    }

    #[tokio::test]
    async fn a_missing_new_source_does_not_replace_settings() {
        let directory = tempfile::tempdir().unwrap();
        save_settings(directory.path(), &Settings::disabled()).unwrap();
        let result = State::default()
            .configure(
                directory.path(),
                Settings {
                    source: Some(Source::Desktop),
                    path: Some(directory.path().join("missing/language_server")),
                    automatic: false,
                },
            )
            .await;
        assert!(result.is_err());
        assert_eq!(
            load_settings(directory.path()).unwrap(),
            Settings::disabled()
        );
    }

    fn desktop() -> Value {
        json!({"response":{"groups":[{"buckets":[
            {"bucketId":"gemini-weekly","window":"weekly","remainingFraction":0.53,"resetTime":"2026-09-22T07:58:53Z"},
            {"bucketId":"gemini-5h","window":"5h","remainingFraction":0.81,"resetTime":"2026-09-15T12:58:53Z"},
            {"bucketId":"3p-weekly","window":"weekly","remainingFraction":0.1,"resetTime":"2026-09-22T07:58:53Z"}
        ]}]}})
    }
    #[test]
    fn desktop_filters_third_party_without_summing_or_defaulting() {
        let parsed = parse_usage(&desktop(), Source::Desktop).unwrap();
        assert_eq!(parsed.weekly.unwrap().remaining_percent, 53.0);
        assert_eq!(parsed.short_window.unwrap().remaining_percent, 81.0);
        let encoded =
            serde_json::to_string(&parse_usage(&desktop(), Source::Desktop).unwrap()).unwrap();
        assert!(!encoded.contains("3p"));
    }
    #[test]
    fn missing_google_fraction_is_not_zero_or_full() {
        for replacement in [Value::Null, json!("0.53"), json!(-0.1), json!(1.01)] {
            let mut value = desktop();
            value["response"]["groups"][0]["buckets"][0]["remainingFraction"] = replacement;
            assert_eq!(
                parse_usage(&value, Source::Desktop),
                Err(Failure::InvalidData)
            );
        }
    }
    #[test]
    fn unknown_and_third_party_only_are_unavailable() {
        let value = json!({"response":{"groups":[{"buckets":[{"bucketId":"3p-weekly"},{"bucketId":"gemini-new"}]}]}});
        assert_eq!(
            parse_usage(&value, Source::Desktop),
            Err(Failure::InvalidData)
        );
    }
    #[test]
    fn duplicate_windows_and_bad_dates_fail_closed() {
        let mut value = desktop();
        let duplicate = value["response"]["groups"][0]["buckets"][0].clone();
        value["response"]["groups"][0]["buckets"]
            .as_array_mut()
            .unwrap()
            .push(duplicate);
        assert_eq!(
            parse_usage(&value, Source::Desktop),
            Err(Failure::InvalidData)
        );
        for reset in ["2026-02-29T00:00:00Z", "yesterday", "1970-01-01T00:00:00Z"] {
            let mut value = desktop();
            value["response"]["groups"][0]["buckets"][0]["resetTime"] = json!(reset);
            assert_eq!(
                parse_usage(&value, Source::Desktop),
                Err(Failure::InvalidData)
            );
        }
    }
    #[test]
    fn cli_version_floor_prevents_agent_prompts() {
        for version in ["1.1.11", "agy 1.2.3\n", "1.10.0"] {
            assert!(supported_cli_version(version));
        }
        for version in [
            "1.1.10",
            "1.0.99",
            "2.0.0",
            "1.2.3-beta",
            "other 1.2.3",
            "1.2.3\nwarning",
        ] {
            assert!(!supported_cli_version(version));
        }
    }
    #[test]
    fn cli_requires_read_only_builtin_not_a_model_answer() {
        let mut value = json!({"status":"SUCCESS","num_turns":0,"usage":{"input_tokens":0,"output_tokens":0,"thinking_tokens":0,"cache_read_tokens":0,"total_tokens":0},"command":{"name":"usage","data":{"groups":[{"buckets":[{"id":"gemini-weekly","window":"weekly","remaining_fraction":0.53,"reset_time":"2026-09-22T07:58:53Z"}]}]}}});
        assert_eq!(
            parse_usage(&value, Source::Cli)
                .unwrap()
                .weekly
                .unwrap()
                .remaining_percent,
            53.0
        );
        value["num_turns"] = json!(1);
        assert_eq!(parse_usage(&value, Source::Cli), Err(Failure::InvalidData));
    }
    #[test]
    fn unrelated_settings_and_legacy_pairing_files_survive() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("settings.json"),
            br#"{"codexPath":"unchanged"}"#,
        )
        .unwrap();
        assert_eq!(load_settings(dir.path()).unwrap(), Settings::default());
        save_settings(
            dir.path(),
            &Settings {
                source: Some(Source::Desktop),
                path: None,
                automatic: false,
            },
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("settings.json")).unwrap(),
            r#"{"codexPath":"unchanged"}"#
        );
        assert_eq!(
            load_settings(dir.path()).unwrap().source,
            Some(Source::Desktop)
        );
        save_settings(dir.path(), &Settings::disabled()).unwrap();
        assert!(load_settings(dir.path()).unwrap().source.is_none());
    }
    #[cfg(unix)]
    #[test]
    fn discovery_uses_current_user_and_ignores_relative_path_entries() {
        let dirs = vec![PathBuf::from("."), PathBuf::from("/custom/bin")];
        let paths = candidates(
            Source::Cli,
            "linux",
            Some(Path::new("/users/another")),
            None,
            None,
            &dirs,
        );
        assert_eq!(
            paths,
            vec![
                PathBuf::from("/users/another/.local/bin/agy"),
                PathBuf::from("/custom/bin/agy")
            ]
        );
        assert!(
            candidates(
                Source::Desktop,
                "macos",
                Some(Path::new("/users/another")),
                None,
                None,
                &[]
            )
            .contains(&PathBuf::from(
                "/users/another/Applications/Antigravity.app/Contents/Resources/bin/language_server"
            ))
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_discovery_uses_current_user_not_a_hardcoded_profile() {
        let paths = candidates(
            Source::Cli,
            "windows",
            Some(Path::new(r"C:\Users\Other")),
            Some(Path::new(r"C:\Users\Other\AppData\Local")),
            None,
            &[PathBuf::from(".")],
        );
        assert!(paths.contains(&PathBuf::from(
            r"C:\Users\Other\AppData\Local\agy\bin\agy.exe"
        )));
        assert!(paths.iter().all(|p| p.is_absolute()));
    }

    #[test]
    fn native_path_rejects_a_renamed_shell_script() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory
            .path()
            .join(if cfg!(windows) { "agy.exe" } else { "agy" });
        fs::write(&file, b"#!/bin/sh\nexit 0\n").unwrap();
        assert_eq!(
            normalize_path(&file, Source::Cli),
            Err(Failure::InvalidPath)
        );
    }
}
