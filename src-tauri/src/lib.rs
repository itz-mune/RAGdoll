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

/// Dev build: run directly via `uv run python main.py` from sidecar-src.
#[cfg(debug_assertions)]
fn spawn_sidecar() -> Option<Child> {
    // sidecar source now lives inside src-tauri/sidecar-src/ (same repo)
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let sidecar_dir = manifest_dir.join("sidecar-src");

    // ragdoll.config.json is two levels up (repo root). Pass the absolute path
    // so config.py can find it regardless of working directory.
    let config_path = manifest_dir
        .parent()
        .map(|r| r.join("ragdoll.config.json"))
        .unwrap_or_default();

    Command::new("uv")
        .args(["run", "python", "main.py"])
        .current_dir(&sidecar_dir)
        .env("RAGDOLL_CONFIG_PATH", &config_path)
        .spawn()
        .inspect_err(|e| eprintln!("[RAGdoll] Failed to spawn sidecar: {e}"))
        .ok()
}

/// Release build: sync a venv via the bundled uv binary then run main.py.
/// Runs entirely in a background thread so the Tauri window opens immediately.
/// The frontend health-check polls /health until the sidecar is ready.
#[cfg(not(debug_assertions))]
fn spawn_sidecar_bg(app_handle: AppHandle) {
    std::thread::spawn(move || {
        match do_spawn_sidecar(&app_handle) {
            Some(child) => {
                let state = app_handle.state::<SidecarHandle>();
                *state.0.lock().unwrap() = Some(child);
                eprintln!("[RAGdoll] Sidecar process started");
            }
            None => eprintln!("[RAGdoll] Sidecar failed to start"),
        }
    });
}

#[cfg(not(debug_assertions))]
fn do_spawn_sidecar(app_handle: &AppHandle) -> Option<Child> {
    // ── Paths ─────────────────────────────────────────────────────────────────
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();

    // uv binary placed next to the main exe by Tauri's externalBin bundler
    let uv = exe_dir.join(if cfg!(target_os = "windows") {
        "uv.exe"
    } else {
        "uv"
    });

    // Sidecar Python source — bundled as Tauri resources.
    // resource_dir() handles platform differences (macOS app bundle etc.)
    let resource_dir = app_handle
        .path()
        .resource_dir()
        .inspect_err(|e| eprintln!("[RAGdoll] resource_dir error: {e}"))
        .ok()?;
    let sidecar_src = resource_dir.join("sidecar-src");

    // ── Writable data directory ───────────────────────────────────────────────
    // Holds the venv, downloaded Python, plugins, LanceDB data.
    #[cfg(target_os = "windows")]
    let app_data = std::path::PathBuf::from(
        std::env::var("LOCALAPPDATA").unwrap_or_default(),
    )
    .join("RAGdoll");

    #[cfg(not(target_os = "windows"))]
    let app_data = std::path::PathBuf::from(
        std::env::var("HOME").unwrap_or_default(),
    )
    .join(".ragdoll");

    if let Err(e) = std::fs::create_dir_all(&app_data) {
        eprintln!("[RAGdoll] mkdir app_data failed: {e}");
    }

    // ── First-launch: seed preinstalled plugins ───────────────────────────────
    let bundled_plugins = sidecar_src.join("ragdoll_plugins");
    let data_plugins    = app_data.join("ragdoll_plugins");
    if !data_plugins.exists() && bundled_plugins.exists() {
        if let Err(e) = copy_dir_all(&bundled_plugins, &data_plugins) {
            eprintln!("[RAGdoll] Plugin seed failed: {e}");
        } else {
            eprintln!("[RAGdoll] Preinstalled plugins seeded to data dir");
        }
    }

    // ── Sync venv ─────────────────────────────────────────────────────────────
    // Fast on subsequent launches (lockfile unchanged → nothing to do).
    // Slow only on first launch: downloads Python + all runtime dependencies.
    let venv_dir   = app_data.join("venv");
    let python_dir = app_data.join("python");

    eprintln!("[RAGdoll] Running uv sync (first launch may take a few minutes)…");
    let sync_ok = Command::new(&uv)
        .args([
            "sync",
            "--frozen",
            "--project",
            sidecar_src.to_str()?,
            "--python-preference",
            "managed",
            "--python",
            "3.12",
        ])
        .env("UV_PROJECT_ENVIRONMENT",  venv_dir.to_str()?)
        .env("UV_PYTHON_INSTALL_DIR",   python_dir.to_str()?)
        .env("UV_NO_PROGRESS",          "1")
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    if !sync_ok {
        eprintln!("[RAGdoll] uv sync failed");
        return None;
    }

    // ── Launch sidecar ────────────────────────────────────────────────────────
    let python = if cfg!(target_os = "windows") {
        venv_dir.join("Scripts").join("python.exe")
    } else {
        venv_dir.join("bin").join("python")
    };

    eprintln!("[RAGdoll] Launching sidecar from {:?}", sidecar_src);
    Command::new(&python)
        .arg(sidecar_src.join("main.py"))
        .current_dir(&sidecar_src)
        .env("RAGDOLL_DATA_DIR", app_data.to_str()?)
        .spawn()
        .inspect_err(|e| eprintln!("[RAGdoll] spawn failed: {e}"))
        .ok()
}

/// Recursively copy a directory tree.
#[cfg(not(debug_assertions))]
fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ft    = entry.file_type()?;
        let dest  = dst.join(entry.file_name());
        if ft.is_dir() {
            copy_dir_all(&entry.path(), &dest)?;
        } else {
            std::fs::copy(entry.path(), &dest)?;
        }
    }
    Ok(())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Toggle the "close to tray" behaviour from the Settings UI.
#[tauri::command]
fn set_close_to_tray(state: State<CloseToTrayState>, value: bool) {
    *state.0.lock().unwrap() = value;
}

/// Update the profile label shown in the tray menu.
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
            // Dev: spawn synchronously (uv run is fast)
            #[cfg(debug_assertions)]
            {
                let state = app.state::<SidecarHandle>();
                *state.0.lock().unwrap() = spawn_sidecar();
            }
            // Release: background thread — window opens immediately while
            // uv sync runs. Frontend spinner waits up to 10 min for /health.
            #[cfg(not(debug_assertions))]
            spawn_sidecar_bg(app.handle().clone());

            tray::setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
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
                    let child = window
                        .state::<SidecarHandle>()
                        .0
                        .lock()
                        .unwrap()
                        .take();
                    if let Some(mut child) = child {
                        child.kill().ok();
                    }
                }
            }
            tauri::WindowEvent::Destroyed => {
                let child = window
                    .state::<SidecarHandle>()
                    .0
                    .lock()
                    .unwrap()
                    .take();
                if let Some(mut child) = child {
                    child.kill().ok();
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
