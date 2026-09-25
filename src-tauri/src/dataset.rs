use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageRecord {
    pub name: String,
    pub path: String,
    pub caption_path: String,
    pub caption: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub images: Vec<ImageRecord>,
    pub unreadable: u32,
}

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"];

pub fn scan_folder(folder: &Path) -> Result<ScanResult, String> {
    if !folder.is_dir() {
        return Err("That folder is not available.".into());
    }

    let mut images = Vec::new();
    let mut unreadable = 0u32;
    collect_images(folder, folder, &mut images, &mut unreadable)?;
    images.sort_by(|a, b| natural_cmp(&a.name, &b.name));
    Ok(ScanResult { images, unreadable })
}

fn collect_images(
    root: &Path,
    dir: &Path,
    images: &mut Vec<ImageRecord>,
    unreadable: &mut u32,
) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|err| format!("Could not read the folder. {err}"))?;
    for entry in entries {
        let entry = entry.map_err(|err| format!("Could not read the folder. {err}"))?;
        let path = entry.path();
        if is_hidden(&path) {
            continue;
        }
        let meta = match fs::symlink_metadata(&path) {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            collect_images(root, &path, images, unreadable)?;
            continue;
        }
        if !meta.is_file() {
            continue;
        }
        let Some(ext) = path.extension().and_then(|ext| ext.to_str()) else {
            continue;
        };
        if !is_image_ext(ext) {
            continue;
        }

        let caption_path = path.with_extension("txt");
        let caption = match read_caption(&caption_path) {
            Ok(text) => text,
            Err(_) => {
                *unreadable += 1;
                String::new()
            }
        };
        images.push(ImageRecord {
            name: relative_name(root, &path),
            path: path.to_string_lossy().into_owned(),
            caption_path: caption_path.to_string_lossy().into_owned(),
            caption,
        });
    }
    Ok(())
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with('.'))
}

fn relative_name(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

pub fn check_caption_path(folder: &Path, file: &Path) -> Result<(), String> {
    let ext = file.extension().and_then(|ext| ext.to_str()).unwrap_or("");
    if !ext.eq_ignore_ascii_case("txt") {
        return Err("Captions are saved as .txt files.".into());
    }
    let parent = file
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| "That caption file has no folder.".to_string())?;
    if !is_under(folder, parent) {
        return Err("Refusing to write a caption outside the open folder.".into());
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RenamedImage {
    pub name: String,
    pub path: String,
    pub caption_path: String,
}

pub fn rename_image(folder: &Path, source: &Path, file_name: &str) -> Result<RenamedImage, String> {
    let meta = fs::symlink_metadata(source).map_err(|_| "That image is not available.".to_string())?;
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Err("That image is not available.".into());
    }
    let ext = source
        .extension()
        .and_then(|ext| ext.to_str())
        .filter(|ext| is_image_ext(ext))
        .ok_or_else(|| "That file is not an image.".to_string())?;
    let parent = source
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| "That image has no folder.".to_string())?;
    if !is_under(folder, parent) {
        return Err("Refusing to rename an image outside the open folder.".into());
    }
    validate_file_name(file_name)?;
    let new_ext = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if !new_ext.eq_ignore_ascii_case(ext) {
        return Err("Keep the same file extension.".into());
    }
    if Path::new(file_name).components().count() != 1 {
        return Err("Enter a file name, not a path.".into());
    }

    let destination = parent.join(file_name);
    let old_caption = source.with_extension("txt");
    let new_caption = destination.with_extension("txt");
    if destination.exists() && !same_file(&destination, source) {
        return Err("An image with that name already exists.".into());
    }
    if new_caption.exists() && !same_file(&new_caption, &old_caption) {
        return Err("A caption file with that name already exists.".into());
    }
    if destination != source {
        fs::rename(source, &destination).map_err(|err| format!("Could not rename the image. {err}"))?;
    }
    if old_caption.exists() && new_caption != old_caption {
        if let Err(err) = fs::rename(&old_caption, &new_caption) {
            if destination != source {
                let _ = fs::rename(&destination, source);
            }
            return Err(format!("Could not rename the caption file. {err}"));
        }
    }
    Ok(RenamedImage {
        name: relative_name(folder, &destination),
        path: destination.to_string_lossy().into_owned(),
        caption_path: new_caption.to_string_lossy().into_owned(),
    })
}

