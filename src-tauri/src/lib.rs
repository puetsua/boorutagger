mod config;
mod dataset;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use config::{load_user_config, save_user_config};
use dataset::{check_caption_path, path_changes_dataset, rename_image, scan_folder, write_caption_file, RenamedImage, ScanResult};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, State};

struct OpenFolder {
    path: Mutex<Option<PathBuf>>,
    watch: Mutex<Option<RecommendedWatcher>>,
    quiet_captions: Arc<Mutex<HashMap<String, Instant>>>,
}

#[derive(Deserialize)]
struct CaptionWrite {
    path: String,
    text: String,
}

fn caption_key(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\").to_ascii_lowercase()
}

fn watch_folder(
    app: AppHandle,
    folder: &Path,
    folder_name: String,
    quiet_captions: Arc<Mutex<HashMap<String, Instant>>>,
) -> Result<RecommendedWatcher, String> {
    let (tx, rx) = mpsc::channel();
    let mut watcher = notify::recommended_watcher(move |result: Result<Event, notify::Error>| {
        let Ok(event) = result else { return };
        if matches!(event.kind, EventKind::Access(_)) {
            return;
        }
        let quiet = quiet_captions.lock().ok();
        let changed = event.need_rescan()
            || event.paths.iter().any(|path| {
                path_changes_dataset(path)
                    && quiet
                        .as_ref()
                        .is_none_or(|paths| !paths.contains_key(&caption_key(path)))
            });
        if changed {
            let _ = tx.send(());
        }
    })
    .map_err(|err| format!("Could not watch the folder. {err}"))?;
    watcher
        .watch(folder, RecursiveMode::Recursive)
        .map_err(|err| format!("Could not watch the folder. {err}"))?;

    std::thread::spawn(move || {
        while rx.recv().is_ok() {
            std::thread::sleep(Duration::from_millis(400));
            while rx.try_recv().is_ok() {}
            let _ = app.emit("dataset-changed", &folder_name);
        }
    });
    Ok(watcher)
}

#[tauri::command]
fn scan_dataset(app: AppHandle, state: State<OpenFolder>, folder: String) -> Result<ScanResult, String> {
    let path = PathBuf::from(&folder);
    if !path.is_dir() {
        return Err("That folder is not available.".into());
    }
    app.asset_protocol_scope()
        .allow_directory(&path, true)
        .map_err(|err| format!("Could not show images from that folder. {err}"))?;
    let scan = scan_folder(&path)?;
    let changed = {
        let mut open = state
            .path
            .lock()
            .map_err(|_| "Could not remember the open folder.".to_string())?;
        let changed = open.as_ref() != Some(&path);
        *open = Some(path.clone());
        changed
    };
    let watching = state
        .watch
        .lock()
        .map_err(|_| "Could not watch the folder.".to_string())?
        .is_some();
    if changed || !watching {
        if let Ok(watcher) = watch_folder(app, &path, folder, Arc::clone(&state.quiet_captions)) {
            *state
                .watch
                .lock()
                .map_err(|_| "Could not watch the folder.".to_string())? = Some(watcher);
        }
    }
    Ok(scan)
}

#[tauri::command]
fn rename_dataset_image(
    state: State<OpenFolder>,
    path: String,
    file_name: String,
) -> Result<RenamedImage, String> {
    let folder = {
        let guard = state
            .path
            .lock()
            .map_err(|_| "Could not check the open folder.".to_string())?;
        guard
            .clone()
            .ok_or_else(|| "Open a folder first.".to_string())?
    };
    rename_image(&folder, Path::new(&path), &file_name)
}

#[tauri::command]
fn write_captions(state: State<OpenFolder>, items: Vec<CaptionWrite>) -> Result<(), String> {
    let folder = {
        let guard = state
            .path
            .lock()
            .map_err(|_| "Could not check the open folder.".to_string())?;
        guard
            .clone()
            .ok_or_else(|| "Open a folder first.".to_string())?
    };
    let now = Instant::now();
    let mut quiet = state
        .quiet_captions
        .lock()
        .map_err(|_| "Could not check the open folder.".to_string())?;
    quiet.retain(|_, at| now.duration_since(*at) < Duration::from_secs(2));
    for item in items {
        let path = PathBuf::from(&item.path);
        check_caption_path(&folder, &path)?;
        quiet.insert(caption_key(&path), now);
        write_caption_file(&path, &item.text)?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .manage(OpenFolder {
            path: Mutex::new(None),
            watch: Mutex::new(None),
            quiet_captions: Arc::new(Mutex::new(HashMap::new())),
        })
        .invoke_handler(tauri::generate_handler![
            scan_dataset,
            rename_dataset_image,
            write_captions,
            load_user_config,
            save_user_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
