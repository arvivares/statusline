pub mod app_server;
pub mod codex_installation;
pub mod localization;
#[cfg(target_os = "macos")]
mod macos_update;
pub mod refresh;
pub mod relay_protocol;
pub mod universal_relay;
pub mod update_policy;
mod update_signature;
#[cfg(target_os = "macos")]
mod update_transaction;
mod updates;
pub mod usage;
pub mod window_behavior;

#[cfg(any(target_os = "linux", test))]
mod frontend_smoke;

use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::Duration,
};

use refresh::{FOCUS_REFRESH_AGE, RefreshCoordinator, refresh_interval};
#[cfg(target_os = "windows")]
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    AppHandle, Emitter, Manager, State, WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_positioner::{Position, WindowExt};
use window_behavior::{BLUR_DELAY, WindowBehavior};

use codex_installation::CodexDiagnostic;
use universal_relay::{RelayStatus, UniversalRelayState};
use usage::UsageResponse;

const TRAY_ID: &str = "statusline-companion-tray";

// The menu bar uses a transparent template; app, Dock and installer icons stay gold.
#[cfg(target_os = "macos")]
const MACOS_TRAY_TEMPLATE: tauri::image::Image<'static> =
    tauri::include_image!("./icons/tray-template@2x.png");

struct LocalizedMenu {
    show: MenuItem<tauri::Wry>,
    refresh: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
    updates: MenuItem<tauri::Wry>,
}

fn set_update_menu_label(app: &AppHandle, version: Option<&str>) {
    let Some(menu) = app.try_state::<LocalizedMenu>() else {
        return;
    };
    let label = match version {
        Some(version) => format!("{} · {version}", localization::text("Update available")),
        None => localization::text("Check for updates").to_owned(),
    };
    let _ = menu.updates.set_text(label);
}

