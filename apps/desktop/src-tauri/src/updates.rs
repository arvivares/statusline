//! Native update scheduling survives a hidden/suspended WebView. Installation
//! requires an explicit command for the exact version currently offered.
use crate::update_policy::{
    self, Candidate, MAX_DOWNLOAD_BYTES, MAX_FEED_BYTES, MAX_MANIFEST_BYTES,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::{
    fs,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{
    AppHandle, Emitter, Manager, State,
    utils::{config::BundleType, platform::bundle_type},
};
use tauri_plugin_updater::{Update, UpdaterExt};

use update_policy::CheckReason;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    phase: &'static str,
    current_version: &'static str,
    pub(crate) version: Option<String>,
    automatic: bool,
    dismissed_version: Option<String>,
    presentation_id: u32,
    installable: bool,
    downloaded: u64,
    total: Option<u64>,
    error: Option<&'static str>,
}

#[derive(Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct Preferences {
    automatic: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self { automatic: true }
    }
}

struct Inner {
    status: UpdateStatus,
    update: Option<Update>,
    last_check: Option<Instant>,
}

pub struct UpdateState {
    inner: Mutex<Inner>,
    operation: tokio::sync::Mutex<()>,
    preferences_path: Option<PathBuf>,
    disabled: bool,
    wake: tokio::sync::Notify,
}

impl UpdateState {
    pub fn new(config_directory: Option<PathBuf>, disabled: bool) -> Self {
        let path = config_directory.map(|dir| dir.join("updater-preferences.json"));
        let prefs = path
            .as_ref()
            .and_then(|file| {
                let metadata = fs::metadata(file).ok()?;
                if metadata.len() > 4096 {
                    return None;
                }
                serde_json::from_slice::<Preferences>(&fs::read(file).ok()?).ok()
            })
            .unwrap_or_default();
        Self {
            inner: Mutex::new(Inner {
                status: UpdateStatus {
                    phase: "idle",
                    current_version: env!("CARGO_PKG_VERSION"),
                    version: None,
                    automatic: prefs.automatic,
                    // Ignore legacy persisted Later: it now snoozes this opening
                    // only. The user's automatic-check opt-out is still retained.
                    dismissed_version: None,
                    presentation_id: 0,
                    installable: installation_target().is_some(),
                    downloaded: 0,
                    total: None,
                    error: None,
                },
                update: None,
                last_check: None,
            }),
            operation: tokio::sync::Mutex::new(()),
            preferences_path: path,
            disabled,
            wake: tokio::sync::Notify::new(),
        }
    }
    fn with<T>(&self, action: impl FnOnce(&mut Inner) -> T) -> T {
        action(&mut self.inner.lock().unwrap_or_else(|error| error.into_inner()))
    }
    fn status(&self) -> UpdateStatus {
        self.with(|inner| inner.status.clone())
    }
    fn emit(&self, app: &AppHandle) -> UpdateStatus {
        let status = self.status();
        crate::set_update_menu_label(app, status.version.as_deref());
        let _ = app.emit("updater-status", &status);
        status
    }
    fn fail(&self, app: &AppHandle, error: &'static str) -> UpdateStatus {
        self.with(|inner| {
            inner.status.phase = "error";
            inner.status.error = Some(error);
        });
        self.emit(app)
    }
    fn save_preferences(&self, prefs: &Preferences) -> Result<(), String> {
        let path = self.preferences_path.as_ref().ok_or("preferencesFailed")?;
        fs::create_dir_all(path.parent().ok_or("preferencesFailed")?)
            .map_err(|_| "preferencesFailed")?;
        // Small non-secret settings only, never a token/key or arbitrary path.
        let bytes = serde_json::to_vec(prefs).map_err(|_| "preferencesFailed")?;
        let mut temporary =
            tempfile::NamedTempFile::new_in(path.parent().ok_or("preferencesFailed")?)
                .map_err(|_| "preferencesFailed")?;
        temporary
            .write_all(&bytes)
            .map_err(|_| "preferencesFailed")?;
        temporary
            .as_file()
            .sync_all()
            .map_err(|_| "preferencesFailed")?;
        temporary
            .persist(path)
            .map_err(|_| "preferencesFailed".to_owned())?;
        Ok(())
    }
}

