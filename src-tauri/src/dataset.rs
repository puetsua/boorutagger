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

    let entries = fs::read_dir(folder)
        .map_err(|err| format!("Could not read the folder. {err}"))?;
    let mut images = Vec::new();
    let mut unreadable = 0u32;

    for entry in entries {
        let entry = entry.map_err(|err| format!("Could not read the folder. {err}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
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
                unreadable += 1;
                String::new()
            }
        };
        images.push(ImageRecord {
            name,
            path: path.to_string_lossy().into_owned(),
            caption_path: caption_path.to_string_lossy().into_owned(),
            caption,
        });
    }

    images.sort_by(|a, b| natural_cmp(&a.name, &b.name));
    Ok(ScanResult { images, unreadable })
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
    if normalize(folder) != normalize(parent) {
        return Err("Refusing to write a caption outside the open folder.".into());
    }
    Ok(())
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

fn normalize(path: &Path) -> PathBuf {
    match path.canonicalize() {
        Ok(canonical) => strip_verbatim(&canonical),
        Err(_) => path.to_path_buf(),
    }
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
    fn scans_images_reads_sidecars_and_skips_subfolders() {
        let dir = temp_dir("scan");
        fs::write(dir.join("b.png"), b"png").unwrap();
        fs::write(dir.join("a.jpg"), b"jpg").unwrap();
        fs::write(dir.join("a.txt"), "1girl, solo\n").unwrap();
        fs::write(dir.join("notes.txt"), "ignore").unwrap();
        fs::write(dir.join("lio_10.png"), b"png").unwrap();
        fs::write(dir.join("lio_2.png"), b"png").unwrap();
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::write(dir.join("sub").join("c.png"), b"png").unwrap();

        let scan = scan_folder(&dir).unwrap();
        let names: Vec<_> = scan.images.iter().map(|image| image.name.as_str()).collect();
        assert_eq!(names, ["a.jpg", "b.png", "lio_2.png", "lio_10.png"]);
        assert_eq!(scan.images[0].caption, "1girl, solo");
        assert_eq!(scan.images[1].caption, "");
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
        let outside = other.join("image.txt");
        assert!(check_caption_path(&dir, &outside).is_err());
        assert!(check_caption_path(&dir, &dir.join("image.png")).is_err());
        let _ = fs::remove_dir_all(&dir);
        let _ = fs::remove_dir_all(&other);
    }
}
