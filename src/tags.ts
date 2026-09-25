export function normTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/_\(/g, " (")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function captionTag(tag: string): string {
  return tag.replace(/\(/g, "\\(").replace(/\)/g, "\\)");
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
    const clean = normTag(tag);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(captionTag(clean));
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
    const hay = `${name} ${tags.join(" ")}`.toLowerCase();
    const queryTag = normTag(query);
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

export function clampCount(value: string | number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(20, Math.max(0, n));
}