fn validate_file_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name == "." || name == ".." {
        return Err("Enter a file name.".into());
    }
    if name.len() > 255 {
        return Err("That file name is too long.".into());
    }
    if name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|']) || name.ends_with([' ', '.']) {
        return Err("That file name has a character Windows does not allow.".into());
    }
    let stem = Path::new(name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    const RESERVED: &[&str] = &[
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if RESERVED.iter().any(|item| stem.eq_ignore_ascii_case(item)) {
        return Err("That file name is reserved by Windows.".into());
    }
    Ok(())
}

fn same_file(left: &Path, right: &Path) -> bool {
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => strip_verbatim(&left) == strip_verbatim(&right),
        _ => false,
    }
}

pub fn write_caption_file(path: &Path, text: &str) -> Result<(), String> {
    let body = if text.is_empty() || text.ends_with('\n') {
        text.to_string()
    } else {
        format!("{text}\n")
    };
    fs::write(path, body).map_err(|err| format!("Could not write {}. {err}", path.display()))
}

fn read_caption(path: &Path) -> Result<String, std::io::Error> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(trim_trailing_newlines(text)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(err) if err.kind() == std::io::ErrorKind::InvalidData => {
            let bytes = fs::read(path)?;
            Ok(trim_trailing_newlines(
                String::from_utf8_lossy(&bytes).into_owned(),
            ))
        }
        Err(err) => Err(err),
    }
}

fn trim_trailing_newlines(mut text: String) -> String {
    while text.ends_with('\n') || text.ends_with('\r') {
        text.pop();
    }
    text
}

fn is_image_ext(ext: &str) -> bool {
    IMAGE_EXTENSIONS
        .iter()
        .any(|candidate| ext.eq_ignore_ascii_case(candidate))
}

fn is_under(folder: &Path, path: &Path) -> bool {
    let Ok(folder) = folder.canonicalize() else {
        return false;
    };
    let Ok(path) = path.canonicalize() else {
        return false;
    };
    let folder = strip_verbatim(&folder);
    let path = strip_verbatim(&path);
    path == folder || path.starts_with(&folder)
}

fn strip_verbatim(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    path.to_path_buf()
}

enum Chunk<'a> {
    Text(&'a str),
    Number(&'a str),
}

fn chunks(value: &str) -> Vec<Chunk<'_>> {
    let bytes = value.as_bytes();
    let mut parts = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        let start = index;
        let digits = bytes[index].is_ascii_digit();
        index += 1;
        while index < bytes.len() && bytes[index].is_ascii_digit() == digits {
            index += 1;
        }
        let part = &value[start..index];
        parts.push(if digits {
            Chunk::Number(part)
        } else {
            Chunk::Text(part)
        });
    }
    parts
}

fn natural_cmp(left: &str, right: &str) -> Ordering {
    let left_parts = chunks(left);
    let right_parts = chunks(right);
    for (left_part, right_part) in left_parts.iter().zip(right_parts.iter()) {
        let order = match (left_part, right_part) {
            (Chunk::Number(left_num), Chunk::Number(right_num)) => cmp_num(left_num, right_num),
            (Chunk::Text(left_text), Chunk::Text(right_text)) => cmp_text(left_text, right_text),
            (Chunk::Number(_), Chunk::Text(_)) => Ordering::Less,
            (Chunk::Text(_), Chunk::Number(_)) => Ordering::Greater,
        };
        if order != Ordering::Equal {
            return order;
        }
    }
    left_parts
        .len()
        .cmp(&right_parts.len())
        .then_with(|| left.cmp(right))
}

fn cmp_num(left: &str, right: &str) -> Ordering {
    let left = trim_zeros(left);
    let right = trim_zeros(right);
    left.len().cmp(&right.len()).then_with(|| left.cmp(right))
}

