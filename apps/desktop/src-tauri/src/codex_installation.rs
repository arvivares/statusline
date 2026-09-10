use std::{
    env,
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tokio::{process::Command, time::timeout};

#[cfg(any(windows, test))]
#[path = "windows_desktop.rs"]
mod windows_desktop;

const SETTINGS_FILE: &str = "settings.json";
const VERSION_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_SCANNED_VERSIONS: usize = 64;
const WINDOWS_PRODUCT_DIRECTORY: &str = "Statusline Companion";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CodexDiagnosticStatus {
    Ready,
    Missing,
    Invalid,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CodexSource {
    Environment,
    Saved,
    DesktopApp,
    Standalone,
    Npm,
    Volta,
    VersionManager,
    Path,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexDiagnostic {
    pub status: CodexDiagnosticStatus,
    pub path: Option<String>,
    pub source: Option<CodexSource>,
    pub version: Option<String>,
    pub saved_path: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum CodexConfigurationError {
    #[error("The selected path is empty")]
    EmptyPath,
    #[error("The selected file is not a supported Codex launcher")]
    UnsupportedLauncher,
    #[error("The selected Codex launcher could not be verified: {0}")]
    Verification(String),
    #[error("Could not read Statusline settings: {0}")]
    ReadSettings(String),
    #[error("Could not save Statusline settings: {0}")]
    WriteSettings(String),
}

#[derive(Clone, Debug)]
struct Candidate {
    path: PathBuf,
    source: CodexSource,
}

struct VerifiedCandidate {
    candidate: Candidate,
    launch: CodexLaunch,
    version: String,
}

#[derive(Clone, Debug)]
pub(crate) struct CodexLaunch {
    display_path: PathBuf,
    program: PathBuf,
    prefix_args: Vec<OsString>,
}

impl CodexLaunch {
    pub(crate) fn command(&self) -> Command {
        let mut command = Command::new(&self.program);
        command.args(&self.prefix_args);
        command
    }
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    codex_path: Option<PathBuf>,
}

#[must_use]
pub fn codex_candidates(
    configured: Option<&Path>,
    known_installs: &[PathBuf],
    path_entries: &[PathBuf],
    executable_names: &[&str],
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = configured {
        push_unique_path(&mut candidates, path.to_path_buf());
    }
    for path in known_installs {
        push_unique_path(&mut candidates, path.clone());
    }
    for entry in path_entries {
        for executable_name in executable_names {
            push_unique_path(&mut candidates, entry.join(executable_name));
        }
    }
    candidates
}

#[must_use]
pub fn windows_common_paths(
    user_profile: Option<&Path>,
    app_data: Option<&Path>,
    local_app_data: Option<&Path>,
    program_files: Option<&Path>,
    nvm_symlink: Option<&Path>,
) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Some(user_profile) = user_profile {
        push_unique_path(
            &mut paths,
            user_profile.join(".local").join("bin").join("codex.exe"),
        );
        push_unique_path(
            &mut paths,
            user_profile.join(".volta").join("bin").join("codex.exe"),
        );
        push_unique_path(
            &mut paths,
            user_profile.join("scoop").join("shims").join("codex.exe"),
        );
        push_unique_path(
            &mut paths,
            user_profile
                .join(".local")
                .join("share")
                .join("mise")
                .join("shims")
                .join("codex.exe"),
        );
        push_unique_path(
            &mut paths,
            user_profile
                .join(".local")
                .join("share")
                .join("mise")
                .join("shims")
                .join("codex.cmd"),
        );
    }

    if let Some(app_data) = app_data {
        push_unique_path(&mut paths, app_data.join("npm").join("codex.cmd"));
        push_unique_path(&mut paths, app_data.join("npm").join("codex.exe"));
    }

    if let Some(local_app_data) = local_app_data {
        push_unique_path(
            &mut paths,
            local_app_data
                .join("Programs")
                .join("Codex")
                .join("bin")
                .join("codex.exe"),
        );
        push_unique_path(
            &mut paths,
            local_app_data
                .join("Programs")
                .join("OpenAI")
                .join("Codex")
                .join("bin")
                .join("codex.exe"),
        );
        push_unique_path(
            &mut paths,
            local_app_data
                .join("Microsoft")
                .join("WinGet")
                .join("Links")
                .join("codex.exe"),
        );
        push_unique_path(
            &mut paths,
            local_app_data
                .join("Microsoft")
                .join("WindowsApps")
                .join("codex.exe"),
        );
        push_unique_path(
            &mut paths,
            local_app_data.join("Volta").join("bin").join("codex.exe"),
        );
    }

    if let Some(program_files) = program_files {
        push_unique_path(&mut paths, program_files.join("nodejs").join("codex.cmd"));
    }

    if let Some(nvm_symlink) = nvm_symlink {
        push_unique_path(&mut paths, nvm_symlink.join("codex.exe"));
        push_unique_path(&mut paths, nvm_symlink.join("codex.cmd"));
    }

    paths
}

#[must_use]
pub fn windows_local_app_data_from_executable(executable: &Path) -> Option<PathBuf> {
    let product_directory = executable.parent()?;
    if !product_directory
        .file_name()?
        .to_string_lossy()
        .eq_ignore_ascii_case(WINDOWS_PRODUCT_DIRECTORY)
    {
        return None;
    }

    let local_app_data = product_directory.parent()?;
    if !local_app_data
        .file_name()?
        .to_string_lossy()
        .eq_ignore_ascii_case("Local")
        || !local_app_data
            .parent()?
            .file_name()?
            .to_string_lossy()
            .eq_ignore_ascii_case("AppData")
    {
        return None;
    }
    Some(local_app_data.to_path_buf())
}

#[must_use]
pub fn unix_common_paths(home: Option<&Path>) -> Vec<PathBuf> {
    let mut paths = vec![
        PathBuf::from("/usr/local/bin/codex"),
        PathBuf::from("/opt/homebrew/bin/codex"),
    ];

    if let Some(home) = home {
        for relative in [
            ".local/bin/codex",
            ".linuxbrew/bin/codex",
            ".volta/bin/codex",
            ".npm-global/bin/codex",
            ".asdf/shims/codex",
            ".local/share/mise/shims/codex",
        ] {
            push_unique_path(&mut paths, home.join(relative));
        }
    }

    paths
}

pub async fn inspect_codex(
    settings_directory: Option<&Path>,
) -> Result<CodexDiagnostic, CodexConfigurationError> {
    let (saved_path, settings_warning) = read_saved_path(settings_directory)?;
    let candidates = collect_candidates(saved_path.as_deref()).await;
    let (verified, first_failure) = select_verified_candidate(&candidates).await;
    if let Some(VerifiedCandidate {
        candidate,
        launch,
        version,
    }) = verified
    {
        let saved_fallback = saved_path
            .as_ref()
            .is_some_and(|saved| !paths_are_equal(saved, &candidate.path));
        let message = if saved_fallback {
            Some("The saved path is unavailable; automatic detection is active.".to_owned())
        } else {
            settings_warning
        };
        return Ok(CodexDiagnostic {
            status: CodexDiagnosticStatus::Ready,
            path: Some(display_path(&launch.display_path)),
            source: Some(candidate.source),
            version: Some(version),
            saved_path: saved_path.as_ref().map(|path| display_path(path)),
            message,
        });
    }

    let status = if first_failure.is_some() {
        CodexDiagnosticStatus::Invalid
    } else {
        CodexDiagnosticStatus::Missing
    };
    Ok(CodexDiagnostic {
        status,
        path: None,
        source: None,
        version: None,
        saved_path: saved_path.as_ref().map(|path| display_path(path)),
        message: first_failure.or(settings_warning),
    })
}

// Diagnostics and actual usage reads must select the same verified source.
async fn select_verified_candidate(
    candidates: &[Candidate],
) -> (Option<VerifiedCandidate>, Option<String>) {
    let mut first_failure = None;
    for candidate in candidates {
        let Some(launch) = launch_for_candidate(&candidate.path) else {
            if candidate.path.is_file() && first_failure.is_none() {
                first_failure = Some(format!(
                    "{} is not a supported Codex launcher",
                    display_path(&candidate.path)
                ));
            }
            continue;
        };

        match verify_launch(&launch).await {
            Ok(version) => {
                return (
                    Some(VerifiedCandidate {
                        candidate: candidate.clone(),
                        launch,
                        version,
                    }),
                    first_failure,
                );
            }
            Err(error) if first_failure.is_none() => first_failure = Some(error),
            Err(_) => {}
        }
    }

    (None, first_failure)
}

pub async fn save_codex_path(
    settings_directory: &Path,
    selected_path: &str,
) -> Result<CodexDiagnostic, CodexConfigurationError> {
    let trimmed = selected_path.trim();
    if trimmed.is_empty() {
        return Err(CodexConfigurationError::EmptyPath);
    }

    let path = PathBuf::from(trimmed);
    let launch = launch_for_candidate(&path).ok_or(CodexConfigurationError::UnsupportedLauncher)?;
    verify_launch(&launch)
        .await
        .map_err(CodexConfigurationError::Verification)?;
    write_settings(
        settings_directory,
        &Settings {
            codex_path: Some(path),
        },
    )?;
    inspect_codex(Some(settings_directory)).await
}

pub async fn clear_codex_path(
    settings_directory: &Path,
) -> Result<CodexDiagnostic, CodexConfigurationError> {
    write_settings(settings_directory, &Settings::default())?;
    inspect_codex(Some(settings_directory)).await
}

pub(crate) async fn resolve_codex_launch(settings_directory: Option<&Path>) -> Option<CodexLaunch> {
    let saved_path = read_saved_path(settings_directory)
        .ok()
        .and_then(|(path, _warning)| path);
    let candidates = collect_candidates(saved_path.as_deref()).await;
    select_verified_candidate(&candidates)
        .await
        .0
        .map(|verified| verified.launch)
}

async fn collect_candidates(saved_path: Option<&Path>) -> Vec<Candidate> {
    let mut candidates = Vec::new();

    if let Some(path) = env::var_os("STATUSLINE_CODEX_PATH").map(PathBuf::from) {
        push_candidate(&mut candidates, path, CodexSource::Environment);
    }
    if let Some(path) = saved_path {
        push_candidate(&mut candidates, path.to_path_buf(), CodexSource::Saved);
    }

    // Desktop runtimes precede standalone installs; explicit user choices win.
    #[cfg(target_os = "macos")]
    for path in macos_desktop_app_paths(
        Path::new("/Applications"),
        env::var_os("HOME").as_deref().map(Path::new),
    ) {
        push_candidate(&mut candidates, path, CodexSource::DesktopApp);
    }

    #[cfg(windows)]
    {
        let program_files = ["ProgramFiles", "ProgramFiles(x86)"]
            .into_iter()
            .filter_map(|name| env::var_os(name).map(PathBuf::from))
            .collect::<Vec<_>>();
        for path in windows_desktop::discover(&windows_local_app_data_roots(), &program_files).await
        {
            push_candidate(&mut candidates, path, CodexSource::DesktopApp);
        }
        collect_windows_candidates(&mut candidates);
    }
    #[cfg(not(windows))]
    collect_unix_candidates(&mut candidates);

    for entry in search_path_entries() {
        for executable_name in executable_names() {
            push_candidate(
                &mut candidates,
                entry.join(executable_name),
                CodexSource::Path,
            );
        }
    }

    candidates
}

#[cfg(any(target_os = "macos", test))]
fn macos_desktop_app_paths(applications: &Path, user_home: Option<&Path>) -> Vec<PathBuf> {
    let mut roots = vec![applications.to_path_buf()];
    if let Some(user_home) = user_home {
        push_unique_path(&mut roots, user_home.join("Applications"));
    }
    roots
        .into_iter()
        .flat_map(|root| {
            ["ChatGPT.app", "Codex.app"]
                .map(|name| root.join(name).join("Contents/Resources/codex"))
        })
        .collect()
}

#[cfg(windows)]
fn collect_windows_candidates(candidates: &mut Vec<Candidate>) {
    let user_profiles = windows_user_profile_roots();
    let app_data_roots = windows_app_data_roots();
    let local_app_data_roots = windows_local_app_data_roots();
    let program_files = env::var_os("ProgramFiles").map(PathBuf::from);
    let nvm_symlink = env::var_os("NVM_SYMLINK").map(PathBuf::from);

    for local_app_data in &local_app_data_roots {
        for path in windows_common_paths(None, None, Some(local_app_data), None, None) {
            let source = source_for_windows_path(&path, None, Some(local_app_data), None);
            push_candidate(candidates, path, source);
        }
    }
    for app_data in &app_data_roots {
        for path in windows_common_paths(None, Some(app_data), None, None, None) {
            let source = source_for_windows_path(&path, Some(app_data), None, None);
            push_candidate(candidates, path, source);
        }
    }
    for user_profile in &user_profiles {
        for path in windows_common_paths(Some(user_profile), None, None, None, None) {
            let source = source_for_windows_path(&path, None, None, Some(user_profile));
            push_candidate(candidates, path, source);
        }
    }
    for path in windows_common_paths(
        None,
        None,
        None,
        program_files.as_deref(),
        nvm_symlink.as_deref(),
    ) {
        push_candidate(candidates, path, CodexSource::Standalone);
    }

    if let Some(nvm_home) = env::var_os("NVM_HOME").map(PathBuf::from) {
        push_windows_version_manager_codex(candidates, &nvm_home, false);
    }
    for app_data in &app_data_roots {
        push_windows_version_manager_codex(candidates, &app_data.join("nvm"), false);
        push_windows_version_manager_codex(
            candidates,
            &app_data.join("fnm").join("node-versions"),
            true,
        );
    }
    for local_app_data in &local_app_data_roots {
        push_windows_version_manager_codex(
            candidates,
            &local_app_data.join("fnm").join("node-versions"),
            true,
        );
    }
    for user_profile in &user_profiles {
        push_windows_version_manager_codex(
            candidates,
            &user_profile.join(".fnm").join("node-versions"),
            true,
        );
    }
}

#[cfg(windows)]
fn push_windows_version_manager_codex(
    candidates: &mut Vec<Candidate>,
    versions_root: &Path,
    uses_installation_directory: bool,
) {
    for version_directory in child_directories(versions_root) {
        let executable_root = if uses_installation_directory {
            version_directory.join("installation")
        } else {
            version_directory
        };
        push_candidate(
            candidates,
            executable_root.join("codex.exe"),
            CodexSource::VersionManager,
        );
        push_candidate(
            candidates,
            executable_root.join("codex.cmd"),
            CodexSource::VersionManager,
        );
    }
}

#[cfg(windows)]
fn source_for_windows_path(
    path: &Path,
    app_data: Option<&Path>,
    local_app_data: Option<&Path>,
    user_profile: Option<&Path>,
) -> CodexSource {
    if app_data.is_some_and(|root| path.starts_with(root.join("npm"))) {
        CodexSource::Npm
    } else if user_profile.is_some_and(|root| path.starts_with(root.join(".volta")))
        || local_app_data.is_some_and(|root| path.starts_with(root.join("Volta")))
    {
        CodexSource::Volta
    } else if user_profile.is_some_and(|root| path.starts_with(root.join("scoop"))) {
        CodexSource::VersionManager
    } else {
        CodexSource::Standalone
    }
}

#[cfg(not(windows))]
fn collect_unix_candidates(candidates: &mut Vec<Candidate>) {
    let home = env::var_os("HOME").map(PathBuf::from);
    for path in unix_common_paths(home.as_deref()) {
        let source = source_for_unix_path(&path, home.as_deref());
        push_candidate(candidates, path, source);
    }

    if let Some(home) = home {
        let nvm_versions = home.join(".nvm").join("versions").join("node");
        for version_directory in child_directories(&nvm_versions) {
            push_candidate(
                candidates,
                version_directory.join("bin").join("codex"),
                CodexSource::VersionManager,
            );
        }
        let fnm_versions = home
            .join(".local")
            .join("share")
            .join("fnm")
            .join("node-versions");
        for version_directory in child_directories(&fnm_versions) {
            push_candidate(
                candidates,
                version_directory
                    .join("installation")
                    .join("bin")
                    .join("codex"),
                CodexSource::VersionManager,
            );
        }
    }
}

#[cfg(not(windows))]
fn source_for_unix_path(path: &Path, home: Option<&Path>) -> CodexSource {
    if home.is_some_and(|root| path.starts_with(root.join(".volta"))) {
        CodexSource::Volta
    } else if home.is_some_and(|root| path.starts_with(root.join(".npm-global"))) {
        CodexSource::Npm
    } else if home.is_some_and(|root| {
        path.starts_with(root.join(".asdf")) || path.starts_with(root.join(".local/share/mise"))
    }) {
        CodexSource::VersionManager
    } else {
        CodexSource::Standalone
    }
}

fn child_directories(parent: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(parent) else {
        return Vec::new();
    };
    let mut directories = entries
        .flatten()
        .take(MAX_SCANNED_VERSIONS)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect::<Vec<_>>();
    directories.sort();
    directories.reverse();
    directories
}

fn launch_for_candidate(path: &Path) -> Option<CodexLaunch> {
    // File pickers on macOS return the .app package, not its internal executable.
    // Keep the saved package path so app updates do not pin a versioned location.
    #[cfg(target_os = "macos")]
    if path.is_dir() && path.extension().is_some_and(|extension| extension == "app") {
        return launch_for_candidate(&path.join("Contents/Resources/codex"));
    }
    if !path.is_file() {
        return None;
    }

    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if extension.eq_ignore_ascii_case("cmd") || extension.eq_ignore_ascii_case("bat") {
        return npm_launch(path);
    }
    if extension.eq_ignore_ascii_case("ps1") {
        return None;
    }

    Some(CodexLaunch {
        display_path: path.to_path_buf(),
        program: path.to_path_buf(),
        prefix_args: Vec::new(),
    })
}

fn npm_launch(shim: &Path) -> Option<CodexLaunch> {
    let prefix = shim.parent()?;
    let script = prefix
        .join("node_modules")
        .join("@openai")
        .join("codex")
        .join("bin")
        .join("codex.js");
    if !script.is_file() {
        return None;
    }

    let node = node_candidates(prefix)
        .into_iter()
        .find(|candidate| candidate.is_file())?;
    Some(CodexLaunch {
        display_path: shim.to_path_buf(),
        program: node,
        prefix_args: vec![script.into_os_string()],
    })
}

fn node_candidates(prefix: &Path) -> Vec<PathBuf> {
    let mut candidates = vec![prefix.join("node.exe")];
    if let Some(nvm_symlink) = env::var_os("NVM_SYMLINK").map(PathBuf::from) {
        push_unique_path(&mut candidates, nvm_symlink.join("node.exe"));
    }
    if let Some(program_files) = env::var_os("ProgramFiles").map(PathBuf::from) {
        push_unique_path(
            &mut candidates,
            program_files.join("nodejs").join("node.exe"),
        );
    }
    if let Some(program_files_x86) = env::var_os("ProgramFiles(x86)").map(PathBuf::from) {
        push_unique_path(
            &mut candidates,
            program_files_x86.join("nodejs").join("node.exe"),
        );
    }
    for user_profile in windows_user_profile_roots() {
        push_unique_path(
            &mut candidates,
            user_profile.join(".volta").join("bin").join("node.exe"),
        );
        push_windows_version_manager_nodes(
            &mut candidates,
            &user_profile.join(".fnm").join("node-versions"),
            true,
        );
    }
    for local_app_data in windows_local_app_data_roots() {
        push_unique_path(
            &mut candidates,
            local_app_data.join("Volta").join("bin").join("node.exe"),
        );
        push_windows_version_manager_nodes(
            &mut candidates,
            &local_app_data.join("fnm").join("node-versions"),
            true,
        );
    }
    for app_data in windows_app_data_roots() {
        push_windows_version_manager_nodes(&mut candidates, &app_data.join("nvm"), false);
        push_windows_version_manager_nodes(
            &mut candidates,
            &app_data.join("fnm").join("node-versions"),
            true,
        );
    }
    if let Some(nvm_home) = env::var_os("NVM_HOME").map(PathBuf::from) {
        push_windows_version_manager_nodes(&mut candidates, &nvm_home, false);
    }
    for entry in search_path_entries() {
        push_unique_path(&mut candidates, entry.join("node.exe"));
    }
    candidates
}

#[cfg(windows)]
fn push_windows_version_manager_nodes(
    candidates: &mut Vec<PathBuf>,
    versions_root: &Path,
    uses_installation_directory: bool,
) {
    for version_directory in child_directories(versions_root) {
        let executable_root = if uses_installation_directory {
            version_directory.join("installation")
        } else {
            version_directory
        };
        push_unique_path(candidates, executable_root.join("node.exe"));
    }
}

#[cfg(not(windows))]
fn push_windows_version_manager_nodes(
    _candidates: &mut Vec<PathBuf>,
    _versions_root: &Path,
    _uses_installation_directory: bool,
) {
}

fn search_path_entries() -> Vec<PathBuf> {
    let entries = env::var_os("PATH")
        .map(|path| env::split_paths(&path).collect::<Vec<_>>())
        .unwrap_or_default();

    #[cfg(windows)]
    let entries = {
        let mut entries = entries;
        for entry in windows_registry_path_entries() {
            push_unique_path(&mut entries, entry);
        }
        entries
    };

    entries
}

#[cfg(windows)]
fn windows_registry_path_entries() -> Vec<PathBuf> {
    use winreg::{RegKey, enums::HKEY_CURRENT_USER, enums::HKEY_LOCAL_MACHINE};

    let keys = [
        RegKey::predef(HKEY_CURRENT_USER).open_subkey("Environment"),
        RegKey::predef(HKEY_LOCAL_MACHINE)
            .open_subkey(r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
    ];
    let mut entries = Vec::new();
    for key in keys.into_iter().flatten() {
        let Ok(path) = key.get_value::<OsString, _>("Path") else {
            continue;
        };
        let expanded = expand_windows_environment(&path);
        for entry in env::split_paths(&expanded) {
            push_unique_path(&mut entries, entry);
        }
    }
    entries
}

#[cfg(windows)]
fn expand_windows_environment(value: &std::ffi::OsStr) -> OsString {
    let source = value.to_string_lossy();
    let mut expanded = String::with_capacity(source.len());
    let mut remaining = source.as_ref();

    while let Some(start) = remaining.find('%') {
        expanded.push_str(&remaining[..start]);
        let after_start = &remaining[start + 1..];
        let Some(end) = after_start.find('%') else {
            expanded.push_str(&remaining[start..]);
            return OsString::from(expanded);
        };
        let variable = &after_start[..end];
        if let Some(replacement) = known_windows_environment(variable) {
            expanded.push_str(&replacement.to_string_lossy());
        } else {
            expanded.push('%');
            expanded.push_str(variable);
            expanded.push('%');
        }
        remaining = &after_start[end + 1..];
    }
    expanded.push_str(remaining);
    OsString::from(expanded)
}

#[cfg(windows)]
fn known_windows_environment(variable: &str) -> Option<OsString> {
    match variable.to_ascii_uppercase().as_str() {
        "USERPROFILE" => windows_user_profile().map(PathBuf::into_os_string),
        "APPDATA" => windows_app_data().map(PathBuf::into_os_string),
        "LOCALAPPDATA" => windows_local_app_data().map(PathBuf::into_os_string),
        _ => None,
    }
    .or_else(|| env::var_os(variable))
}

#[cfg(windows)]
fn windows_user_profile() -> Option<PathBuf> {
    windows_user_profile_roots().into_iter().next()
}

#[cfg(not(windows))]
fn windows_user_profile() -> Option<PathBuf> {
    env::var_os("USERPROFILE").map(PathBuf::from)
}

#[cfg(windows)]
fn windows_app_data() -> Option<PathBuf> {
    windows_app_data_roots().into_iter().next()
}

#[cfg(not(windows))]
fn windows_app_data() -> Option<PathBuf> {
    env::var_os("APPDATA").map(PathBuf::from)
}

#[cfg(windows)]
fn windows_local_app_data() -> Option<PathBuf> {
    windows_local_app_data_roots().into_iter().next()
}

#[cfg(not(windows))]
fn windows_local_app_data() -> Option<PathBuf> {
    env::var_os("LOCALAPPDATA").map(PathBuf::from)
}

#[cfg(windows)]
fn windows_user_profile_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(local_app_data) = installed_windows_local_app_data()
        && let Some(profile) = profile_from_local_app_data(&local_app_data)
    {
        push_unique_path(&mut roots, profile);
    }
    if let Some(profile) = env::var_os("USERPROFILE").map(PathBuf::from) {
        push_unique_path(&mut roots, profile);
    }
    if let Some(profile) = dirs::home_dir() {
        push_unique_path(&mut roots, profile);
    }
    roots
}

#[cfg(windows)]
fn windows_app_data_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(local_app_data) = installed_windows_local_app_data()
        && let Some(app_data) = local_app_data.parent()
    {
        push_unique_path(&mut roots, app_data.join("Roaming"));
    }
    if let Some(app_data) = env::var_os("APPDATA").map(PathBuf::from) {
        push_unique_path(&mut roots, app_data);
    }
    if let Some(app_data) = dirs::data_dir() {
        push_unique_path(&mut roots, app_data);
    }
    for profile in windows_user_profile_roots() {
        push_unique_path(&mut roots, profile.join("AppData").join("Roaming"));
    }
    roots
}

#[cfg(windows)]
fn windows_local_app_data_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(local_app_data) = installed_windows_local_app_data() {
        push_unique_path(&mut roots, local_app_data);
    }
    if let Some(local_app_data) = env::var_os("LOCALAPPDATA").map(PathBuf::from) {
        push_unique_path(&mut roots, local_app_data);
    }
    if let Some(local_app_data) = dirs::data_local_dir() {
        push_unique_path(&mut roots, local_app_data);
    }
    for profile in windows_user_profile_roots() {
        push_unique_path(&mut roots, profile.join("AppData").join("Local"));
    }
    roots
}

#[cfg(windows)]
fn installed_windows_local_app_data() -> Option<PathBuf> {
    env::current_exe()
        .ok()
        .and_then(|path| windows_local_app_data_from_executable(&path))
}

#[cfg(windows)]
fn profile_from_local_app_data(local_app_data: &Path) -> Option<PathBuf> {
    local_app_data.parent()?.parent().map(Path::to_path_buf)
}

#[cfg(not(windows))]
fn windows_user_profile_roots() -> Vec<PathBuf> {
    windows_user_profile().into_iter().collect()
}

#[cfg(not(windows))]
fn windows_app_data_roots() -> Vec<PathBuf> {
    windows_app_data().into_iter().collect()
}

#[cfg(not(windows))]
fn windows_local_app_data_roots() -> Vec<PathBuf> {
    windows_local_app_data().into_iter().collect()
}

async fn verify_launch(launch: &CodexLaunch) -> Result<String, String> {
    let mut command = launch.command();
    command
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    configure_hidden_process(&mut command);

    let output = timeout(VERSION_TIMEOUT, command.output())
        .await
        .map_err(|_| "verification timed out".to_owned())?
        .map_err(|error| error.to_string())?;
    let version = String::from_utf8_lossy(if output.stdout.is_empty() {
        &output.stderr
    } else {
        &output.stdout
    })
    .trim()
    .to_owned();

    if !output.status.success() {
        return Err(compact_message(&version, "codex --version failed"));
    }
    if !version.to_ascii_lowercase().contains("codex") {
        return Err("the executable did not identify itself as Codex".to_owned());
    }
    Ok(compact_message(&version, "Codex CLI"))
}

fn read_saved_path(
    settings_directory: Option<&Path>,
) -> Result<(Option<PathBuf>, Option<String>), CodexConfigurationError> {
    let Some(directory) = settings_directory else {
        return Ok((None, None));
    };
    let path = directory.join(SETTINGS_FILE);
    if !path.is_file() {
        return Ok((None, None));
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| CodexConfigurationError::ReadSettings(error.to_string()))?;
    match serde_json::from_str::<Settings>(&contents) {
        Ok(settings) => Ok((settings.codex_path, None)),
        Err(_) => Ok((
            None,
            Some("The saved settings were invalid; automatic detection is active.".to_owned()),
        )),
    }
}

fn write_settings(
    settings_directory: &Path,
    settings: &Settings,
) -> Result<(), CodexConfigurationError> {
    fs::create_dir_all(settings_directory)
        .map_err(|error| CodexConfigurationError::WriteSettings(error.to_string()))?;
    let encoded = serde_json::to_vec_pretty(settings)
        .map_err(|error| CodexConfigurationError::WriteSettings(error.to_string()))?;
    fs::write(settings_directory.join(SETTINGS_FILE), encoded)
        .map_err(|error| CodexConfigurationError::WriteSettings(error.to_string()))
}

fn executable_names() -> &'static [&'static str] {
    #[cfg(windows)]
    {
        &["codex.exe", "codex.cmd", "codex.bat"]
    }
    #[cfg(not(windows))]
    {
        &["codex"]
    }
}

