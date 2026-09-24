mod dataset;

use std::path::PathBuf;
use std::sync::Mutex;

use dataset::{check_caption_path, scan_folder, write_caption_file, ScanResult};
use serde::Deserialize;
use tauri::{AppHandle, Manager, State};

struct OpenFolder(Mutex<Option<PathBuf>>);

#[derive(Deserialize)]
struct CaptionWrite {
    path: String,
    text: String,
}

#[tauri::command]
fn scan_dataset(app: AppHandle, state: State<OpenFolder>, folder: String) -> Result<ScanResult, String> {
    let path = PathBuf::from(&folder);
    if !path.is_dir() {
        return Err("That folder is not available.".into());
    }
    app.asset_protocol_scope()
        .allow_directory(&path, false)
        .map_err(|err| format!("Could not show images from that folder. {err}"))?;
    let scan = scan_folder(&path)?;
    *state
        .0
        .lock()
        .map_err(|_| "Could not remember the open folder.".to_string())? = Some(path);
    Ok(scan)
}

#[tauri::command]
fn write_captions(state: State<OpenFolder>, items: Vec<CaptionWrite>) -> Result<(), String> {
    let folder = {
        let guard = state
            .0
            .lock()
            .map_err(|_| "Could not check the open folder.".to_string())?;
        guard
            .clone()
            .ok_or_else(|| "Open a folder first.".to_string())?
    };
    for item in items {
        let path = PathBuf::from(&item.path);
        check_caption_path(&folder, &path)?;
        write_caption_file(&path, &item.text)?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(OpenFolder(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![scan_dataset, write_captions])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