/// Format is read from Tauri's bundle marker, not guessed from PATH. Unknown
/// formats and package-manager installations get a release-page fallback.
fn installation_target() -> Option<&'static str> {
    #[cfg(target_os = "macos")]
    crate::macos_update::installed_bundle(&std::env::current_exe().ok()?)?;
    match (std::env::consts::OS, std::env::consts::ARCH, bundle_type()) {
        ("macos", "aarch64", Some(BundleType::App)) => Some("darwin-aarch64"),
        ("macos", "x86_64", Some(BundleType::App)) => Some("darwin-x86_64"),
        ("windows", "x86_64", Some(BundleType::Nsis)) => Some("windows-x86_64-nsis"),
        ("windows", "x86_64", Some(BundleType::Msi)) => Some("windows-x86_64-msi"),
        ("linux", "x86_64", Some(BundleType::AppImage)) => {
            // An extracted AppDir cannot safely replace the mounted AppImage.
            let path = std::env::var_os("APPIMAGE").map(PathBuf::from)?;
            path.is_file().then_some("linux-x86_64-appimage")
        }
        _ => None,
    }
}

fn github_client(builder: reqwest::ClientBuilder) -> reqwest::ClientBuilder {
    builder
        .https_only(true)
        .connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let url = attempt.url();
            let allowed = matches!(
                url.host_str(),
                Some(
                    "github.com"
                        | "api.github.com"
                        | "release-assets.githubusercontent.com"
                        | "objects.githubusercontent.com"
                )
            );
            if attempt.previous().len() < 5
                && allowed
                && url.scheme() == "https"
                && url.username().is_empty()
                && url.password().is_none()
                && url.port_or_known_default() == Some(443)
            {
                attempt.follow()
            } else {
                attempt.error("Untrusted update redirect")
            }
        }))
}

