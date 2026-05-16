mod capture;
mod packet;

use capture::CaptureState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NetworkInterface {
    pub index: u32,
    pub name: String,
    pub ipv4: String,
    pub is_loopback: bool,
}

#[tauri::command]
fn list_interfaces() -> Result<Vec<NetworkInterface>, String> {
    capture::list_interfaces().map_err(|e| e.to_string())
}

#[tauri::command]
fn start_capture(
    app: AppHandle,
    state: State<CaptureState>,
    ipv4: String,
) -> Result<(), String> {
    capture::start_capture(app, state, ipv4)
}

#[tauri::command]
fn stop_capture(state: State<CaptureState>) -> Result<(), String> {
    capture::stop_capture(state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(CaptureState::default())
        .invoke_handler(tauri::generate_handler![
            list_interfaces,
            start_capture,
            stop_capture,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
