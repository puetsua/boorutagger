import { clampCount } from "./tags";

export const LAST_FOLDER_KEY = "boorutagger-folder";

const SETTINGS_KEY = "boorutagger-settings";

export const THEMES = [
  { id: "iris", name: "Iris", swatch: "#b4a0ff" },
  { id: "grape", name: "Grape", swatch: "#d4a0ff" },
  { id: "amethyst", name: "Amethyst", swatch: "#a5b4fc" },
  { id: "orchid", name: "Orchid", swatch: "#f0abfc" },
  { id: "wine", name: "Wine", swatch: "#c4b5fd" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export type Settings = {
  showSidecar: boolean;
  frequentCount: number;
  recentCount: number;
  recent: string[];
  theme: ThemeId;
};

export const DEFAULT_SETTINGS: Settings = {
  showSidecar: true,
  frequentCount: 8,
  recentCount: 8,
  recent: [],
  theme: "wine",
};

function parseTheme(value: unknown): ThemeId {
  return THEMES.some((theme) => theme.id === value) ? (value as ThemeId) : DEFAULT_SETTINGS.theme;
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const recent = Array.isArray(parsed.recent)
      ? parsed.recent.filter((tag): tag is string => typeof tag === "string").slice(0, 20)
      : [];
    return {
      showSidecar: parsed.showSidecar !== false,
      frequentCount: clampCount(parsed.frequentCount ?? DEFAULT_SETTINGS.frequentCount),
      recentCount: clampCount(parsed.recentCount ?? DEFAULT_SETTINGS.recentCount),
      recent,
      theme: parseTheme(parsed.theme),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
