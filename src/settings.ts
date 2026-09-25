import { clampCount, normTag } from "./tags";

export const LAST_FOLDER_KEY = "boorutagger-folder";
const MAX_FOLDERS = 30;
const MAX_FILTER_TAGS = 40;

const SETTINGS_KEY = "boorutagger-settings";

export const GALLERY_VIEWS = ["masonry", "tile", "list"] as const;

export type GalleryView = (typeof GALLERY_VIEWS)[number];

export type Settings = {
  showSidecar: boolean;
  galleryView: GalleryView;
  frequentCount: number;
  recentCount: number;
  recent: string[];
};

export type FolderFilters = {
  hasTags: string[];
  missingTags: string[];
};

export type UserConfig = Settings & {
  lastFolder: string | null;
  folderFilters: Record<string, FolderFilters>;
};

export const DEFAULT_SETTINGS: Settings = {
  showSidecar: false,
  galleryView: "masonry",
  frequentCount: 8,
  recentCount: 8,
  recent: [],
};

export function parseGalleryView(value: unknown): GalleryView {
  if (value === "grid" || value === "masonry") return "masonry";
  return value === "tile" || value === "list" ? value : "masonry";
}

export function parseSettings(raw: unknown): Settings {
  const parsed = raw && typeof raw === "object" ? (raw as Partial<Settings>) : {};
  const recent = Array.isArray(parsed.recent)
    ? parsed.recent.filter((tag): tag is string => typeof tag === "string").slice(0, 20)
    : [];
  return {
    showSidecar: parsed.showSidecar === true,
    galleryView: parseGalleryView(parsed.galleryView),
    frequentCount: clampCount(parsed.frequentCount ?? DEFAULT_SETTINGS.frequentCount),
    recentCount: clampCount(parsed.recentCount ?? DEFAULT_SETTINGS.recentCount),
    recent,
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
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const tag = normTag(item);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length === MAX_FILTER_TAGS) break;
  }
  return tags;
}

export function sameFilterTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

export function toUserConfig(
  settings: Settings,
  lastFolder: string | null,
  folderFilters: Record<string, FolderFilters>,
): UserConfig {
  return { ...settings, lastFolder, folderFilters };
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

export function saveSettings(settings: Settings, folderFilters: Record<string, FolderFilters>) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, folderFilters }));
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
    };
  } catch {
    return null;
  }
}
