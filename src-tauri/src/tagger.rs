use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use image::imageops::FilterType;
use image::{Rgb, RgbImage};
use ort::session::Session;
use ort::value::Tensor;

pub const MODEL_NAME: &str = "wd-vit-tagger-v3";
const MODEL_FILE: &str = "model.onnx";
const TAGS_FILE: &str = "selected_tags.csv";
const MODEL_URL: &str = "https://huggingface.co/SmilingWolf/wd-vit-tagger-v3/resolve/main";
const SIZE: u32 = 448;
const RATING: u8 = 9;
// WD taggers keep underscores in these; every other Danbooru tag uses spaces.
const KAOMOJI: &[&str] = &[
    "0_0", "(o)_(o)", "+_+", "+_-", "._.", "<o>_<o>", "<|>_<|>", "=_=", ">_<", "3_3", "6_9", ">_o", "@_@",
    "^_^", "o_o", "u_u", "x_x", "|_|", "||_||",
];

pub struct Tagger {
    folder: PathBuf,
    session: Session,
    tags: Vec<(String, u8)>,
}

pub fn installed(folder: &Path) -> bool {
    folder.join(MODEL_FILE).is_file() && folder.join(TAGS_FILE).is_file()
}

impl Tagger {
    pub fn load(folder: &Path) -> Result<Self, String> {
        if !installed(folder) {
            return Err("Download the tagger model in Settings first.".into());
        }
        let session = Session::builder()
            .and_then(|mut builder| builder.commit_from_file(folder.join(MODEL_FILE)))
            .map_err(|err| format!("Could not load the tagger model. {err}"))?;
        Ok(Self {
            folder: folder.to_path_buf(),
            session,
            tags: read_tags(&folder.join(TAGS_FILE))?,
        })
    }

    pub fn folder(&self) -> &Path {
        &self.folder
    }

    pub fn suggest(&mut self, image: &Path, threshold: f32) -> Result<Vec<String>, String> {
        let input = Tensor::from_array(([1usize, SIZE as usize, SIZE as usize, 3], pixels(image)?))
            .map_err(|err| format!("Could not prepare the image. {err}"))?;
        let outputs = self
            .session
            .run(ort::inputs![input])
            .map_err(|err| format!("The tagger failed. {err}"))?;
        let (_, scores) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|err| format!("The tagger failed. {err}"))?;
        let mut found: Vec<(f32, &str)> = scores
            .iter()
            .zip(&self.tags)
            .filter(|(score, (_, category))| **score >= threshold && *category != RATING)
            .map(|(score, (name, _))| (*score, name.as_str()))
            .collect();
        found.sort_by(|a, b| b.0.total_cmp(&a.0));
        Ok(found.into_iter().map(|(_, name)| display_tag(name)).collect())
    }
}

fn read_tags(path: &Path) -> Result<Vec<(String, u8)>, String> {
    let raw = fs::read_to_string(path).map_err(|err| format!("Could not read {}. {err}", path.display()))?;
    Ok(raw.lines().skip(1).filter_map(parse_tag_row).collect())
}

// Rows are tag_id,name,category,count, and a name may itself hold commas.
fn parse_tag_row(line: &str) -> Option<(String, u8)> {
    let (rest, _count) = line.trim_end().rsplit_once(',')?;
    let (rest, category) = rest.rsplit_once(',')?;
    let (_, name) = rest.split_once(',')?;
    Some((name.trim_matches('"').to_string(), category.parse().ok()?))
}

fn display_tag(name: &str) -> String {
    if name.len() > 3 && !KAOMOJI.contains(&name) {
        name.replace('_', " ")
    } else {
        name.to_string()
    }
}

// Pads to a white square, then returns 448x448 BGR floats in 0..255, as WD v3 expects.
fn pixels(path: &Path) -> Result<Vec<f32>, String> {
    let failed = |err: &dyn std::fmt::Display| format!("Could not read {}. {err}", path.display());
    let source = image::ImageReader::open(path)
        .and_then(|reader| reader.with_guessed_format())
        .map_err(|err| failed(&err))?
        .decode()
        .map_err(|err| failed(&err))?
        .to_rgba8();
    let (width, height) = source.dimensions();
    let side = width.max(height);
    let (left, top) = ((side - width) / 2, (side - height) / 2);
    let mut square = RgbImage::from_pixel(side, side, Rgb([255, 255, 255]));
    for (x, y, pixel) in source.enumerate_pixels() {
        let alpha = f32::from(pixel[3]) / 255.0;
        let blend = |channel: u8| (f32::from(channel) * alpha + 255.0 * (1.0 - alpha)).round() as u8;
        square.put_pixel(x + left, y + top, Rgb([blend(pixel[0]), blend(pixel[1]), blend(pixel[2])]));
    }
    let resized = image::imageops::resize(&square, SIZE, SIZE, FilterType::CatmullRom);
    Ok(resized
        .pixels()
        .flat_map(|pixel| [f32::from(pixel[2]), f32::from(pixel[1]), f32::from(pixel[0])])
        .collect())
}

pub fn download(folder: &Path, mut progress: impl FnMut(u64, u64)) -> Result<(), String> {
    fs::create_dir_all(folder).map_err(|err| format!("Could not create {}. {err}", folder.display()))?;
    let client = reqwest::blocking::Client::builder()
        .timeout(None)
        .build()
        .map_err(|err| format!("Could not start the download. {err}"))?;
    fetch(&client, TAGS_FILE, folder, &mut |_, _| {})?;
    fetch(&client, MODEL_FILE, folder, &mut progress)
}

fn fetch(
    client: &reqwest::blocking::Client,
    name: &str,
    folder: &Path,
    progress: &mut dyn FnMut(u64, u64),
) -> Result<(), String> {
    let failed = |err: &dyn std::fmt::Display| format!("Could not download {name}. {err}");
    let mut response = client
        .get(format!("{MODEL_URL}/{name}"))
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|err| failed(&err))?;
    let total = response.content_length().unwrap_or(0);
    let part = folder.join(format!("{name}.part"));
    let mut file = File::create(&part).map_err(|err| failed(&err))?;
    let mut buffer = vec![0; 1 << 16];
    let (mut received, mut shown) = (0u64, u64::MAX);
    loop {
        let read = response.read(&mut buffer).map_err(|err| failed(&err))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read]).map_err(|err| failed(&err))?;
        received += read as u64;
        let percent = (received * 100).checked_div(total).unwrap_or(0);
        if percent != shown {
            shown = percent;
            progress(received, total);
        }
    }
    drop(file);
    fs::rename(&part, folder.join(name)).map_err(|err| failed(&err))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_tag_rows_with_commas_in_names() {
        assert_eq!(parse_tag_row("9999999,general,9,807489"), Some(("general".into(), 9)));
        assert_eq!(parse_tag_row("1,long_hair,0,4350743\r"), Some(("long_hair".into(), 0)));
        assert_eq!(parse_tag_row("2,\"a,b\",0,1"), Some(("a,b".into(), 0)));
        assert_eq!(parse_tag_row("tag_id,name,category,count"), None);
    }

    #[test]
    fn spaces_tags_but_keeps_kaomoji() {
        assert_eq!(display_tag("long_hair"), "long hair");
        assert_eq!(display_tag("tank_(container)"), "tank (container)");
        assert_eq!(display_tag("^_^"), "^_^");
        assert_eq!(display_tag("o_o"), "o_o");
        assert_eq!(display_tag("||_||"), "||_||");
    }
}