#[tauri::command]
fn system_language(app: AppHandle, menu: State<'_, LocalizedMenu>) -> &'static str {
    let _ = menu.show.set_text(localization::text("Show"));
    let _ = menu.refresh.set_text(localization::text("Refresh"));
    let _ = menu.quit.set_text(localization::text("Quit"));
    set_update_menu_label(
        &app,
        updates::updater_status(app.state()).version.as_deref(),
    );
    localization::language()
}

#[cfg(target_os = "windows")]
static INITIAL_WINDOW_ACTIVATED: AtomicBool = AtomicBool::new(false);
static WINDOW_READY_MARKER: OnceLock<PathBuf> = OnceLock::new();

pub fn write_codex_diagnostic(output_path: &Path) -> Result<(), String> {
    let diagnostic = tauri::async_runtime::block_on(codex_installation::inspect_codex(None))
        .map_err(|error| error.to_string())?;
    let encoded = serde_json::to_vec_pretty(&diagnostic).map_err(|error| error.to_string())?;
    fs::write(output_path, encoded).map_err(|error| error.to_string())
}

pub fn set_window_ready_marker(output_path: PathBuf) -> Result<(), PathBuf> {
    WINDOW_READY_MARKER.set(output_path)
}

#[derive(Default)]
struct WindowBehaviorState(Mutex<WindowBehavior>);

fn with_window_behavior<T>(app: &AppHandle, action: impl FnOnce(&mut WindowBehavior) -> T) -> T {
    let state = app.state::<WindowBehaviorState>();
    let mut behavior = state.0.lock().unwrap_or_else(|error| error.into_inner());
    action(&mut behavior)
}

// The native callback owns this guard, not the WebView's promise lifecycle.
// Cancellation, selection and a dropped callback all restore blur handling.
struct NativeDialogGuard(AppHandle);

impl Drop for NativeDialogGuard {
    fn drop(&mut self) {
        with_window_behavior(&self.0, WindowBehavior::end_dialog);
        schedule_blur_hide(&self.0);
    }
}

#[tauri::command]
async fn choose_codex_executable(
    app: AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Option<String>, String> {
    if window.label() != "main" || !with_window_behavior(&app, WindowBehavior::begin_dialog) {
        return Err(localization::text("Could not open file picker").to_owned());
    }
    let guard = NativeDialogGuard(app.clone());
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_parent(&window)
        .set_title(localization::text("Select a Codex executable or macOS app"))
        .pick_file(move |selection| {
            let result = selection
                .map(|file| {
                    file.into_path()
                        .map(|path| path.to_string_lossy().into_owned())
                        .map_err(|_| localization::text("Could not open file picker").to_owned())
                })
                .transpose();
            drop(guard);
            let _ = sender.send(result);
        });
    receiver
        .await
        .map_err(|_| localization::text("Could not open file picker").to_owned())?
}

type RefreshState = RefreshCoordinator<UsageResponse>;

#[tauri::command]
async fn refresh_usage(app: AppHandle) -> Result<UsageResponse, String> {
    Ok(refresh_native(&app, Duration::ZERO).await)
}

#[tauri::command]
async fn current_usage(app: AppHandle) -> Result<UsageResponse, String> {
    Ok(refresh_native(&app, FOCUS_REFRESH_AGE).await)
}

async fn refresh_native(app: &AppHandle, minimum_age: Duration) -> UsageResponse {
    app.state::<RefreshState>()
        .refresh(minimum_age, || async {
            let settings_directory = app.path().app_config_dir().ok();
            let response =
                app_server::fetch_usage(env!("CARGO_PKG_VERSION"), settings_directory.as_deref())
                    .await;
            if let Some(tray) = app.tray_by_id(TRAY_ID) {
                let _ = tray.set_tooltip(Some(response.tray_tooltip()));
            }
            let relay_status = app
                .state::<UniversalRelayState>()
                .publish_usage(&response)
                .await;
            let _ = app.emit("relay-status-changed", relay_status);
            let _ = app.emit("usage-updated", &response);
            response
        })
        .await
}

#[tauri::command]
async fn relay_status(state: State<'_, UniversalRelayState>) -> Result<RelayStatus, String> {
    Ok(state.current_status().await)
}

#[tauri::command]
async fn create_relay_pairing(
    app: AppHandle,
    state: State<'_, UniversalRelayState>,
) -> Result<RelayStatus, String> {
    let status = state.create_pairing().await;
    let _ = app.emit("relay-status-changed", status.clone());
    Ok(status)
}

#[tauri::command]
async fn disconnect_relay(
    app: AppHandle,
    state: State<'_, UniversalRelayState>,
) -> Result<RelayStatus, String> {
    let status = state.disconnect().await;
    let _ = app.emit("relay-status-changed", status.clone());
    Ok(status)
}

#[tauri::command]
async fn inspect_codex(app: AppHandle) -> Result<CodexDiagnostic, String> {
    let settings_directory = app.path().app_config_dir().ok();
    codex_installation::inspect_codex(settings_directory.as_deref())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_codex_path(app: AppHandle, path: String) -> Result<CodexDiagnostic, String> {
    let settings_directory = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    codex_installation::save_codex_path(&settings_directory, &path)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn clear_codex_path(app: AppHandle) -> Result<CodexDiagnostic, String> {
    let settings_directory = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    codex_installation::clear_codex_path(&settings_directory)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn frontend_ready(app: AppHandle) {
    if app
        .get_webview_window("main")
        .is_some_and(|window| window.is_visible().unwrap_or(false))
    {
        updates::window_opened(&app);
    }
    #[cfg(target_os = "windows")]
    schedule_initial_window_activation(app);

    // The Linux smoke test must observe a round trip from the initialized
    // frontend, not merely the survival of the GTK parent process. This is not
    // a substitute for real-GPU rendering and interaction tests.
    #[cfg(target_os = "linux")]
    if app.get_webview_window("main").is_some() {
        if let Some(path) = WINDOW_READY_MARKER.get() {
            let _ = frontend_smoke::write_ready_marker(path);
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    let _ = app;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(RefreshState::default())
        .manage(WindowBehaviorState::default())
        .manage(UniversalRelayState::default())
        .setup(|app| {
            // Diagnostic/smoke runs must never access the update feed.
            let updates_disabled = cfg!(debug_assertions)
                || WINDOW_READY_MARKER.get().is_some()
                || std::env::var_os("STATUSLINE_DISABLE_UPDATES").is_some();
            app.manage(updates::UpdateState::new(
                app.path().app_config_dir().ok(),
                updates_disabled,
            ));
            #[cfg(target_os = "macos")]
            app.handle()
                .set_activation_policy(tauri::ActivationPolicy::Accessory)?;

            let show_item =
                MenuItem::with_id(app, "show", localization::text("Show"), true, None::<&str>)?;
            let refresh_item = MenuItem::with_id(
                app,
                "refresh",
                localization::text("Refresh"),
                true,
                None::<&str>,
            )?;
            let quit_item =
                MenuItem::with_id(app, "quit", localization::text("Quit"), true, None::<&str>)?;
            let updates_item = MenuItem::with_id(
                app,
                "updates",
                localization::text("Check for updates"),
                true,
                None::<&str>,
            )?;
            let menu =
                Menu::with_items(app, &[&show_item, &refresh_item, &updates_item, &quit_item])?;
            app.manage(LocalizedMenu {
                show: show_item,
                refresh: refresh_item,
                quit: quit_item,
                updates: updates_item,
            });
            let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip(localization::text("Statusline Companion · loading…"))
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "refresh" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            refresh_native(&app, Duration::ZERO).await;
                        });
                    }
                    "quit" => app.exit(0),
                    "updates" => {
                        show_main_window(app);
                        let _ = app.emit("updater-open", ());
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    match event {
                        TrayIconEvent::Enter { .. } | TrayIconEvent::Move { .. } => {
                            with_window_behavior(tray.app_handle(), |behavior| {
                                behavior.set_tray_hovered(true)
                            });
                        }
                        TrayIconEvent::Leave { .. } => {
                            with_window_behavior(tray.app_handle(), |behavior| {
                                behavior.set_tray_hovered(false)
                            });
                            schedule_blur_hide(tray.app_handle());
                        }
                        TrayIconEvent::Click {
                            button_state: MouseButtonState::Down,
                            ..
                        } => {
                            with_window_behavior(tray.app_handle(), |behavior| {
                                behavior.set_tray_pressed(true)
                            });
                        }
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } => {
                            with_window_behavior(tray.app_handle(), |behavior| {
                                behavior.set_tray_pressed(false)
                            });
                            toggle_main_window(tray.app_handle());
                        }
                        TrayIconEvent::Click {
                            button_state: MouseButtonState::Up,
                            ..
                        } => {
                            with_window_behavior(tray.app_handle(), |behavior| {
                                behavior.set_tray_pressed(false)
                            });
                        }
                        _ => {}
                    }
                });
            #[cfg(target_os = "macos")]
            {
                tray_builder = tray_builder
                    .icon(MACOS_TRAY_TEMPLATE)
                    .icon_as_template(true);
            }
            #[cfg(not(target_os = "macos"))]
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            tray_builder.build(app)?;
            updates::start(app.handle());
            let refresh_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = refresh_interval();
                loop {
                    interval.tick().await;
                    refresh_native(&refresh_app, Duration::ZERO).await;
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    hide_main_window(window.app_handle());
                }
                WindowEvent::Focused(false) => {
                    schedule_blur_hide(window.app_handle());
                }
                WindowEvent::Focused(true) => {
                    with_window_behavior(window.app_handle(), WindowBehavior::cancel_pending);
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            refresh_usage,
            current_usage,
            relay_status,
            create_relay_pairing,
            disconnect_relay,
            inspect_codex,
            set_codex_path,
            clear_codex_path,
            choose_codex_executable,
            system_language,
            frontend_ready,
            updates::updater_status,
            updates::check_for_updates,
            updates::install_update,
            updates::set_update_automatic,
            updates::dismiss_update,
            updates::open_update_release
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(target_os = "windows")]
fn schedule_initial_window_activation(app: AppHandle) {
    if INITIAL_WINDOW_ACTIVATED
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return;
    }

    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(150)).await;
        let app_for_window = app.clone();
        let marker = WINDOW_READY_MARKER.get().cloned();
        if app
            .run_on_main_thread(move || {
                show_main_window(&app_for_window);
                if let Some(path) = marker {
                    let _ = fs::write(path, b"ready\n");
                }
            })
            .is_err()
        {
            INITIAL_WINDOW_ACTIVATED.store(false, Ordering::Release);
        }
    });
}

fn show_main_window(app: &AppHandle) {
    with_window_behavior(app, WindowBehavior::cancel_pending);
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let was_visible = window.is_visible().unwrap_or(true);
    let native_window = window.as_ref().window();
    if native_window.move_window(Position::TrayCenter).is_err() {
        let _ = native_window.move_window(Position::BottomRight);
    }
    let _ = window.unminimize();
    let shown = window.show().is_ok();
    let _ = window.set_focus();
    if shown && !was_visible {
        updates::window_opened(app);
    }
}

fn hide_main_window(app: &AppHandle) {
    let allowed = with_window_behavior(app, |behavior| {
        behavior.cancel_pending();
        behavior.can_explicitly_hide()
    });
    if allowed && let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let Ok(is_visible) = window.is_visible() else {
        return;
    };
    match with_window_behavior(app, |behavior| behavior.toggle_visibility(is_visible)) {
        Some(false) => hide_main_window(app),
        Some(true) => show_main_window(app),
        None => {}
    }
}

fn schedule_blur_hide(app: &AppHandle) {
    let Some(token) = with_window_behavior(app, WindowBehavior::request_blur) else {
        return;
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(BLUR_DELAY).await;
        let app_for_window = app.clone();
        // Visibility/focus are rechecked on the UI thread, after any focus or
        // tray event that may have invalidated this delayed request.
        let _ = app.run_on_main_thread(move || {
            let Some(window) = app_for_window.get_webview_window("main") else {
                return;
            };
            let (Ok(visible), Ok(focused)) = (window.is_visible(), window.is_focused()) else {
                return;
            };
            if with_window_behavior(&app_for_window, |behavior| {
                behavior.should_hide(token, visible, focused)
            }) {
                hide_main_window(&app_for_window);
            }
        });
    });
}

#[cfg(test)]
mod tray_interaction_tests {

    #[cfg(target_os = "macos")]
    #[test]
    fn menu_bar_template_has_a_black_mark_and_transparent_canvas() {
        let icon = super::MACOS_TRAY_TEMPLATE;
        assert_eq!((icon.width(), icon.height()), (44, 44));

        let mut visible_pixels = 0;
        for pixel in icon.rgba().chunks_exact(4) {
            if pixel[3] > 0 {
                assert_eq!(&pixel[..3], &[0, 0, 0]);
                visible_pixels += 1;
            }
        }

        assert!(icon.rgba().chunks_exact(4).any(|pixel| pixel[3] == 255));
        // Reject an opaque app-icon backplate: only the segmented S is a mask.
        assert!(visible_pixels > 0 && visible_pixels < (44 * 44) / 2);
        assert_eq!(&icon.rgba()[..4], &[0, 0, 0, 0]);
    }
}