async fn bounded_body(mut response: reqwest::Response, limit: usize) -> Result<Vec<u8>, ()> {
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|size| size > limit as u64)
    {
        return Err(());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| ())? {
        if body.len().saturating_add(chunk.len()) > limit {
            return Err(());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

async fn discover() -> Result<Option<Candidate>, ()> {
    let client = github_client(reqwest::Client::builder())
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("Statusline/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| ())?;
    let beta = serde_json::from_str::<serde_json::Value>(include_str!("../../../../release.json"))
        .map_err(|_| ())?["channel"]
        == "beta";
    let mut candidate: Option<Candidate> = None;
    // Bounded pagination: a partial feed must never claim 'up to date'.
    for page in 1..=5 {
        let response = client
            .get(format!("{}&page={page}", update_policy::RELEASES_URL))
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|_| ())?;
        let body = bounded_body(response, MAX_FEED_BYTES).await?;
        let count = serde_json::from_slice::<Vec<update_policy::Release>>(&body)
            .map_err(|_| ())?
            .len();
        let found = update_policy::select_release(&body, env!("CARGO_PKG_VERSION"), beta)?;
        if let Some(found) = found {
            if candidate.as_ref().is_none_or(|old| {
                update_policy::version_parts(&found.version)
                    > update_policy::version_parts(&old.version)
            }) {
                candidate = Some(found);
            }
        }
        if count < 20 {
            return Ok(candidate);
        }
    }
    Err(())
}

async fn prepare_update(
    app: &AppHandle,
    candidate: &Candidate,
    target: &str,
) -> Result<Update, ()> {
    let endpoint = update_policy::asset_url(&candidate.version, "updater.json").ok_or(())?;
    // Bound and validate the published asset before handing it to the plugin.
    // Pin the plugin's second read to the immutable GitHub CDN object reached
    // by this response, then require exact JSON equality to avoid mutable-name races.
    let client = github_client(reqwest::Client::builder())
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("Statusline/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| ())?;
    let response = client.get(endpoint).send().await.map_err(|_| ())?;
    let object_url = response.url().clone();
    if object_url.host_str() != Some("release-assets.githubusercontent.com") {
        return Err(());
    }
    let manifest: serde_json::Value =
        serde_json::from_slice(&bounded_body(response, MAX_MANIFEST_BYTES as usize).await?)
            .map_err(|_| ())?;
    let mut builder = app
        .updater_builder()
        .target(target)
        .endpoints(vec![object_url])
        .map_err(|_| ())?
        .timeout(Duration::from_secs(20))
        .configure_client(github_client)
        // On Windows, keep the tray/window alive if ShellExecute fails. The
        // plugin exits the process only after successfully launching the installer.
        .on_before_exit(|| {});
    if target == "windows-x86_64-msi" {
        // Ordinary MSI installs never auto-launch. Opt in only after explicit
        // update consent, retaining the interactive user's per-user context.
        builder = builder.installer_arg("STATUSLINE_UPDATER=1");
    }
    let mut update = builder
        .build()
        .map_err(|_| ())?
        .check()
        .await
        .map_err(|_| ())?
        .ok_or(())?;
    let channel =
        serde_json::from_str::<serde_json::Value>(include_str!("../../../../release.json"))
            .map_err(|_| ())?["channel"]
            .clone();
    if update.version != candidate.version
        || update.raw_json != manifest
        || update.raw_json["channel"] != channel
        || update.raw_json["version"] != candidate.version
        || update.raw_json.to_string().len() > MAX_MANIFEST_BYTES as usize
        || !update_policy::valid_download(candidate, update.download_url.as_str(), target)
        || update.signature.len() > 2048
        || STANDARD.decode(&update.signature).is_err()
    {
        return Err(());
    }
    // The plugin's check timeout does not propagate to its download object.
    update.timeout = Some(Duration::from_secs(15 * 60));
    Ok(update)
}

async fn download_verified(app: &AppHandle, update: &Update) -> Result<Vec<u8>, ()> {
    let state = app.state::<UpdateState>();
    let client = github_client(reqwest::Client::builder())
        .timeout(Duration::from_secs(15 * 60))
        .user_agent(concat!("Statusline/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| ())?;
    let mut response = client
        .get(update.download_url.clone())
        .send()
        .await
        .map_err(|_| ())?;
    let total = response.content_length();
    if !response.status().is_success() || total.is_some_and(|size| size > MAX_DOWNLOAD_BYTES) {
        return Err(());
    }
    let mut bytes = Vec::new();
    let mut last_progress = Instant::now();
    while let Some(chunk) = response.chunk().await.map_err(|_| ())? {
        // Check BEFORE extending the buffer, including responses without a length.
        if (bytes.len() as u64).saturating_add(chunk.len() as u64) > MAX_DOWNLOAD_BYTES {
            return Err(());
        }
        bytes.extend_from_slice(&chunk);
        state.with(|inner| {
            inner.status.downloaded = bytes.len() as u64;
            inner.status.total = total;
        });
        if last_progress.elapsed() >= Duration::from_millis(200) {
            state.emit(app);
            last_progress = Instant::now();
        }
    }
    if bytes.is_empty() || total.is_some_and(|size| size != bytes.len() as u64) {
        return Err(());
    }
    let key = app
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|config| config.get("pubkey"))
        .and_then(serde_json::Value::as_str)
        .ok_or(())?;
    crate::update_signature::verify(&bytes, &update.signature, key)?;
    Ok(bytes)
}

#[tauri::command]
pub fn updater_status(state: State<'_, UpdateState>) -> UpdateStatus {
    state.status()
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> UpdateStatus {
    check_native(&app, CheckReason::Manual).await
}

/// Called only on an actual native presentation, not every focus notification.
/// Cached availability is immediately re-announced; discovery is rate limited.
pub fn window_opened(app: &AppHandle) {
    let state = app.state::<UpdateState>();
    state.with(|inner| {
        inner.status.presentation_id = inner.status.presentation_id.wrapping_add(1);
        inner.status.dismissed_version = None;
    });
    state.emit(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        check_native(&app, CheckReason::Foreground).await;
    });
}

async fn check_native(app: &AppHandle, reason: CheckReason) -> UpdateStatus {
    let state = app.state::<UpdateState>();
    if state.disabled {
        return state.status();
    }
    let Ok(_operation) = state.operation.try_lock() else {
        return state.status();
    };
    let should_check = state.with(|inner| {
        if !update_policy::should_check(
            inner.status.automatic,
            inner.last_check.map(|last| last.elapsed()),
            reason,
        ) {
            return false;
        }
        inner.last_check = Some(Instant::now());
        inner.status.phase = "checking";
        inner.status.error = None;
        true
    });
    if !should_check {
        return state.status();
    }
    state.wake.notify_one();
    state.emit(app);
    let candidate = match discover().await {
        Ok(value) => value,
        Err(()) => return state.fail(app, "checkFailed"),
    };
    let Some(candidate) = candidate else {
        state.with(|inner| {
            inner.update = None;
            inner.status.version = None;
            inner.status.phase = "current";
        });
        return state.emit(app);
    };
    let update = if let Some(target) = installation_target() {
        match prepare_update(app, &candidate, target).await {
            Ok(update) => Some(update),
            Err(()) => return state.fail(app, "checkFailed"),
        }
    } else {
        None
    };
    state.with(|inner| {
        inner.status.phase = "available";
        inner.status.version = Some(candidate.version);
        inner.status.installable = update.is_some();
        inner.update = update;
        inner.status.downloaded = 0;
        inner.status.total = None;
    });
    state.emit(app)
}

#[tauri::command]
pub fn set_update_automatic(app: AppHandle, enabled: bool) -> Result<UpdateStatus, String> {
    let state = app.state::<UpdateState>();
    state.with(|inner| {
        let prefs = Preferences { automatic: enabled };
        state.save_preferences(&prefs)?;
        inner.status.automatic = enabled;
        Ok::<_, String>(())
    })?;
    state.wake.notify_one();
    Ok(state.emit(&app))
}

#[tauri::command]
pub fn dismiss_update(
    app: AppHandle,
    version: String,
    presentation_id: u32,
) -> Result<UpdateStatus, String> {
    let state = app.state::<UpdateState>();
    state.with(|inner| {
        if inner.status.version.as_deref() != Some(&version)
            || inner.status.presentation_id != presentation_id
        {
            return Err("unavailable".to_owned());
        }
        inner.status.dismissed_version = Some(version);
        Ok(())
    })?;
    Ok(state.emit(&app))
}

#[tauri::command]
pub async fn install_update(app: AppHandle, version: String) -> Result<UpdateStatus, String> {
    let state = app.state::<UpdateState>();
    if state.disabled {
        return Err("unavailable".into());
    }
    let _operation = state.operation.try_lock().map_err(|_| "unavailable")?;
    let update = state
        .with(|inner| {
            if inner.status.phase != "available"
                || inner.status.version.as_deref() != Some(&version)
            {
                return None;
            }
            let update = inner.update.clone()?;
            inner.status.phase = "downloading";
            inner.status.error = None;
            inner.status.downloaded = 0;
            inner.status.total = None;
            Some(update)
        })
        .ok_or("unavailable")?;
    state.emit(&app);
    let bytes = match download_verified(&app, &update).await {
        Ok(bytes) => bytes,
        Err(()) => return Ok(state.fail(&app, "downloadFailed")),
    };
    // The bounded downloader verifies minisign BEFORE replacement or execution.
    state.with(|inner| inner.status.phase = "installing");
    state.emit(&app);
    let result = tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        {
            let executable = std::env::current_exe().map_err(|_| ())?;
            let bundle = crate::macos_update::installed_bundle(&executable).ok_or(())?;
            crate::macos_update::install(&bytes, &bundle, &version).map_err(|_| ())
        }
        #[cfg(not(target_os = "macos"))]
        {
            update.install(bytes).map_err(|_| ())
        }
    })
    .await;
    if !matches!(result, Ok(Ok(()))) {
        return Ok(state.fail(&app, "installFailed"));
    }
    state.with(|inner| inner.status.phase = "installed");
    let _status = state.emit(&app);
    // Windows exits via its native installer; macOS/AppImage need a relaunch.
    #[cfg(not(target_os = "windows"))]
    app.restart();
    #[allow(unreachable_code)]
    Ok(_status)
}

#[tauri::command]
pub async fn open_update_release(app: AppHandle) -> Result<(), String> {
    let version = app
        .state::<UpdateState>()
        .status()
        .version
        .ok_or("unavailable")?;
    let url = update_policy::release_url(&version).ok_or("unavailable")?;
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        let mut command = std::process::Command::new("/usr/bin/open");
        #[cfg(target_os = "linux")]
        let mut command = std::process::Command::new("xdg-open");
        #[cfg(target_os = "windows")]
        let mut command = {
            use std::os::windows::process::CommandExt;
            let windows = std::env::var_os("WINDIR").ok_or("unavailable")?;
            let mut command =
                std::process::Command::new(PathBuf::from(windows).join("System32/rundll32.exe"));
            command
                .arg("url.dll,FileProtocolHandler")
                .creation_flags(0x08000000);
            command
        };
        command
            .arg(url)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|_| "unavailable")?
            .wait()
            .map_err(|_| "unavailable")?;
        Ok::<_, &str>(())
    })
    .await
    .map_err(|_| "unavailable")?
    .map_err(str::to_owned)
}

pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Foreground opens check immediately. This fallback also covers startup
        // hidden in the tray, without depending on a WebView timer.
        tokio::time::sleep(Duration::from_secs(2)).await;
        let state = app.state::<UpdateState>();
        if state.disabled {
            return;
        }
        loop {
            check_native(&app, CheckReason::Background).await;
            let delay = state.with(|inner| {
                update_policy::next_check_delay(
                    inner.status.automatic,
                    inner.last_check.map(|time| time.elapsed()),
                )
            });
            match delay {
                Some(delay) => {
                    // A held install/check lock may defer work; avoid a hot loop.
                    tokio::select! {
                        _ = tokio::time::sleep(delay.max(Duration::from_secs(1))) => {},
                        _ = state.wake.notified() => {},
                    }
                }
                None => state.wake.notified().await,
            }
        }
    });
}