fn push_candidate(candidates: &mut Vec<Candidate>, path: PathBuf, source: CodexSource) {
    if candidates
        .iter()
        .any(|existing| paths_are_equal(&existing.path, &path))
    {
        return;
    }
    candidates.push(Candidate { path, source });
}

fn push_unique_path(candidates: &mut Vec<PathBuf>, path: PathBuf) {
    if !candidates
        .iter()
        .any(|existing| paths_are_equal(existing, &path))
    {
        candidates.push(path);
    }
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn compact_message(message: &str, fallback: &str) -> String {
    let single_line = message.split_whitespace().collect::<Vec<_>>().join(" ");
    if single_line.is_empty() {
        return fallback.to_owned();
    }
    single_line.chars().take(240).collect()
}

#[cfg(windows)]
fn paths_are_equal(left: &Path, right: &Path) -> bool {
    left.components()
        .map(|component| component.as_os_str().to_string_lossy().to_ascii_lowercase())
        .eq(right
            .components()
            .map(|component| component.as_os_str().to_string_lossy().to_ascii_lowercase()))
}

#[cfg(not(windows))]
fn paths_are_equal(left: &Path, right: &Path) -> bool {
    left == right
}

#[cfg(windows)]
pub(crate) fn configure_hidden_process(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.as_std_mut().creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub(crate) fn configure_hidden_process(_command: &mut Command) {}

#[cfg(test)]
mod tests {
    use std::{env, fs, path::PathBuf, process};

    use super::{
        Settings, launch_for_candidate, read_saved_path, windows_common_paths,
        windows_local_app_data_from_executable, write_settings,
    };

    #[test]
    fn desktop_app_locations_are_bounded_and_user_independent() {
        let paths = super::macos_desktop_app_paths(
            std::path::Path::new("/Applications"),
            Some(std::path::Path::new("/Users/Ada Lovelace")),
        );
        assert_eq!(
            paths,
            vec![
                PathBuf::from("/Applications/ChatGPT.app/Contents/Resources/codex"),
                PathBuf::from("/Applications/Codex.app/Contents/Resources/codex"),
                PathBuf::from(
                    "/Users/Ada Lovelace/Applications/ChatGPT.app/Contents/Resources/codex"
                ),
                PathBuf::from(
                    "/Users/Ada Lovelace/Applications/Codex.app/Contents/Resources/codex"
                ),
            ]
        );
        assert_eq!(
            super::macos_desktop_app_paths(std::path::Path::new("/Applications"), None).len(),
            2
        );
        assert_eq!(
            serde_json::to_value(super::CodexSource::DesktopApp).unwrap(),
            "desktopApp"
        );
    }

    #[cfg(unix)]
    fn fake_codex(path: &std::path::Path, script: &str) {
        use std::os::unix::fs::PermissionsExt;
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, script).unwrap();
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn verified_selection_skips_missing_broken_and_non_codex_sources() {
        use super::{Candidate, CodexSource, select_verified_candidate};
        let directory = test_directory("verified-fallback");
        let missing = directory.join("missing");
        let broken = directory.join("broken");
        let impostor = directory.join("not-codex");
        let bundled = directory.join("ChatGPT.app/Contents/Resources/codex");
        let fallback = directory.join("cli/codex");
        fake_codex(&broken, "#!/bin/sh\nexit 1\n");
        fake_codex(&impostor, "#!/bin/sh\nprintf 'unrelated tool 1.0\\n'\n");
        fake_codex(
            &bundled,
            "#!/bin/sh\n[ \"$1\" = --version ] || exit 1\nprintf 'codex-cli 0.151.0\\n'\n",
        );
        fake_codex(&fallback, "#!/bin/sh\nprintf 'codex-cli 0.149.1\\n'\n");
        let candidates = vec![
            Candidate {
                path: missing,
                source: CodexSource::Environment,
            },
            Candidate {
                path: broken,
                source: CodexSource::Saved,
            },
            Candidate {
                path: impostor,
                source: CodexSource::DesktopApp,
            },
            Candidate {
                path: bundled.clone(),
                source: CodexSource::DesktopApp,
            },
            Candidate {
                path: fallback.clone(),
                source: CodexSource::Path,
            },
        ];
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let (selected, failure) = runtime.block_on(select_verified_candidate(&candidates));
        let selected = selected.unwrap();
        assert!(failure.is_some());
        assert_eq!(selected.launch.program, bundled);
        assert_eq!(selected.candidate.source, CodexSource::DesktopApp);
        assert_eq!(selected.version, "codex-cli 0.151.0");
        // An app removed/replaced by its updater must not hide a valid CLI.
        fs::remove_file(&bundled).unwrap();
        let (selected, _) = runtime.block_on(select_verified_candidate(&candidates));
        assert_eq!(selected.unwrap().launch.program, fallback);
        // Explicit choices still win over automatic app discovery.
        fake_codex(&bundled, "#!/bin/sh\nprintf 'codex-cli 0.151.0\\n'\n");
        let explicit = vec![
            Candidate {
                path: fallback,
                source: CodexSource::Saved,
            },
            candidates[3].clone(),
        ];
        let (selected, _) = runtime.block_on(select_verified_candidate(&explicit));
        assert_eq!(selected.unwrap().candidate.source, CodexSource::Saved);
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_picker_accepts_an_app_package_with_spaces_but_not_arbitrary_directories() {
        let directory = test_directory("app-picker");
        let bundle = directory.join("My Codex.app");
        let executable = bundle.join("Contents/Resources/codex");
        fake_codex(&executable, "#!/bin/sh\nprintf 'codex-cli 0.151.0\\n'\n");
        let launch = launch_for_candidate(&bundle).unwrap();
        assert_eq!(launch.program, executable);
        assert!(launch.prefix_args.is_empty());
        assert!(launch_for_candidate(&directory).is_none());
        assert!(launch_for_candidate(&directory.join("Missing.app")).is_none());
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn saved_paths_precede_automatic_bundles_in_the_production_collector() {
        let saved = PathBuf::from("/explicit/test/codex");
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let candidates = runtime.block_on(super::collect_candidates(Some(&saved)));
        let saved_index = candidates
            .iter()
            .position(|candidate| candidate.path == saved)
            .unwrap();
        let app_index = candidates
            .iter()
            .position(|candidate| candidate.source == super::CodexSource::DesktopApp)
            .unwrap();
        assert!(saved_index < app_index);
        assert_eq!(
            candidates[app_index].path,
            PathBuf::from("/Applications/ChatGPT.app/Contents/Resources/codex")
        );
    }

    #[test]
    fn windows_standalone_codex_path_is_user_independent() {
        let local_app_data = PathBuf::from(r"C:\Users\Ada\AppData\Local");

        let paths = windows_common_paths(None, None, Some(&local_app_data), None, None);

        assert!(
            paths.contains(
                &local_app_data
                    .join("Programs")
                    .join("OpenAI")
                    .join("Codex")
                    .join("bin")
                    .join("codex.exe")
            )
        );
    }

    #[test]
    fn installed_executable_recovers_the_current_users_local_app_data() {
        let executable =
            PathBuf::from("C:/Users/Ada/AppData/Local/Statusline Companion/statusline-desktop.exe");

        assert_eq!(
            windows_local_app_data_from_executable(&executable),
            Some(PathBuf::from("C:/Users/Ada/AppData/Local"))
        );
    }

    #[test]
    fn custom_install_directory_is_not_mistaken_for_local_app_data() {
        let executable = PathBuf::from("D:/Apps/Statusline Companion/statusline-desktop.exe");

        assert_eq!(windows_local_app_data_from_executable(&executable), None);
    }

    #[test]
    fn npm_cmd_launcher_requires_the_adjacent_official_package() {
        let directory = test_directory("npm-launcher");
        let shim = directory.join("codex.cmd");
        fs::write(&shim, "@echo off").expect("test shim should be writable");

        assert!(launch_for_candidate(&shim).is_none());

        fs::remove_dir_all(directory).expect("test directory should be removable");
    }

    #[test]
    fn npm_cmd_launcher_uses_node_without_invoking_a_command_shell() {
        let directory = test_directory("npm-package");
        let shim = directory.join("codex.cmd");
        let node = directory.join("node.exe");
        let script = directory
            .join("node_modules")
            .join("@openai")
            .join("codex")
            .join("bin")
            .join("codex.js");
        fs::create_dir_all(script.parent().expect("script should have a parent"))
            .expect("test package directory should be writable");
        fs::write(&shim, "@echo off").expect("test shim should be writable");
        fs::write(&node, []).expect("test Node executable should be writable");
        fs::write(&script, []).expect("test Codex script should be writable");

        let launch = launch_for_candidate(&shim).expect("official npm layout should resolve");

        assert_eq!(launch.display_path, shim);
        assert_eq!(launch.program, node);
        assert_eq!(launch.prefix_args, vec![script.into_os_string()]);
        fs::remove_dir_all(directory).expect("test directory should be removable");
    }

    #[test]
    fn selected_path_round_trips_through_local_settings() {
        let directory = test_directory("settings");
        let selected_path = PathBuf::from("C:/Users/Ada/.local/bin/codex.exe");
        write_settings(
            &directory,
            &Settings {
                codex_path: Some(selected_path.clone()),
            },
        )
        .expect("settings should be writable");

        let (saved_path, warning) =
            read_saved_path(Some(&directory)).expect("settings should be readable");

        assert_eq!(saved_path, Some(selected_path));
        assert_eq!(warning, None);
        fs::remove_dir_all(directory).expect("test directory should be removable");
    }

    pub(super) fn test_directory(label: &str) -> PathBuf {
        let directory = env::temp_dir().join(format!(
            "statusline-codex-{label}-{}-{:?}",
            process::id(),
            std::thread::current().id()
        ));
        if directory.is_dir() {
            fs::remove_dir_all(&directory).expect("stale test directory should be removable");
        }
        fs::create_dir_all(&directory).expect("test directory should be creatable");
        directory
    }
}
