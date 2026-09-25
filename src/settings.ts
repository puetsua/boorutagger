import { clampCount, normTag } from "./tags";

export const LAST_FOLDER_KEY = "boorutagger-folder";
const MAX_FOLDERS = 30;
const MAX_FILTER_TAGS = 40;
const MAX_PRESETS = 30;
const MAX_PRESET_NAME = 40;

const SETTINGS_KEY = "boorutagger-settings";

export const GALLERY_VIEWS = ["masonry", "tile", "list"] as const;

export type GalleryView = (typeof GALLERY_VIEWS)[number];

export type Settings = {
  showSidecar: boolean;
  galleryView: GalleryView;
  recentCount: number;
  recent: string[];
};

export type FolderFilters = {
  hasTags: string[];
  missingTags: string[];
};

export type FilterPreset = {
  id: string;
  name: string;
  hasTags: string[];
  missingTags: string[];
};

export type UserConfig = Settings & {
  lastFolder: string | null;
  folderFilters: Record<string, FolderFilters>;
  filterPresets: FilterPreset[];
};

export const DEFAULT_SETTINGS: Settings = {
  showSidecar: false,
  galleryView: "masonry",
  recentCount: 8,
  recent: [],
};

export function parseGalleryView(value: unknown): GalleryView {
  if (value === "grid" || value === "masonry") return "masonry";
  return value === "tile" || value === "list" ? value : "masonry";
}

export function parseSettings(raw: unknown): Settings {
  const parsed = raw && typeof raw === "object" ? (raw as Partial<Settings>) : {};
  return {
    showSidecar: parsed.showSidecar === true,
    galleryView: parseGalleryView(parsed.galleryView),
    recentCount: clampCount(parsed.recentCount ?? DEFAULT_SETTINGS.recentCount),
    recent: cleanTagList(parsed.recent, 20),
  };
}

export function folderKey(folder: string): string {
  const trimmed = folder.trim().replace(/[\\/]+$/, "");
  const windows = trimmed.includes("\\") || /^[a-zA-Z]:/.test(trimmed);
  return windows ? trimmed.toLowerCase() : trimmed;
}

export function parseFolderFilters(raw: unknown): Record<string, FolderFilters> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, FolderFilters> = {};
  for (const [folder, value] of Object.entries(raw).slice(-MAX_FOLDERS)) {
    const key = folderKey(folder);
    if (!key || !value || typeof value !== "object") continue;
    const parsed = value as Partial<FolderFilters>;
    out[key] = {
      hasTags: cleanFilterTags(parsed.hasTags),
      missingTags: cleanFilterTags(parsed.missingTags),
    };
  }
  return out;
}

export function lookupFolderFilters(
  saved: Record<string, FolderFilters>,
  folder: string,
): FolderFilters | undefined {
  return saved[folderKey(folder)];
}

export function rememberFolderFilters(
  current: Record<string, FolderFilters>,
  folder: string,
  hasTags: readonly string[],
  missingTags: readonly string[],
): Record<string, FolderFilters> {
  const key = folderKey(folder);
  if (!key) return current;
  const next: Record<string, FolderFilters> = {};
  for (const [name, filters] of Object.entries(current)) {
    const existing = folderKey(name);
    if (!existing || existing === key) continue;
    next[existing] = filters;
  }
  const kept = Object.entries(next).slice(-(MAX_FOLDERS - 1));
  return {
    ...Object.fromEntries(kept),
    [key]: { hasTags: cleanFilterTags(hasTags), missingTags: cleanFilterTags(missingTags) },
  };
}

function cleanFilterTags(raw: unknown): string[] {
  return cleanTagList(raw, MAX_FILTER_TAGS);
}

function cleanTagList(raw: unknown, limit: number): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const tag = normTag(item);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length === limit) break;
  }
  return tags;
}

export function sameFilterTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

export function parseFilterPresets(raw: unknown): FilterPreset[] {
  if (!Array.isArray(raw)) return [];
  const presets: FilterPreset[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const parsed = item as Partial<FilterPreset>;
    const id = typeof parsed.id === "string" ? parsed.id.trim() : "";
    const name = cleanPresetName(parsed.name);
    const hasTags = cleanFilterTags(parsed.hasTags);
    const missingTags = cleanFilterTags(parsed.missingTags);
    if (!id || !name || ids.has(id) || (hasTags.length === 0 && missingTags.length === 0)) continue;
    ids.add(id);
    presets.push({ id, name, hasTags, missingTags });
    if (presets.length === MAX_PRESETS) break;
  }
  return presets;
}

