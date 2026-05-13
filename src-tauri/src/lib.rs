use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

struct SidecarHandle(Mutex<Option<Child>>);

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(SidecarHandle(Mutex::new(None)))
        .setup(|app| {
            let state = app.state::<SidecarHandle>();
            *state.0.lock().unwrap() = spawn_sidecar();
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<SidecarHandle>();
                let child = state.0.lock().unwrap().take();
                if let Some(mut child) = child {
                    child.kill().ok();
                    eprintln!("[RAGdoll] Sidecar process killed");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
