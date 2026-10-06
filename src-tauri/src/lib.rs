mod config;
mod dataset;
mod tagger;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use config::{load_user_config, models_dir, save_user_config};
use dataset::{check_caption_path, check_image_path, path_changes_dataset, rename_image, scan_folder, write_caption_file, RenamedImage, ScanResult};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tagger::Tagger;
use tauri::{AppHandle, Emitter, Manager, State};

struct OpenFolder {
    path: Mutex<Option<PathBuf>>,
    watch: Mutex<Option<RecommendedWatcher>>,
    quiet_captions: Arc<Mutex<HashMap<String, Instant>>>,
}

struct LoadedTagger(Arc<Mutex<Option<Tagger>>>);

#[derive(Serialize)]
struct TaggerStatus {
    folder: String,
    installed: bool,
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    received: u64,
    total: u64,
}

#[derive(Deserialize)]
struct CaptionWrite {
    path: String,
    text: String,
}

fn open_folder(state: &OpenFolder) -> Result<PathBuf, String> {
    state
        .path
        .lock()
        .map_err(|_| "Could not check the open folder.".to_string())?
        .clone()
        .ok_or_else(|| "Open a folder first.".to_string())
}

fn tagger_folder(folder: Option<String>) -> Result<PathBuf, String> {
    match folder.filter(|folder| !folder.trim().is_empty()) {
        Some(folder) => Ok(PathBuf::from(folder)),
        None => Ok(models_dir()?.join(tagger::MODEL_NAME)),
    }
}

fn status_of(folder: &Path) -> TaggerStatus {
    TaggerStatus {
        folder: folder.to_string_lossy().into_owned(),
        installed: tagger::installed(folder),
    }
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
    let folder = open_folder(&state)?;
    rename_image(&folder, Path::new(&path), &file_name)
}

#[tauri::command]
fn write_captions(state: State<OpenFolder>, items: Vec<CaptionWrite>) -> Result<(), String> {
    let folder = open_folder(&state)?;
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

#[tauri::command]
fn tagger_status(folder: Option<String>) -> Result<TaggerStatus, String> {
    Ok(status_of(&tagger_folder(folder)?))
}

#[tauri::command]
async fn download_tagger(app: AppHandle, folder: Option<String>) -> Result<TaggerStatus, String> {
    let folder = tagger_folder(folder)?;
    tauri::async_runtime::spawn_blocking(move || {
        tagger::download(&folder, |received, total| {
            let _ = app.emit("tagger-progress", DownloadProgress { received, total });
        })?;
        Ok(status_of(&folder))
    })
    .await
    .map_err(|err| format!("The download stopped. {err}"))?
}

#[tauri::command]
async fn suggest_tags(
    state: State<'_, OpenFolder>,
    loaded: State<'_, LoadedTagger>,
    path: String,
    folder: Option<String>,
    threshold: u32,
) -> Result<Vec<String>, String> {
    let image = PathBuf::from(path);
    check_image_path(&open_folder(&state)?, &image)?;
    let folder = tagger_folder(folder)?;
    let loaded = Arc::clone(&loaded.0);
    tauri::async_runtime::spawn_blocking(move || {
        let mut slot = loaded
            .lock()
            .map_err(|_| "The tagger is not available.".to_string())?;
        if slot.as_ref().is_none_or(|tagger| tagger.folder() != folder) {
            *slot = Some(Tagger::load(&folder)?);
        }
        let tagger = slot.as_mut().ok_or("The tagger is not available.")?;
        tagger.suggest(&image, threshold as f32 / 100.0)
    })
    .await
    .map_err(|err| format!("The tagger stopped. {err}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

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
        .manage(LoadedTagger(Arc::new(Mutex::new(None))))
        .invoke_handler(tauri::generate_handler![
            scan_dataset,
            rename_dataset_image,
            write_captions,
            load_user_config,
            save_user_config,
            tagger_status,
            download_tagger,
            suggest_tags
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
