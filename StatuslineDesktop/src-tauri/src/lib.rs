pub mod app_server;
pub mod codex_installation;
pub mod relay_protocol;
pub mod universal_relay;
pub mod usage;

use tauri::{
    AppHandle, Emitter, Manager, State, WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_positioner::{Position, WindowExt};
use tokio::sync::Mutex;

use codex_installation::CodexDiagnostic;
use universal_relay::{RelayStatus, UniversalRelayState};
use usage::UsageResponse;

const TRAY_ID: &str = "statusline-companion-tray";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum WindowVisibility {
    Hidden,
    Visible,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum WindowInteraction {
    FocusLost,
    TrayClick,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum BlurPolicy {
    Hide,
    Preserve,
}

const BLUR_POLICY: BlurPolicy = if cfg!(target_os = "linux") {
    BlurPolicy::Hide
} else {
    BlurPolicy::Preserve
};

fn next_visibility(
    current: WindowVisibility,
    interaction: WindowInteraction,
    blur_policy: BlurPolicy,
) -> WindowVisibility {
    match interaction {
        WindowInteraction::FocusLost => match blur_policy {
            BlurPolicy::Hide => WindowVisibility::Hidden,
            BlurPolicy::Preserve => current,
        },
        WindowInteraction::TrayClick => match current {
            WindowVisibility::Hidden => WindowVisibility::Visible,
            WindowVisibility::Visible => WindowVisibility::Hidden,
        },
    }
}

#[derive(Default)]
struct RefreshState {
    lock: Mutex<()>,
}

#[tauri::command]
async fn refresh_usage(
    app: AppHandle,
    state: State<'_, RefreshState>,
    relay: State<'_, UniversalRelayState>,
) -> Result<UsageResponse, String> {
    let _refresh_guard = state.lock.lock().await;
    let settings_directory = app.path().app_config_dir().ok();
    let response =
        app_server::fetch_usage(env!("CARGO_PKG_VERSION"), settings_directory.as_deref()).await;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(response.tray_tooltip()));
    }
    let relay_status = relay.publish_usage(&response).await;
    let _ = app.emit("relay-status-changed", relay_status);
    Ok(response)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_positioner::init())
        .manage(RefreshState::default())
        .manage(UniversalRelayState::default())
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "Mostrar", true, None::<&str>)?;
            let refresh_item = MenuItem::with_id(app, "refresh", "Actualizar", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &refresh_item, &quit_item])?;
            let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Statusline Companion · cargando…")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "refresh" => {
                        let _ = app.emit("usage-refresh-requested", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        handle_window_interaction(tray.app_handle(), WindowInteraction::TrayClick);
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            tray_builder.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                WindowEvent::Focused(false) => {
                    handle_window_interaction(window.app_handle(), WindowInteraction::FocusLost);
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            refresh_usage,
            relay_status,
            create_relay_pairing,
            disconnect_relay,
            inspect_codex,
            set_codex_path,
            clear_codex_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let native_window = window.as_ref().window();
    if native_window.move_window(Position::TrayCenter).is_err() {
        let _ = native_window.move_window(Position::BottomRight);
    }
    let _ = window.show();
    let _ = window.set_focus();
}

fn handle_window_interaction(app: &AppHandle, interaction: WindowInteraction) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let Ok(is_visible) = window.is_visible() else {
        return;
    };
    let current = if is_visible {
        WindowVisibility::Visible
    } else {
        WindowVisibility::Hidden
    };

    match next_visibility(current, interaction, BLUR_POLICY) {
        next if next == current => {}
        WindowVisibility::Hidden => {
            let _ = window.hide();
        }
        WindowVisibility::Visible => show_main_window(app),
    }
}

#[cfg(test)]
mod tray_interaction_tests {
    use super::{BlurPolicy, WindowInteraction, WindowVisibility, next_visibility};

    #[test]
    fn second_tray_click_should_hide_after_focus_loss() {
        let after_first_click = next_visibility(
            WindowVisibility::Hidden,
            WindowInteraction::TrayClick,
            BlurPolicy::Preserve,
        );
        let after_focus_loss = next_visibility(
            after_first_click,
            WindowInteraction::FocusLost,
            BlurPolicy::Preserve,
        );
        let after_second_click = next_visibility(
            after_focus_loss,
            WindowInteraction::TrayClick,
            BlurPolicy::Preserve,
        );

        assert_eq!(
            (after_first_click, after_focus_loss, after_second_click),
            (
                WindowVisibility::Visible,
                WindowVisibility::Visible,
                WindowVisibility::Hidden,
            )
        );
    }

    #[test]
    fn focus_loss_should_hide_when_blur_policy_requires_it() {
        let visibility = next_visibility(
            WindowVisibility::Visible,
            WindowInteraction::FocusLost,
            BlurPolicy::Hide,
        );

        assert_eq!(visibility, WindowVisibility::Hidden);
    }
}
