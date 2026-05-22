mod tray;

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

// ── Managed state ─────────────────────────────────────────────────────────────

struct SidecarHandle(Mutex<Option<Child>>);

/// Whether clicking the window's X button hides to tray (true) or quits (false).
pub struct CloseToTrayState(pub Mutex<bool>);

/// Display name of the currently-active profile — kept in sync by the frontend
/// so the tray menu always shows the right label.
pub struct ActiveProfileState(pub Mutex<String>);

// ── Sidecar spawn ─────────────────────────────────────────────────────────────

/// Dev build: run directly via `uv run python main.py` from the workspace.
#[cfg(debug_assertions)]
fn spawn_sidecar() -> Option<Child> {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let sidecar_dir = manifest_dir.parent()?.join("sidecar");

    Command::new("uv")
        .args(["run", "python", "main.py"])
        .current_dir(&sidecar_dir)
        .spawn()
        .inspect_err(|e| eprintln!("[RAGdoll] Failed to spawn sidecar: {e}"))
        .ok()
}

/// Release build: launch the bundled PyInstaller binary placed beside the exe.
#[cfg(not(debug_assertions))]
fn spawn_sidecar() -> Option<Child> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let binary = if cfg!(target_os = "windows") {
        dir.join("ragdoll-sidecar.exe")
    } else {
        dir.join("ragdoll-sidecar")
    };

    Command::new(&binary)
        .spawn()
        .inspect_err(|e| {
            eprintln!(
                "[RAGdoll] Failed to spawn bundled sidecar at {}: {e}",
                binary.display()
            )
        })
        .ok()
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Toggle the "close to tray" behaviour from the Settings UI.
#[tauri::command]
fn set_close_to_tray(state: State<CloseToTrayState>, value: bool) {
    *state.0.lock().unwrap() = value;
}

/// Update the profile label shown in the tray menu.
/// Called from profileStore.setActiveProfile() on the frontend.
#[tauri::command]
fn update_tray_profile(
    app: AppHandle,
    state: State<ActiveProfileState>,
    display_name: String,
) {
    *state.0.lock().unwrap() = display_name.clone();
    tray::rebuild_tray_menu(&app, &display_name);
}

/// Query whether the autostart entry is currently registered.
#[tauri::command]
fn get_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

/// Enable or disable launching RAGdoll on system login.
#[tauri::command]
fn set_autostart_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    if enabled {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    }
    .map_err(|e| e.to_string())
}

// ── App entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(SidecarHandle(Mutex::new(None)))
        .manage(CloseToTrayState(Mutex::new(true)))
        .manage(ActiveProfileState(Mutex::new(
            "None configured".to_string(),
        )))
        .setup(|app| {
            // Spawn Python sidecar
            let state = app.state::<SidecarHandle>();
            *state.0.lock().unwrap() = spawn_sidecar();

            // Create system tray icon + menu
            tray::setup_tray(app)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            // X button — hide to tray instead of quitting (when enabled)
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let close_to_tray = *window
                    .state::<CloseToTrayState>()
                    .0
                    .lock()
                    .unwrap();

                if close_to_tray {
                    api.prevent_close();
                    window.hide().ok();
                } else {
                    // Kill sidecar before the process exits
                    let child = window
                        .state::<SidecarHandle>()
                        .0
                        .lock()
                        .unwrap()
                        .take();
                    if let Some(mut child) = child {
                        child.kill().ok();
                        eprintln!("[RAGdoll] Sidecar process killed");
                    }
                }
            }
            // Window destroyed (e.g. quit via tray menu std::process::exit)
            tauri::WindowEvent::Destroyed => {
                let child = window
                    .state::<SidecarHandle>()
                    .0
                    .lock()
                    .unwrap()
                    .take();
                if let Some(mut child) = child {
                    child.kill().ok();
                    eprintln!("[RAGdoll] Sidecar process killed");
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            set_close_to_tray,
            update_tray_profile,
            get_autostart_enabled,
            set_autostart_enabled,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