fn trim_zeros(value: &str) -> &str {
    let trimmed = value.trim_start_matches('0');
    if trimmed.is_empty() { "0" } else { trimmed }
}

fn cmp_text(left: &str, right: &str) -> Ordering {
    let mut left_chars = left.chars().flat_map(|ch| ch.to_lowercase());
    let mut right_chars = right.chars().flat_map(|ch| ch.to_lowercase());
    loop {
        match (left_chars.next(), right_chars.next()) {
            (Some(left_ch), Some(right_ch)) => {
                let order = left_ch.cmp(&right_ch);
                if order != Ordering::Equal {
                    return order;
                }
            }
            (None, None) => return Ordering::Equal,
            (Some(_), None) => return Ordering::Greater,
            (None, Some(_)) => return Ordering::Less,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "boorutagger-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn scans_images_reads_sidecars_and_nested_folders() {
        let dir = temp_dir("scan");
        fs::write(dir.join("b.png"), b"png").unwrap();
        fs::write(dir.join("a.jpg"), b"jpg").unwrap();
        fs::write(dir.join("a.txt"), "1girl, solo\n").unwrap();
        fs::write(dir.join("notes.txt"), "ignore").unwrap();
        fs::write(dir.join("lio_10.png"), b"png").unwrap();
        fs::write(dir.join("lio_2.png"), b"png").unwrap();
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::write(dir.join("sub").join("c.png"), b"png").unwrap();
        fs::write(dir.join("sub").join("c.txt"), "inside\n").unwrap();

        let scan = scan_folder(&dir).unwrap();
        let names: Vec<_> = scan.images.iter().map(|image| image.name.as_str()).collect();
        assert_eq!(names, ["a.jpg", "b.png", "lio_2.png", "lio_10.png", "sub/c.png"]);
        assert_eq!(scan.images[0].caption, "1girl, solo");
        assert_eq!(scan.images[1].caption, "");
        assert_eq!(scan.images[4].caption, "inside");
        assert_eq!(scan.unreadable, 0);

        write_caption_file(&dir.join("b.txt"), "solo").unwrap();
        let again = scan_folder(&dir).unwrap();
        assert_eq!(again.images[1].caption, "solo");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_caption_writes_outside_the_folder() {
        let dir = temp_dir("guard");
        let other = temp_dir("other");
        let caption = dir.join("image.txt");
        check_caption_path(&dir, &caption).unwrap();
        fs::create_dir_all(dir.join("nested")).unwrap();
        check_caption_path(&dir, &dir.join("nested").join("image.txt")).unwrap();
        let outside = other.join("image.txt");
        assert!(check_caption_path(&dir, &outside).is_err());
        assert!(check_caption_path(&dir, &dir.join("image.png")).is_err());
        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&other);
    }

    #[test]
    fn renames_image_and_sidecar_inside_the_folder() {
        let dir = temp_dir("rename");
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::write(dir.join("sub").join("old.png"), b"png").unwrap();
        fs::write(dir.join("sub").join("old.txt"), "1girl, solo\n").unwrap();

        let renamed = rename_image(&dir, &dir.join("sub").join("old.png"), "new.png").unwrap();
        assert_eq!(renamed.name, "sub/new.png");
        assert!(dir.join("sub").join("new.png").is_file());
        assert!(dir.join("sub").join("new.txt").is_file());
        assert!(!dir.join("sub").join("old.png").exists());
        assert_eq!(fs::read_to_string(dir.join("sub").join("new.txt")).unwrap(), "1girl, solo\n");
        assert!(rename_image(&dir, &dir.join("sub").join("new.png"), "nope.jpg").is_err());
        assert!(rename_image(&dir, &dir.join("sub").join("new.png"), r"..\escape.png").is_err());
        fs::write(dir.join("sub").join("taken.png"), b"png").unwrap();
        assert!(rename_image(&dir, &dir.join("sub").join("new.png"), "taken.png").is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
