import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage, imageSrc, inTauri, pickFolder, scanDataset } from "./api";
import { CaptionSheet } from "./components/CaptionSheet";
import { ImageGrid } from "./components/ImageGrid";
import { SettingsDialog } from "./components/SettingsDialog";
import { TopBar } from "./components/TopBar";
import { WorkingSet } from "./components/WorkingSet";
import { buildSample } from "./sample";
import { LAST_FOLDER_KEY, loadSettings, saveSettings, type Settings } from "./settings";
import {
  applySharedOrder,
  imageVisible,
  joinTags,
  moveItem,
  needsCaption,
  normTag,
  parseTags,
  pretty,
  tagLedger,
} from "./tags";
import type { ImageItem } from "./types";
import { useCaptionSaver } from "./useCaptionSaver";
import "./App.css";

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [hasTags, setHasTags] = useState<string[]>([]);
  const [missingTags, setMissingTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [focusToken, setFocusToken] = useState<{ selector: string; nonce: number } | null>(null);

  const imagesRef = useRef(images);
  const selectedRef = useRef(selected);
  const focusRef = useRef(focusId);
  const visibleRef = useRef<ImageItem[]>([]);
  const settingsOpenRef = useRef(false);
  const captionBefore = useRef("");
  const editGen = useRef(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const loadTicket = useRef(0);
  imagesRef.current = images;
  selectedRef.current = selected;
  focusRef.current = focusId;
  settingsOpenRef.current = settingsOpen;

  const { saveSoon, saveNow, flush } = useCaptionSaver(setError);

  const filters = useMemo(
    () => ({ query, needsCaption: onlyEmpty, hasTags, missingTags }),
    [query, onlyEmpty, hasTags, missingTags],
  );
  const visible = useMemo(
    () => images.filter((image) => imageVisible(image.name, image.caption, filters)),
    [images, filters],
  );
  visibleRef.current = visible;

  const focus = images.find((image) => image.id === focusId) ?? null;
  const captioned = images.filter((image) => !needsCaption(image.caption)).length;
  const emptyCount = images.length - captioned;
  const filtersPlain = !query.trim() && hasTags.length === 0 && missingTags.length === 0;
  const activePreset = filtersPlain ? (onlyEmpty ? "empty" : "all") : "";
  const shownIds = useMemo(() => new Set(visible.map((image) => image.id)), [visible]);
  const hiddenSelected = [...selected].filter((id) => !shownIds.has(id)).length;
  const hiddenNote = !folder
    ? ""
    : hiddenSelected
      ? `${countLabel(hiddenSelected, "selected image is", "selected images are")} hidden by the working set`
      : `${selected.size} selected`;

  const vocab = useMemo(() => {
    const tags = new Set<string>();
    for (const image of images) parseTags(image.caption).forEach((tag) => tags.add(tag));
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [images]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!visible.length || !focusId) return;
    if (!visible.some((image) => image.id === focusId)) setFocusId(visible[0].id);
  }, [visible, focusId]);

  useEffect(() => {
    if (!focusToken) return;
    document.querySelector<HTMLElement>(focusToken.selector)?.focus();
  }, [focusToken]);

  const showImages = useCallback((nextFolder: string, nextImages: ImageItem[], unreadable = 0) => {
    const first = nextImages[0]?.id ?? null;
    setFolder(nextFolder);
    setImages(nextImages);
    setSelected(first ? new Set([first]) : new Set());
    setFocusId(first);
    setAnchorId(first);
    setQuery("");
    setOnlyEmpty(false);
    setHasTags([]);
    setMissingTags([]);
    setResetToken((token) => token + 1);
    if (unreadable > 0) {
      setError(`${countLabel(unreadable, "caption file", "caption files")} could not be read.`);
    } else {
      setError("");
    }
    setNote(nextImages.length ? countLabel(nextImages.length, "image", "images") : "No images in this folder.");
  }, []);

  const loadFolder = useCallback(
    async (nextFolder: string) => {
      const ticket = ++loadTicket.current;
      setBusy(true);
      setError("");
      try {
        await flush();
        const result = await scanDataset(nextFolder);
        if (ticket !== loadTicket.current) return;
        localStorage.setItem(LAST_FOLDER_KEY, nextFolder);
        showImages(
          nextFolder,
          result.images.map((record) => ({
            id: record.path,
            name: record.name,
            path: record.path,
            captionPath: record.captionPath,
            caption: record.caption,
            src: imageSrc(record.path),
          })),
          result.unreadable,
        );
      } catch (err) {
        if (ticket === loadTicket.current) setError(errorMessage(err));
      } finally {
        if (ticket === loadTicket.current) setBusy(false);
      }
    },
    [flush, showImages],
  );

  useEffect(() => {
    if (!inTauri()) return;
    const last = localStorage.getItem(LAST_FOLDER_KEY);
    if (last) void loadFolder(last);
  }, [loadFolder]);

  async function openFolder() {
    if (!inTauri()) {
      showImages("Sample dataset", buildSample());
      setNote("Sample dataset. The desktop app opens a real folder.");
      return;
    }
    try {
      const picked = await pickFolder();
      if (picked) await loadFolder(picked);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function remember(tag: string) {
    const clean = normTag(tag);
    if (!clean) return;
    setSettings((current) => ({
      ...current,
      recent: [clean, ...current.recent.filter((item) => item !== clean)].slice(0, 20),
    }));
  }

  function rememberAdded(before: string[], after: string[]) {
    const had = new Set(before);
    for (const tag of after) {
      if (!had.has(tag)) remember(tag);
    }
  }

  function commit(next: ImageItem[], message: string) {
    const previous = new Map(imagesRef.current.map((image) => [image.id, image.caption]));
    const dirty = next.filter((image) => previous.get(image.id) !== image.caption);
    setImages(next);
    if (dirty.length) {
      void saveNow(dirty.map((image) => ({ path: image.captionPath, text: image.caption })));
    }
    setNote(message);
  }

  function addTag(raw: string) {
    const clean = normTag(raw);
    if (!clean) return;
    remember(clean);
    const target = new Set(selectedRef.current);
    const focusNow = focusRef.current;
    if (target.size === 0 && focusNow) {
      target.add(focusNow);
      setSelected(target);
      setAnchorId(focusNow);
    }
    if (target.size === 0) return;
    let changed = 0;
    const next = imagesRef.current.map((image) => {
      if (!target.has(image.id)) return image;
      const tags = parseTags(image.caption);
      if (tags.includes(clean)) return image;
      changed += 1;
      return { ...image, caption: joinTags([...tags, clean]) };
    });
    commit(
      next,
      changed
        ? `Added ${pretty(clean)} to ${countLabel(changed, "image", "images")}`
        : `${pretty(clean)} is already on the selection`,
    );
  }

  function removeTag(tag: string) {
    let changed = 0;
    const next = imagesRef.current.map((image) => {
      if (!selectedRef.current.has(image.id)) return image;
      const tags = parseTags(image.caption);
      if (!tags.includes(tag)) return image;
      changed += 1;
      return { ...image, caption: joinTags(tags.filter((item) => item !== tag)) };
    });
    commit(next, `Removed ${pretty(tag)} from ${countLabel(changed, "image", "images")}`);
  }

  function replaceTags(fromRaw: string, toRaw: string) {
    const from = normTag(fromRaw);
    const to = normTag(toRaw);
    if (!from || !to || from === to || selectedRef.current.size < 2) return;
    let changed = 0;
    const next = imagesRef.current.map((image) => {
      if (!selectedRef.current.has(image.id)) return image;
      const tags = parseTags(image.caption);
      if (!tags.includes(from)) return image;
      changed += 1;
      return { ...image, caption: joinTags(tags.map((tag) => (tag === from ? to : tag))) };
    });
    if (changed) remember(to);
    commit(
      next,
      changed
        ? `Replaced ${pretty(from)} on ${countLabel(changed, "image", "images")}`
        : `No selected image has ${pretty(from)}`,
    );
  }

  function queueFocus(selector: string) {
    setFocusToken((current) => ({ selector, nonce: (current?.nonce ?? 0) + 1 }));
  }

  function reorderShared(from: number, to: number) {
    const ids = [...selectedRef.current];
    if (ids.length < 2) return;
    const byId = new Map(imagesRef.current.map((image) => [image.id, image]));
    const captions = ids.map((id) => byId.get(id)?.caption ?? "");
    const focusCaption = selectedRef.current.has(focusRef.current ?? "")
      ? byId.get(focusRef.current ?? "")?.caption ?? captions[0] ?? ""
      : captions[0] ?? "";
    const nextShared = moveItem(tagLedger(captions, focusCaption).shared, from, to);
    const next = imagesRef.current.map((image) =>
      selectedRef.current.has(image.id)
        ? { ...image, caption: applySharedOrder(image.caption, nextShared) }
        : image,
    );
    commit(next, "Reordered tags");
    const moved = nextShared[to];
    if (moved) queueFocus(`[data-shared="${CSS.escape(moved)}"]`);
  }

  function reorderSingle(from: number, to: number) {
    const id = [...selectedRef.current][0];
    if (!id) return;
    const next = imagesRef.current.map((image) => {
      if (image.id !== id) return image;
      return { ...image, caption: joinTags(moveItem(parseTags(image.caption), from, to)) };
    });
    commit(next, "Reordered tags");
    queueFocus(`[data-chip="${to}"]`);
  }

  function removeChip(index: number) {
    const id = [...selectedRef.current][0];
    if (!id) return;
    const next = imagesRef.current.map((image) => {
      if (image.id !== id) return image;
      return { ...image, caption: joinTags(parseTags(image.caption).filter((_, chip) => chip !== index)) };
    });
    commit(next, "Saved");
  }

  function onSelect(id: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
    const order = visibleRef.current.map((image) => image.id);
    let next = new Set(selectedRef.current);
    if (event.shiftKey) {
      const anchor = anchorId ?? focusRef.current;
      const start = order.indexOf(anchor ?? "");
      const end = order.indexOf(id);
      if (start === -1 || end === -1) next = new Set([id]);
      else {
        if (!event.ctrlKey && !event.metaKey) next = new Set();
        const [lo, hi] = start < end ? [start, end] : [end, start];
        for (let index = lo; index <= hi; index += 1) next.add(order[index]);
      }
    } else if (event.ctrlKey || event.metaKey) {
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setAnchorId(id);
    } else {
      next = new Set([id]);
      setAnchorId(id);
    }
    setSelected(next);
    setFocusId(id);
    setNote(next.size ? `${next.size} selected` : "Nothing selected");
  }

  function applyPreset(preset: "all" | "empty") {
    setQuery("");
    setHasTags([]);
    setMissingTags([]);
    setOnlyEmpty(preset === "empty");
    setResetToken((token) => token + 1);
    if (preset === "all") {
      setSelected(new Set());
      setNote("Nothing selected");
      return;
    }
    const ids = imagesRef.current.filter((image) => needsCaption(image.caption)).map((image) => image.id);
    setSelected(new Set(ids));
    if (ids[0]) {
      setFocusId(ids[0]);
      setAnchorId(ids[0]);
    }
    setNote(`${ids.length} selected`);
  }

  function shownAfter(next: Partial<{ query: string; onlyEmpty: boolean; hasTags: string[]; missingTags: string[] }>) {
    const count = images.filter((image) =>
      imageVisible(image.name, image.caption, {
        query: next.query ?? query,
        needsCaption: next.onlyEmpty ?? onlyEmpty,
        hasTags: next.hasTags ?? hasTags,
        missingTags: next.missingTags ?? missingTags,
      }),
    ).length;
    setNote(`${count} shown`);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (settingsOpenRef.current || target?.closest("input, textarea, .chip, .trow, dialog")) return;
      if (event.key === "Escape") {
        setSelected(new Set());
        setNote("Nothing selected");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const ids = visibleRef.current.map((image) => image.id);
        setSelected(new Set(ids));
        if (ids[0]) {
          setFocusId(ids[0]);
          setAnchorId(ids[0]);
        }
        setNote(`${ids.length} selected`);
        return;
      }
      const order = visibleRef.current.map((image) => image.id);
      if (!order.length) return;
      const columns = gridRef.current
        ? getComputedStyle(gridRef.current).gridTemplateColumns.split(" ").length || 1
        : 1;
      const position = Math.max(0, order.indexOf(focusRef.current ?? ""));
      let next = position;
      if (event.key === "ArrowRight") next = Math.min(order.length - 1, position + 1);
      else if (event.key === "ArrowLeft") next = Math.max(0, position - 1);
      else if (event.key === "ArrowDown") next = Math.min(order.length - 1, position + columns);
      else if (event.key === "ArrowUp") next = Math.max(0, position - columns);
      else return;
      event.preventDefault();
      const id = order[next];
      if (!id) return;
      setSelected(new Set([id]));
      setAnchorId(id);
      setFocusId(id);
      setNote("1 selected");
      document.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app" data-theme={settings.theme}>
      <TopBar
        folder={folder}
        captioned={captioned}
        total={images.length}
        busy={busy}
        onOpen={() => void openFolder()}
        onSettings={() => setSettingsOpen(true)}
      />
      <div className="body">
        <WorkingSet
          total={images.length}
          shown={visible.length}
          emptyCount={emptyCount}
          query={query}
          hasTags={hasTags}
          missingTags={missingTags}
          activePreset={folder ? activePreset : ""}
          resetToken={resetToken}
          onQuery={(value) => {
            setQuery(value);
            shownAfter({ query: value });
          }}
          onPreset={applyPreset}
          onAddFilter={(kind, raw) => {
            const tag = normTag(raw);
            if (!tag) return;
            if (kind === "has") {
              const next = hasTags.includes(tag) ? hasTags : [...hasTags, tag];
              setHasTags(next);
              shownAfter({ hasTags: next });
            } else {
              const next = missingTags.includes(tag) ? missingTags : [...missingTags, tag];
              setMissingTags(next);
              shownAfter({ missingTags: next });
            }
          }}
          onRemoveFilter={(kind, tag) => {
            if (kind === "has") {
              const next = hasTags.filter((item) => item !== tag);
              setHasTags(next);
              shownAfter({ hasTags: next });
            } else {
              const next = missingTags.filter((item) => item !== tag);
              setMissingTags(next);
              shownAfter({ missingTags: next });
            }
          }}
        />
        <ImageGrid
          gridRef={gridRef}
          folder={folder}
          images={images}
          visible={visible}
          selected={selected}
          focusId={focusId}
          hiddenNote={hiddenNote}
          busy={busy}
          onOpen={() => void openFolder()}
          onSelect={onSelect}
          onSelectShown={() => {
            const ids = visible.map((image) => image.id);
            setSelected(new Set(ids));
            if (ids[0]) {
              setFocusId(ids[0]);
              setAnchorId(ids[0]);
            }
            setNote(`${ids.length} selected`);
          }}
          onClear={() => {
            setSelected(new Set());
            setNote("Nothing selected");
          }}
        />
        <CaptionSheet
          images={images}
          selected={selected}
          focus={focus}
          showSidecar={settings.showSidecar}
          frequentCount={settings.frequentCount}
          recentCount={settings.recentCount}
          recent={settings.recent}
          note={note}
          error={error}
          onAddTag={addTag}
          onRemoveTag={removeTag}
          onReplace={replaceTags}
          onReorderShared={reorderShared}
          onReorderSingle={reorderSingle}
          onRemoveChip={removeChip}
          onCaptionChange={(value) => {
            const id = focusRef.current;
            if (!id) return;
            const current = imagesRef.current.find((image) => image.id === id);
            if (!current) return;
            editGen.current += 1;
            setImages((previous) => previous.map((image) => (image.id === id ? { ...image, caption: value } : image)));
            saveSoon(current.captionPath, value);
            setNote("Unsaved");
          }}
          onCaptionFocus={() => {
            captionBefore.current = focus?.caption ?? "";
          }}
          onCaptionBlur={() => {
            const generation = editGen.current;
            const current = imagesRef.current.find((image) => image.id === focusRef.current);
            if (current) rememberAdded(parseTags(captionBefore.current), parseTags(current.caption));
            void flush().then((ok) => {
              if (ok && editGen.current === generation) {
                setNote((currentNote) => (currentNote === "Unsaved" ? "Saved" : currentNote));
              }
            });
          }}
        />
      </div>
      <datalist id="vocab">
        {vocab.map((tag) => (
          <option key={tag} value={pretty(tag)} />
        ))}
      </datalist>
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onChange={setSettings}
      />
    </div>
  );
}
