export const TAG_COLORS = {
  character: "#1b7a43",
  copyright: "#7a3e9d",
  artist: "#c4492c",
  general: "#3e5c86",
  meta: "#a56b12",
} as const;

export type TagCategory = keyof typeof TAG_COLORS;

const META = new Set([
  "simple_background",
  "white_background",
  "grey_background",
  "gray_background",
  "transparent_background",
  "outdoors",
  "indoors",
  "night",
  "day",
  "from_behind",
  "upper_body",
  "full_body",
  "portrait",
  "close-up",
  "close_up",
  "cowboy_shot",
  "rating_safe",
  "rating_questionable",
  "rating_explicit",
]);

export function categoryOf(tag: string): TagCategory {
  const name = tag.toLowerCase();
  if (name.startsWith("rating_") || name.startsWith("score_") || META.has(name)) return "meta";
  return "general";
}

export function pretty(tag: string): string {
  return tag.replace(/_/g, " ");
}

export function normTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/,/g, "");
}

export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(",")) {
    const tag = normTag(part);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function joinTags(tags: readonly string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out.join(", ");
}

export function sidecarName(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  return `${stem}.txt`;
}

export function needsCaption(caption: string): boolean {
  return !caption.trim();
}

export type WorkingFilters = {
  query: string;
  needsCaption: boolean;
  hasTags: readonly string[];
  missingTags: readonly string[];
};

export function imageVisible(name: string, caption: string, filters: WorkingFilters): boolean {
  const tags = parseTags(caption);
  if (filters.needsCaption && !needsCaption(caption)) return false;
  const query = filters.query.trim().toLowerCase();
  if (query) {
    const queryTag = normTag(filters.query);
    const hay = `${name} ${tags.join(" ")} ${tags.map(pretty).join(" ")}`.toLowerCase();
    if (!hay.includes(query) && !hay.includes(queryTag)) return false;
  }
  if (!filters.hasTags.every((tag) => tags.includes(tag))) return false;
  if (!filters.missingTags.every((tag) => !tags.includes(tag))) return false;
  return true;
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function tagLedger(captions: readonly string[], focusCaption: string): {
  shared: string[];
  partial: { tag: string; count: number }[];
} {
  const total = captions.length;
  const counts = new Map<string, number>();
  for (const caption of captions) {
    for (const tag of new Set(parseTags(caption))) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const sharedSet = new Set(
    [...counts.entries()].filter(([, count]) => count === total).map(([tag]) => tag),
  );
  const shared = parseTags(focusCaption).filter((tag) => sharedSet.has(tag));
  for (const tag of sharedSet) {
    if (!shared.includes(tag)) shared.push(tag);
  }
  const partial = [...counts.entries()]
    .filter(([, count]) => count !== total)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return { shared, partial };
}

export function applySharedOrder(caption: string, nextShared: readonly string[]): string {
  const tags = parseTags(caption);
  const shared = new Set(nextShared);
  const present = nextShared.filter((tag) => tags.includes(tag));
  let index = 0;
  return joinTags(
    tags.map((tag) => {
      if (!shared.has(tag)) return tag;
      const replacement = present[index];
      index += 1;
      return replacement ?? tag;
    }),
  );
}

export function frequentTags(captions: readonly string[], skip: ReadonlySet<string>, limit: number): string[] {
  if (limit <= 0) return [];
  const counts = new Map<string, number>();
  for (const caption of captions) {
    for (const tag of parseTags(caption)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([tag]) => !skip.has(tag))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

export function clampCount(value: string | number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(20, Math.max(0, n));
}
