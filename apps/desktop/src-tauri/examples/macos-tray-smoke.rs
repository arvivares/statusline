//! Manual native probe: blank test views, no agents, relay or user settings.
//! Uses the patched tray dependency and production visibility policy. Auto-exits
//! after 60 seconds. Emits only its own click/menu/visibility state as JSON.
#[cfg(target_os = "macos")]
#[allow(dead_code)]
#[path = "../src/window_behavior.rs"]
mod window_behavior;

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("This native tray probe requires macOS.");
    std::process::exit(77);
}

#[cfg(target_os = "macos")]
fn main() {
    use std::sync::{Arc, Mutex};
    use tauri::{
        Manager, WindowEvent,
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };
    use tauri_plugin_positioner::{Position, WindowExt};
    use window_behavior::{BLUR_DELAY, WindowBehavior};

    let behavior = Arc::new(Mutex::new(WindowBehavior::default()));
    let window_behavior = behavior.clone();
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = "io.inmerzion.statusline.tray-probe".into();
    context.config_mut().app.windows.clear();

    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .on_window_event(move |window, event| {
            if window.label() != "probe" { return; }
            if let WindowEvent::Focused(focused) = event {
                if *focused {
                    window_behavior.lock().unwrap().cancel_pending();
                } else if let Some(token) = window_behavior.lock().unwrap().request_blur() {
                    let window = window.clone();
                    let behavior = window_behavior.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(BLUR_DELAY);
                        let app = window.app_handle().clone();
                        app.run_on_main_thread(move || {
                            if behavior.lock().unwrap().should_hide(token, window.is_visible().unwrap(), window.is_focused().unwrap()) {
                                window.hide().unwrap();
                                println!("{{\"event\":\"outside-hide\",\"visible\":false}}");
                            }
                        }).unwrap();
                    });
                }
            }
        })
        .setup(move |app| {
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let window = tauri::WebviewWindowBuilder::new(app, "probe", tauri::WebviewUrl::External("about:blank".parse()?))
                .title("Statusline tray test")
                .inner_size(280.0, 160.0).visible(false).always_on_top(true).build()?;
            // Clicking this second, empty diagnostic window tests focus loss
            // without interacting with another application or the user's data.
            tauri::WebviewWindowBuilder::new(app, "outside", tauri::WebviewUrl::External("about:blank".parse()?))
                .title("Statusline tray test — outside")
                .position(60.0, 180.0).inner_size(240.0, 120.0).build()?;
            let action = MenuItem::with_id(app, "action", "Test menu action", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "End diagnostic", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&action, &quit])?;
            let menu_update = menu.clone();
            let tray = TrayIconBuilder::with_id("statusline-tray-probe")
                .title("SL Test").menu(&menu).show_menu_on_left_click(false)
                .on_menu_event(move |app, event| {
                    if event.id.as_ref() == "quit" { app.exit(0); return; }
                    // Exercise replacing the menu while handling an action.
                    app.tray_by_id("statusline-tray-probe").unwrap().set_menu(Some(menu_update.clone())).unwrap();
                    println!("{{\"event\":\"menu-action\"}}");
                })
                .on_tray_icon_event(move |tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    let mut state = behavior.lock().unwrap();
                    match event {
                        TrayIconEvent::Enter { .. } | TrayIconEvent::Move { .. } => state.set_tray_hovered(true),
                        TrayIconEvent::Leave { .. } => state.set_tray_hovered(false),
                        TrayIconEvent::Click { button, button_state, .. } => {
                            state.set_tray_pressed(button_state == MouseButtonState::Down);
                            let next = if button == MouseButton::Left && button_state == MouseButtonState::Up {
                                state.toggle_visibility(window.is_visible().unwrap())
                            } else { None };
                            // Focus callbacks may re-enter the policy: release
                            // its lock before asking AppKit to show/focus/hide.
                            drop(state);
                                match next {
                                    Some(true) => { let _ = window.as_ref().window().move_window(Position::TrayCenter); window.show().unwrap(); window.set_focus().unwrap(); },
                                    Some(false) => window.hide().unwrap(),
                                    None => {}
                                }
                            println!("{}", serde_json::json!({"event":"click","button":format!("{button:?}"),"state":format!("{button_state:?}"),"visible":window.is_visible().unwrap()}));
                        }
                        _ => {}
                    }
                }).build(app)?;
            let native_item = tray.with_inner_tray_icon(|inner| inner.ns_status_item().is_some())?;
            assert!(native_item, "native status item must exist");
            let app = app.handle().clone();
            std::thread::spawn(move || {
                // AppKit assigns the status item's rectangle after setup.
                std::thread::sleep(std::time::Duration::from_secs(1));
                let observer = app.clone();
                app.run_on_main_thread(move || {
                    println!("{}", serde_json::json!({"event":"ready","pid":std::process::id(),"rect":tray.rect().unwrap(),"scale":observer.get_webview_window("probe").unwrap().scale_factor().unwrap()}));
                }).unwrap();
                std::thread::sleep(std::time::Duration::from_secs(59)); app.exit(0);
            });
            Ok(())
        })
        .run(context)
        .expect("native tray probe failed");
}
