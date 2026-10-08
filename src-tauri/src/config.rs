use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const CONFIG_DIR: &str = ".boorutagger";
const CONFIG_FILE: &str = "config.json";
const MAX_COUNT: u32 = 20;
const DEFAULT_COUNT: u32 = 8;
const MAX_FOLDERS: usize = 30;
const MAX_FILTER_TAGS: usize = 40;
const MAX_PRESETS: usize = 30;
const MAX_PRESET_NAME: usize = 40;
const MAX_POOLS: usize = 50;
const MAX_POOL_TAGS: usize = 100;
const MIN_THRESHOLD: u32 = 5;
const MAX_THRESHOLD: u32 = 95;
const DEFAULT_THRESHOLD: u32 = 35;
const LEFT_PANE: (u32, u32, u32) = (160, 212, 480);
const RIGHT_PANE: (u32, u32, u32) = (280, 372, 720);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FilterPreset {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub has_tags: Vec<String>,
    #[serde(default)]
    pub missing_tags: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct PaneLayout {
    pub width: u32,
    pub open: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TagPool {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub folder: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderFilters {
    #[serde(default)]
    pub has_tags: Vec<String>,
    #[serde(default)]
    pub missing_tags: Vec<String>,
    #[serde(default)]
    pub hidden_pools: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserConfig {
    #[serde(default)]
    pub show_sidecar: bool,
    #[serde(default = "default_gallery_view")]
    pub gallery_view: String,
    #[serde(default = "default_count")]
    pub recent_count: u32,
    #[serde(default)]
    pub recent: Vec<String>,
    #[serde(default)]
    pub last_folder: Option<String>,
    #[serde(default)]
    pub folder_filters: HashMap<String, FolderFilters>,
    #[serde(default)]
    pub filter_presets: Vec<FilterPreset>,
    #[serde(default)]
    pub tagger_folder: Option<String>,
    #[serde(default = "default_threshold")]
    pub tagger_threshold: u32,
    #[serde(default)]
    pub tag_pools: Vec<TagPool>,
    #[serde(default = "default_left_pane")]
    pub left_pane: PaneLayout,
    #[serde(default = "default_right_pane")]
    pub right_pane: PaneLayout,
}

impl Default for UserConfig {
    fn default() -> Self {
        Self {
            show_sidecar: false,
            gallery_view: default_gallery_view(),
            recent_count: DEFAULT_COUNT,
            recent: Vec::new(),
            last_folder: None,
            folder_filters: HashMap::new(),
            filter_presets: Vec::new(),
            tagger_folder: None,
            tagger_threshold: DEFAULT_THRESHOLD,
            tag_pools: Vec::new(),
            left_pane: default_left_pane(),
            right_pane: default_right_pane(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigLoad {
    pub config: UserConfig,
    pub exists: bool,
}

fn default_count() -> u32 {
    DEFAULT_COUNT
}

fn default_threshold() -> u32 {
    DEFAULT_THRESHOLD
}

fn default_gallery_view() -> String {
    "masonry".into()
}

fn default_left_pane() -> PaneLayout {
    PaneLayout {
        width: LEFT_PANE.1,
        open: true,
    }
}

fn default_right_pane() -> PaneLayout {
    PaneLayout {
        width: RIGHT_PANE.1,
        open: true,
    }
}

fn clamp_pane(pane: PaneLayout, (min, _, max): (u32, u32, u32)) -> PaneLayout {
    PaneLayout {
        width: pane.width.clamp(min, max),
        ..pane
    }
}

pub fn config_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(CONFIG_DIR).join(CONFIG_FILE))
}

pub fn models_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(CONFIG_DIR).join("models"))
}

fn home_dir() -> Result<PathBuf, String> {
    #[cfg(windows)]
    {
        std::env::var_os("USERPROFILE")
            .map(PathBuf::from)
            .ok_or_else(|| "Could not find the home folder.".into())
    }
    #[cfg(not(windows))]
    {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| "Could not find the home folder.".into())
    }
}

pub fn load_from(path: &Path) -> Result<UserConfig, String> {
    if !path.is_file() {
        return Ok(UserConfig::default());
    }
    let raw = fs::read_to_string(path)
        .map_err(|err| format!("Could not read {}. {err}", path.display()))?;
    let parsed: UserConfig = serde_json::from_str(&raw)
        .map_err(|err| format!("Could not parse {}. {err}", path.display()))?;
    Ok(normalize(parsed))
}

pub fn save_to(path: &Path, config: &UserConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create {}. {err}", parent.display()))?;
    }
    let body = serde_json::to_string_pretty(&normalize(config.clone()))
        .map_err(|err| format!("Could not write config. {err}"))?;
    fs::write(path, format!("{body}\n"))
        .map_err(|err| format!("Could not write {}. {err}", path.display()))
}

fn normalize(mut config: UserConfig) -> UserConfig {
    config.recent_count = config.recent_count.min(MAX_COUNT);
    config.recent = clean_tag_list(config.recent, 20);
    config.gallery_view = match config.gallery_view.as_str() {
        "grid" => default_gallery_view(),
        "tile" | "list" | "masonry" => config.gallery_view,
        _ => default_gallery_view(),
    };
    if config
        .last_folder
        .as_ref()
        .is_some_and(|folder| folder.trim().is_empty())
    {
        config.last_folder = None;
    }
    config.tagger_folder = config
        .tagger_folder
        .map(|folder| folder.trim().to_string())
        .filter(|folder| !folder.is_empty());
    config.tagger_threshold = config.tagger_threshold.clamp(MIN_THRESHOLD, MAX_THRESHOLD);
    config.folder_filters = clean_folder_filters(config.folder_filters);
    config.filter_presets = clean_presets(config.filter_presets);
    config.tag_pools = clean_pools(config.tag_pools);
    config.left_pane = clamp_pane(config.left_pane, LEFT_PANE);
    config.right_pane = clamp_pane(config.right_pane, RIGHT_PANE);
    config
}

fn clean_pools(pools: Vec<TagPool>) -> Vec<TagPool> {
    let mut seen = HashSet::new();
    let mut cleaned = Vec::new();
    for pool in pools {
        let id = pool.id.trim().to_string();
        let name = clean_preset_name(&pool.name);
        let tags = clean_tag_list(pool.tags, MAX_POOL_TAGS);
        if id.is_empty() || name.is_empty() || tags.is_empty() || !seen.insert(id.clone()) {
            continue;
        }
        cleaned.push(TagPool {
            id,
            name,
            tags,
            folder: pool
                .folder
                .map(|folder| folder_key(&folder))
                .filter(|folder| !folder.is_empty()),
        });
        if cleaned.len() == MAX_POOLS {
            break;
        }
    }
    cleaned
}

fn clean_presets(presets: Vec<FilterPreset>) -> Vec<FilterPreset> {
    let mut seen = HashSet::new();
    let mut cleaned = Vec::new();
    for preset in presets {
        let id = preset.id.trim().to_string();
        let name = clean_preset_name(&preset.name);
        let has_tags = clean_tags(preset.has_tags);
        let missing_tags = clean_tags(preset.missing_tags);
        if id.is_empty()
            || name.is_empty()
            || !seen.insert(id.clone())
            || (has_tags.is_empty() && missing_tags.is_empty())
        {
            continue;
        }
        cleaned.push(FilterPreset {
            id,
            name,
            has_tags,
            missing_tags,
        });
        if cleaned.len() == MAX_PRESETS {
            break;
        }
    }
    cleaned
}

fn clean_preset_name(name: &str) -> String {
    let collapsed = name.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(MAX_PRESET_NAME).collect()
}

fn clean_folder_filters(filters: HashMap<String, FolderFilters>) -> HashMap<String, FolderFilters> {
    let mut cleaned = HashMap::new();
    for (folder, value) in filters {
        let key = folder_key(&folder);
        if key.is_empty() {
            continue;
        }
        cleaned.insert(
            key,
            FolderFilters {
                has_tags: clean_tags(value.has_tags),
                missing_tags: clean_tags(value.missing_tags),
                hidden_pools: clean_ids(value.hidden_pools),
            },
        );
        if cleaned.len() == MAX_FOLDERS {
            break;
        }
    }
    cleaned
}

fn clean_ids(ids: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    ids.into_iter()
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty() && seen.insert(id.clone()))
        .take(MAX_POOLS)
        .collect()
}

fn folder_key(folder: &str) -> String {
    let trimmed = folder.trim().trim_end_matches(['\\', '/']);
    let windows = trimmed.contains('\\') || trimmed.as_bytes().get(1) == Some(&b':');
    if windows {
        trimmed.to_lowercase()
    } else {
        trimmed.to_string()
    }
}

fn clean_tags(tags: Vec<String>) -> Vec<String> {
    clean_tag_list(tags, MAX_FILTER_TAGS)
}

fn normalize_tag(raw: &str) -> String {
    let tag = raw
        .trim()
        .to_lowercase()
        .replace("\\(", "(")
        .replace("\\)", ")")
        .replace("_(", " (")
        .replace(',', "");
    tag.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn clean_tag_list(tags: Vec<String>, limit: usize) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for tag in tags {
        let tag = normalize_tag(&tag);
        if tag.is_empty() || !seen.insert(tag.clone()) {
            continue;
        }
        out.push(tag);
        if out.len() == limit {
            break;
        }
    }
    out
}

#[tauri::command]
pub fn load_user_config() -> Result<ConfigLoad, String> {
    let path = config_path()?;
    Ok(ConfigLoad {
        exists: path.is_file(),
        config: load_from(&path)?,
    })
}

#[tauri::command]
pub fn save_user_config(config: UserConfig) -> Result<(), String> {
    save_to(&config_path()?, &config)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "boorutagger-config-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.join(CONFIG_FILE)
    }

    #[test]
    fn missing_file_returns_defaults() {
        let path = temp_path("missing");
        let loaded = load_from(&path).unwrap();
        assert!(!loaded.show_sidecar);
        assert_eq!(loaded.recent_count, 8);
        assert!(loaded.last_folder.is_none());
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn writes_and_reads_config() {
        let path = temp_path("roundtrip");
        let config = UserConfig {
            show_sidecar: true,
            gallery_view: "tile".into(),
            recent_count: 4,
            recent: vec![
                "1girl".into(),
                "solo".into(),
                "Blue Hair".into(),
                "My_Trigger".into(),
                "Tank_(Container)".into(),
            ],
            last_folder: Some(r"D:\data\set".into()),
            folder_filters: HashMap::from([(
                r"D:\data\set\".into(),
                FolderFilters {
                    has_tags: vec!["1girl".into(), "blue hair".into()],
                    missing_tags: vec!["solo".into()],
                    hidden_pools: vec![" comp ".into(), "comp".into()],
                },
            )]),
            filter_presets: vec![FilterPreset {
                id: "solo".into(),
                name: "  Solo shots  ".into(),
                has_tags: vec!["solo".into()],
                missing_tags: vec!["blue hair".into()],
            }],
            tagger_folder: Some(r" D:\models ".into()),
            tagger_threshold: 50,
            tag_pools: vec![TagPool {
                id: "comp".into(),
                name: " Composition ".into(),
                tags: vec![
                    "Upper Body".into(),
                    "cowboy shot".into(),
                    "upper body".into(),
                ],
                folder: Some(r"D:\Data\Set\".into()),
            }],
            left_pane: PaneLayout {
                width: 300,
                open: false,
            },
            right_pane: PaneLayout {
                width: 400,
                open: true,
            },
        };
        save_to(&path, &config).unwrap();
        let loaded = load_from(&path).unwrap();
        assert!(loaded.show_sidecar);
        assert_eq!(loaded.gallery_view, "tile");
        assert_eq!(loaded.recent_count, 4);
        assert_eq!(
            loaded.recent,
            ["1girl", "solo", "blue hair", "my_trigger", "tank (container)"]
        );
        assert_eq!(loaded.last_folder.as_deref(), Some(r"D:\data\set"));
        assert_eq!(loaded.tagger_folder.as_deref(), Some(r"D:\models"));
        assert_eq!(loaded.tagger_threshold, 50);
        assert_eq!(
            loaded.left_pane,
            PaneLayout {
                width: 300,
                open: false
            }
        );
        assert_eq!(
            loaded.right_pane,
            PaneLayout {
                width: 400,
                open: true
            }
        );
        assert_eq!(
            loaded.tag_pools,
            vec![TagPool {
                id: "comp".into(),
                name: "Composition".into(),
                tags: vec!["upper body".into(), "cowboy shot".into()],
                folder: Some(r"d:\data\set".into()),
            }]
        );
        assert_eq!(
            loaded.folder_filters.get(r"d:\data\set"),
            Some(&FolderFilters {
                has_tags: vec!["1girl".into(), "blue hair".into()],
                missing_tags: vec!["solo".into()],
                hidden_pools: vec!["comp".into()],
            })
        );
        assert_eq!(
            loaded.filter_presets,
            vec![FilterPreset {
                id: "solo".into(),
                name: "Solo shots".into(),
                has_tags: vec!["solo".into()],
                missing_tags: vec!["blue hair".into()],
            }]
        );
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn clamps_counts_and_drops_empty_folder() {
        let path = temp_path("clamp");
        let config = UserConfig {
            show_sidecar: false,
            gallery_view: "cards".into(),
            recent_count: 99,
            recent: vec!["".into(), "tag".into()],
            last_folder: Some("   ".into()),
            folder_filters: HashMap::new(),
            filter_presets: vec![FilterPreset {
                id: " ".into(),
                name: "empty".into(),
                has_tags: vec![],
                missing_tags: vec![],
            }],
            tagger_folder: Some("   ".into()),
            tagger_threshold: 99,
            tag_pools: vec![
                TagPool {
                    id: "pool".into(),
                    name: "   ".into(),
                    tags: vec!["solo".into()],
                    folder: None,
                },
                TagPool {
                    id: "empty".into(),
                    name: "Empty".into(),
                    tags: vec![" ".into()],
                    folder: None,
                },
            ],
            left_pane: PaneLayout {
                width: 10,
                open: true,
            },
            right_pane: PaneLayout {
                width: 9000,
                open: true,
            },
        };
        save_to(&path, &config).unwrap();
        let loaded = load_from(&path).unwrap();
        assert_eq!(loaded.gallery_view, "masonry");
        assert_eq!(loaded.recent_count, 20);
        assert_eq!(loaded.recent, ["tag"]);
        assert!(loaded.last_folder.is_none());
        assert!(loaded.filter_presets.is_empty());
        assert!(loaded.tagger_folder.is_none());
        assert_eq!(loaded.tagger_threshold, 95);
        assert!(loaded.tag_pools.is_empty());
        assert_eq!(loaded.left_pane.width, 160);
        assert_eq!(loaded.right_pane.width, 720);
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }
}
