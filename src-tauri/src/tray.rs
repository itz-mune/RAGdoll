use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, Runtime,
};

use crate::ActiveProfileState;

pub fn setup_tray<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
    let profile_label = {
        let state = app.state::<ActiveProfileState>();
        let label = state.0.lock().unwrap().clone();
        label
    };

    let menu = build_menu(app, &profile_label)?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("RAGdoll")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_window(app),
            "new_chat" => {
                show_window(app);
                app.emit("tray:new-chat", ()).ok();
            }
            "quit" => {
                app.emit("tray:quit", ()).ok();
                std::process::exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                // app_handle() returns by value — bind before borrowing
                show_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Build a fresh tray menu with the given profile display name.
pub fn build_menu<R: Runtime>(
    manager: &impl Manager<R>,
    profile_label: &str,
) -> tauri::Result<Menu<R>> {
    let show = MenuItem::with_id(manager, "show", "Show RAGdoll", true, None::<&str>)?;
    let new_chat =
        MenuItem::with_id(manager, "new_chat", "New conversation", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(manager)?;
    let profile_item = MenuItem::with_id(
        manager,
        "profile",
        format!("Profile: {}", profile_label),
        false,
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(manager)?;
    let quit = MenuItem::with_id(manager, "quit", "Quit RAGdoll", true, None::<&str>)?;

    Menu::with_items(manager, &[&show, &new_chat, &sep1, &profile_item, &sep2, &quit])
}

/// Rebuild the tray menu with an updated profile name.
/// Takes &AppHandle specifically because tray_by_id is not on the Manager trait.
pub fn rebuild_tray_menu<R: Runtime>(app: &AppHandle<R>, profile_label: &str) {
    if let Some(tray_icon) = app.tray_by_id("main") {
        if let Ok(menu) = build_menu(app, profile_label) {
            tray_icon.set_menu(Some(menu)).ok();
        }
    }
}

/// Bring the main window to the foreground.
pub fn show_window<R: Runtime>(app: &impl Manager<R>) {
    if let Some(window) = app.get_webview_window("main") {
        window.show().ok();
        window.unminimize().ok();
        window.set_focus().ok();
    }
}