export function upsertFilterPreset(
  current: readonly FilterPreset[],
  name: string,
  hasTags: readonly string[],
  missingTags: readonly string[],
): FilterPreset[] {
  const cleanName = cleanPresetName(name);
  const nextHas = cleanFilterTags(hasTags);
  const nextMissing = cleanFilterTags(missingTags);
  if (!cleanName || (nextHas.length === 0 && nextMissing.length === 0)) return [...current];
  const existing = current.find((preset) => preset.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) {
    return current.map((preset) =>
      preset.id === existing.id ? { ...preset, name: cleanName, hasTags: nextHas, missingTags: nextMissing } : preset,
    );
  }
  return [...current, { id: crypto.randomUUID(), name: cleanName, hasTags: nextHas, missingTags: nextMissing }].slice(
    -MAX_PRESETS,
  );
}

export function replaceFilterPreset(
  current: readonly FilterPreset[],
  id: string,
  hasTags: readonly string[],
  missingTags: readonly string[],
): FilterPreset[] {
  const nextHas = cleanFilterTags(hasTags);
  const nextMissing = cleanFilterTags(missingTags);
  const owner = current.find((preset) => preset.id === id);
  if (!owner || (nextHas.length === 0 && nextMissing.length === 0)) return current as FilterPreset[];
  if (sameFilterTags(owner.hasTags, nextHas) && sameFilterTags(owner.missingTags, nextMissing)) {
    return current as FilterPreset[];
  }
  return current.map((preset) => (preset.id === id ? { ...preset, hasTags: nextHas, missingTags: nextMissing } : preset));
}

export function renameFilterPreset(current: readonly FilterPreset[], id: string, name: string): FilterPreset[] {
  const cleanName = cleanPresetName(name);
  const owner = current.find((preset) => preset.id === id);
  const taken = current.some((preset) => preset.id !== id && preset.name.toLowerCase() === cleanName.toLowerCase());
  if (!cleanName || !owner || owner.name === cleanName || taken) return current as FilterPreset[];
  return current.map((preset) => (preset.id === id ? { ...preset, name: cleanName } : preset));
}

export function presetMatches(
  preset: FilterPreset,
  hasTags: readonly string[],
  missingTags: readonly string[],
): boolean {
  return sameFilterTags(preset.hasTags, hasTags) && sameFilterTags(preset.missingTags, missingTags);
}

function cleanPresetName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_PRESET_NAME);
}

export function toUserConfig(
  settings: Settings,
  lastFolder: string | null,
  folderFilters: Record<string, FolderFilters>,
  filterPresets: readonly FilterPreset[],
): UserConfig {
  return { ...settings, lastFolder, folderFilters, filterPresets: parseFilterPresets(filterPresets) };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return parseSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function loadFolderFilters(): Record<string, FolderFilters> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return parseFolderFilters((JSON.parse(raw) as { folderFilters?: unknown }).folderFilters);
  } catch {
    return {};
  }
}

export function loadFilterPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return [];
    return parseFilterPresets((JSON.parse(raw) as { filterPresets?: unknown }).filterPresets);
  } catch {
    return [];
  }
}

export function saveSettings(
  settings: Settings,
  folderFilters: Record<string, FolderFilters>,
  filterPresets: readonly FilterPreset[],
) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, folderFilters, filterPresets }));
}

export function readLegacyLocal(): UserConfig | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const last = localStorage.getItem(LAST_FOLDER_KEY);
    if (!raw && !last) return null;
    const parsed = raw ? (JSON.parse(raw) as { folderFilters?: unknown }) : {};
    return {
      ...parseSettings(parsed),
      lastFolder: last,
      folderFilters: parseFolderFilters(parsed.folderFilters),
      filterPresets: parseFilterPresets((parsed as { filterPresets?: unknown }).filterPresets),
    };
  } catch {
    return null;
  }
}
