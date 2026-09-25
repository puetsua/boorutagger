import type { ImageItem } from "./types";

const POSES = ["standing", "sitting", "looking_at_viewer", "from_behind"];
const BACKGROUNDS = ["grey_background", "white_background", "simple_background"];
const PLATES = ["#243044", "#3a2a28", "#1e3340", "#2c3140", "#3a3328", "#1b2836"];
const RATIOS: [number, number][] = [
  [3, 4],
  [1, 1],
  [4, 3],
  [2, 3],
  [16, 9],
  [3, 2],
];

function plate(n: number): string {
  const [w, h] = RATIOS[n % RATIOS.length];
  const insetX = w * 0.28;
  const insetY = h * 0.38;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${PLATES[n % PLATES.length]}"/><rect x="${insetX}" y="${insetY}" width="${w - insetX * 2}" height="${h - insetY * 2}" fill="#c4492c"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildSample(): ImageItem[] {
  const images: ImageItem[] = [];
  for (let n = 1; n <= 100; n++) {
    const name = `lio_${String(n).padStart(3, "0")}.png`;
    let caption = "";
    if (n % 7 !== 0) {
      const tags = ["lio_vesper", "1boy", "short_hair", "dark_blue_hair"];
      tags.push(n % 5 === 0 ? "red_jacket" : "red_coat");
      if (n % 2 === 0) tags.push("white_shirt");
      if (n % 3 === 0) tags.push("amber_eyes");
      tags.push(POSES[n % 4]);
      tags.push(n % 4 === 0 ? "full_body" : "upper_body");
      tags.push(BACKGROUNDS[n % 3]);
      if (n % 8 === 0) tags.push("outdoors", "night");
      caption = tags.join(", ");
    }
    images.push({
      id: `sample/${name}`,
      name,
      path: `sample/${name}`,
      captionPath: `sample/${name.replace(/\.png$/, ".txt")}`,
      caption,
      src: plate(n),
    });
  }
  return images;
}
