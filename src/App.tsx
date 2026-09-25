import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage, imageSrc, inTauri, loadUserConfig, pickFolder, renameImage, revealImage, saveUserConfig, scanDataset } from "./api";
import { CaptionSheet } from "./components/CaptionSheet";
import { ImageGrid } from "./components/ImageGrid";
import { fileParts, ImageMenu, RenameDialog } from "./components/ImageMenu";
import { ResizeEdges } from "./components/ResizeEdges";
import { SettingsDialog } from "./components/SettingsDialog";
import { StartScreen } from "./components/StartScreen";
import { TopBar } from "./components/TopBar";
import { WorkingSet } from "./components/WorkingSet";
import { buildSample } from "./sample";
import {
  DEFAULT_SETTINGS,
  LAST_FOLDER_KEY,
  loadFolderFilters,
  loadSettings,
  lookupFolderFilters,
  parseFolderFilters,
  parseGalleryView,
  readLegacyLocal,
  rememberFolderFilters,
  sameFilterTags,
  saveSettings,
  toUserConfig,
  type FolderFilters,
  type Settings,
} from "./settings";
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

function nextGalleryIndex(grid: HTMLElement | null, order: string[], focusId: string | null, key: string): number {
  const position = Math.max(0, order.indexOf(focusId ?? ""));
  if (grid?.querySelector(".masonry")) {
    const currentId = focusId && order.includes(focusId) ? focusId : order[position];
    const cells = [...grid.querySelectorAll<HTMLElement>(".cell[data-id]")].map((el) => {
      const box = el.getBoundingClientRect();
      return { id: el.dataset.id ?? "", x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    const current = cells.find((cell) => cell.id === currentId);
    if (!current) return position;
    const dx = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
    const dy = key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : 0;
    let bestId = "";
    let bestScore = Number.POSITIVE_INFINITY;
    for (const cell of cells) {
      if (cell.id === current.id) continue;
      const vx = cell.x - current.x;
      const vy = cell.y - current.y;
      if (dx && vx * dx <= 4) continue;
      if (dy && vy * dy <= 4) continue;
      const primary = dx ? vx * dx : vy * dy;
      const secondary = dx ? Math.abs(vy) : Math.abs(vx);
      const score = secondary * 2 + primary;
      if (score < bestScore) {
        bestScore = score;
        bestId = cell.id;
      }
    }
    const index = order.indexOf(bestId);
    return index >= 0 ? index : position;
  }
  const columns = grid
    ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length || 1
    : 1;
  if (key === "ArrowRight") return Math.min(order.length - 1, position + 1);
  if (key === "ArrowLeft") return Math.max(0, position - 1);
  if (key === "ArrowDown") return Math.min(order.length - 1, position + columns);
  if (key === "ArrowUp") return Math.max(0, position - columns);
  return position;
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
  const [error, setError] = useState("");
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => (inTauri() ? DEFAULT_SETTINGS : loadSettings()));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [focusToken, setFocusToken] = useState<{ selector: string; nonce: number } | null>(null);
  const [imageMenu, setImageMenu] = useState<{ x: number; y: number; imageId: string } | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  const imagesRef = useRef(images);
  const selectedRef = useRef(selected);
  const focusRef = useRef(focusId);
  const visibleRef = useRef<ImageItem[]>([]);
  const settingsOpenRef = useRef(false);
  const settingsRef = useRef(settings);
  const lastFolderRef = useRef<string | null>(null);
  const folderFiltersRef = useRef<Record<string, FolderFilters>>(inTauri() ? {} : loadFolderFilters());
  const configReadyRef = useRef(!inTauri());
  const captionBefore = useRef("");
  const gridRef = useRef<HTMLDivElement>(null);
  const loadTicket = useRef(0);
  imagesRef.current = images;
  selectedRef.current = selected;
  focusRef.current = focusId;
  settingsOpenRef.current = settingsOpen;
  settingsRef.current = settings;

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
  const menuImage = imageMenu ? images.find((image) => image.id === imageMenu.imageId) ?? null : null;
  const renameImageItem = renameId ? images.find((image) => image.id === renameId) ?? null : null;
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

  const persistConfig = useCallback((next: Settings, lastFolder: string | null) => {
    const folderFilters = folderFiltersRef.current;
    saveSettings(next, folderFilters);
    if (lastFolder) localStorage.setItem(LAST_FOLDER_KEY, lastFolder);
    if (!inTauri()) return;
    void saveUserConfig(toUserConfig(next, lastFolder, folderFilters)).catch((err) =>
      setError(errorMessage(err)),
    );
  }, []);

  useEffect(() => {
    if (!configReadyRef.current) return;
    persistConfig(settings, lastFolderRef.current);
  }, [settings, persistConfig]);

  useEffect(() => {
    if (!configReadyRef.current || !folder) return;
    const saved = lookupFolderFilters(folderFiltersRef.current, folder);
    if (
      saved &&
      sameFilterTags(saved.hasTags, hasTags) &&
      sameFilterTags(saved.missingTags, missingTags)
    ) {
      return;
    }
    folderFiltersRef.current = rememberFolderFilters(folderFiltersRef.current, folder, hasTags, missingTags);
    persistConfig(settingsRef.current, lastFolderRef.current);
  }, [folder, hasTags, missingTags, persistConfig]);

  useEffect(() => {
    if (!visible.length || !focusId) return;
    if (!visible.some((image) => image.id === focusId)) setFocusId(visible[0].id);
  }, [visible, focusId]);

  useEffect(() => {
    if (!focusToken) return;
    document.querySelector<HTMLElement>(focusToken.selector)?.focus();
  }, [focusToken]);

  const showImages = useCallback((nextFolder: string, nextImages: ImageItem[], unreadable = 0) => {
    const saved = lookupFolderFilters(folderFiltersRef.current, nextFolder);
    const restoredHas = saved?.hasTags ?? [];
    const restoredMissing = saved?.missingTags ?? [];
    const first =
      nextImages.find((image) =>
        imageVisible(image.name, image.caption, {
          query: "",
          needsCaption: false,
          hasTags: restoredHas,
          missingTags: restoredMissing,
        }),
      )?.id ?? null;
    setFolder(nextFolder);
    setImages(nextImages);
    setSelected(first ? new Set([first]) : new Set());
    setFocusId(first);
    setAnchorId(first);
    setQuery("");
    setOnlyEmpty(false);
    setHasTags(restoredHas);
    setMissingTags(restoredMissing);
    setReferenceIds([]);
    setImageMenu(null);
    setRenameId(null);
    setZoomed(false);
    setResetToken((token) => token + 1);
    if (unreadable > 0) {
      setError(`${countLabel(unreadable, "caption file", "caption files")} could not be read.`);
    } else {
      setError("");
    }
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
        lastFolderRef.current = nextFolder;
        if (configReadyRef.current) persistConfig(settingsRef.current, nextFolder);
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
    [flush, persistConfig, showImages],
  );

  useEffect(() => {
    if (!inTauri()) return;
    let cancelled = false;
    void (async () => {
      try {
        let { config, exists } = await loadUserConfig();
        if (!exists) {
          const legacy = readLegacyLocal();
          if (legacy) {
            await saveUserConfig(legacy);
            config = legacy;
          }
        }
        if (cancelled) return;
        lastFolderRef.current = config.lastFolder;
        folderFiltersRef.current = {
          ...parseFolderFilters(config.folderFilters),
          ...loadFolderFilters(),
        };
        setSettings({
          showSidecar: config.showSidecar,
          galleryView: parseGalleryView(config.galleryView),
          frequentCount: config.frequentCount,
          recentCount: config.recentCount,
          recent: config.recent,
        });
        configReadyRef.current = true;
        if (config.lastFolder) void loadFolder(config.lastFolder);
      } catch (err) {
        if (cancelled) return;
        configReadyRef.current = true;
        setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFolder]);

  async function openFolder() {
    if (!inTauri()) {
      showImages("Sample dataset", buildSample());
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

  function commit(next: ImageItem[]) {
    const previous = new Map(imagesRef.current.map((image) => [image.id, image.caption]));
    const dirty = next.filter((image) => previous.get(image.id) !== image.caption);
    setImages(next);
    if (dirty.length) {
      void saveNow(dirty.map((image) => ({ path: image.captionPath, text: image.caption })));
    }
  }

  function addReference(id: string) {
    if (!imagesRef.current.some((image) => image.id === id)) return;
    setReferenceIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }

  function addTag(raw: string) {
    const incoming = parseTags(raw);
    if (!incoming.length) return;
    for (const tag of incoming) remember(tag);
    const target = new Set(selectedRef.current);
    const focusNow = focusRef.current;
    if (target.size === 0 && focusNow) {
      target.add(focusNow);
      setSelected(target);
      setAnchorId(focusNow);
    }
    if (target.size === 0) return;
    const next = imagesRef.current.map((image) => {
      if (!target.has(image.id)) return image;
      const tags = parseTags(image.caption);
      const added = incoming.filter((tag) => !tags.includes(tag));
      if (!added.length) return image;
      return { ...image, caption: joinTags([...tags, ...added]) };
    });
    commit(next);
  }

  function removeTag(tag: string) {
    const next = imagesRef.current.map((image) => {
      if (!selectedRef.current.has(image.id)) return image;
      const tags = parseTags(image.caption);
      if (!tags.includes(tag)) return image;
      return { ...image, caption: joinTags(tags.filter((item) => item !== tag)) };
    });
    commit(next);
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
    commit(next);
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
    commit(next);
    queueFocus(`[data-chip="${to}"]`);
  }

  function removeChip(index: number) {
    const id = [...selectedRef.current][0];
    if (!id) return;
    const next = imagesRef.current.map((image) => {
      if (image.id !== id) return image;
      return { ...image, caption: joinTags(parseTags(image.caption).filter((_, chip) => chip !== index)) };
    });
    commit(next);
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
  }

  function zoomImage(id: string) {
    setSelected(new Set([id]));
    setAnchorId(id);
    setFocusId(id);
    setZoomed(true);
  }

  function openImageMenu(imageId: string, x: number, y: number) {
    setSelected((current) => (current.has(imageId) ? current : new Set([imageId])));
    setAnchorId(imageId);
    setFocusId(imageId);
    setImageMenu({ x, y, imageId });
  }

  function applyRenamed(
    fromId: string,
    next: { name: string; path: string; captionPath: string; src: string },
  ) {
    setImages((current) =>
      current.map((image) => (image.id === fromId ? { ...image, id: next.path, ...next } : image)),
    );
    const mapId = (value: string) => (value === fromId ? next.path : value);
    setSelected((current) => new Set([...current].map(mapId)));
    setFocusId((current) => (current === fromId ? next.path : current));
    setAnchorId((current) => (current === fromId ? next.path : current));
    setReferenceIds((ids) => ids.map(mapId));
  }

  function replaceFileName(path: string, fileName: string) {
    const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    return slash >= 0 ? `${path.slice(0, slash + 1)}${fileName}` : fileName;
  }

  async function submitRename(stem: string) {
    const image = imagesRef.current.find((item) => item.id === renameId);
    if (!image) return;
    const { ext } = fileParts(image.name);
    const fileName = `${stem}${ext}`;
    const name = replaceFileName(image.name, fileName);
    if (imagesRef.current.some((item) => item.id !== image.id && item.name === name)) {
      throw new Error("An image with that name already exists.");
    }
    if (inTauri()) {
      const saved = await flush();
      if (!saved) throw new Error("Could not save the caption before renaming.");
      try {
        const renamed = await renameImage(image.path, fileName);
        applyRenamed(image.id, {
          name: renamed.name,
          path: renamed.path,
          captionPath: renamed.captionPath,
          src: imageSrc(renamed.path),
        });
      } catch (err) {
        throw new Error(errorMessage(err));
      }
    } else {
      applyRenamed(image.id, {
        name,
        path: replaceFileName(image.path, fileName),
        captionPath: replaceFileName(image.captionPath, `${stem}.txt`),
        src: image.src,
      });
    }
    setRenameId(null);
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Could not copy to the clipboard.");
    }
  }

  async function pasteTags() {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setError("Could not read the clipboard.");
      return;
    }
    const incoming = parseTags(text);
    if (!incoming.length) {
      setError("The clipboard has no tags.");
      return;
    }
    const target = new Set(selectedRef.current);
    if (!target.size && focusRef.current) target.add(focusRef.current);
    if (!target.size) return;
    for (const tag of incoming) remember(tag);
    const next = imagesRef.current.map((image) => {
      if (!target.has(image.id)) return image;
      const tags = parseTags(image.caption);
      const added = incoming.filter((tag) => !tags.includes(tag));
      if (!added.length) return image;
      return { ...image, caption: joinTags([...tags, ...added]) };
    });
    commit(next);
  }

  function applyPreset(preset: "all" | "empty") {
    setQuery("");
    setHasTags([]);
    setMissingTags([]);
    setOnlyEmpty(preset === "empty");
    setResetToken((token) => token + 1);
    if (preset === "all") {
      setSelected(new Set());
      return;
    }
    const ids = imagesRef.current.filter((image) => needsCaption(image.caption)).map((image) => image.id);
    setSelected(new Set(ids));
    if (ids[0]) {
      setFocusId(ids[0]);
      setAnchorId(ids[0]);
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (settingsOpenRef.current || target?.closest("input, textarea, .chip, .trow, dialog")) return;
      if (event.key === "Escape") {
        setSelected(new Set());
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
        return;
      }
      const order = visibleRef.current.map((image) => image.id);
      if (!order.length) return;
      if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(event.key)) return;
      const next = nextGalleryIndex(gridRef.current, order, focusRef.current, event.key);
      event.preventDefault();
      const id = order[next];
      if (!id) return;
      setSelected(new Set([id]));
      setAnchorId(id);
      setFocusId(id);
      document.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <ResizeEdges />
      <TopBar
        folder={folder}
        busy={busy}
        onOpen={() => void openFolder()}
        onSettings={() => setSettingsOpen(true)}
      />
      {!folder ? (
        <StartScreen busy={busy} onOpen={() => void openFolder()} />
      ) : (
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
          onQuery={setQuery}
          onPreset={applyPreset}
          onAddFilter={(kind, raw) => {
            const tag = normTag(raw);
            if (!tag) return;
            if (kind === "has") {
              setHasTags(hasTags.includes(tag) ? hasTags : [...hasTags, tag]);
            } else {
              setMissingTags(missingTags.includes(tag) ? missingTags : [...missingTags, tag]);
            }
          }}
          onRemoveFilter={(kind, tag) => {
            if (kind === "has") setHasTags(hasTags.filter((item) => item !== tag));
            else setMissingTags(missingTags.filter((item) => item !== tag));
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
          galleryView={settings.galleryView}
          busy={busy}
          onOpen={() => void openFolder()}
          onSelect={onSelect}
          onAddReference={addReference}
          onImageMenu={openImageMenu}
          onZoom={zoomImage}
          onSelectShown={() => {
            const ids = visible.map((image) => image.id);
            setSelected(new Set(ids));
            if (ids[0]) {
              setFocusId(ids[0]);
              setAnchorId(ids[0]);
            }
          }}
          onClear={() => {
            setSelected(new Set());
          }}
        />
        <CaptionSheet
          images={images}
          selected={selected}
          focus={focus}
          showSidecar={settings.showSidecar}
          references={referenceIds.flatMap((id) => {
            const image = images.find((item) => item.id === id);
            return image ? [image] : [];
          })}
          recentCount={settings.recentCount}
          recent={settings.recent}
          error={error}
          onAddTag={addTag}
          onRemoveTag={removeTag}
          onReorderShared={reorderShared}
          onReorderSingle={reorderSingle}
          onRemoveChip={removeChip}
          onAddReference={addReference}
          onRemoveReference={(id) => setReferenceIds((ids) => ids.filter((item) => item !== id))}
          onCaptionChange={(value) => {
            const id = focusRef.current;
            if (!id) return;
            const current = imagesRef.current.find((image) => image.id === id);
            if (!current) return;
            setImages((previous) => previous.map((image) => (image.id === id ? { ...image, caption: value } : image)));
            saveSoon(current.captionPath, value);
          }}
          onImageMenu={openImageMenu}
          zoomed={zoomed}
          onZoom={() => setZoomed(true)}
          onCloseZoom={() => setZoomed(false)}
          onCaptionFocus={() => {
            captionBefore.current = focus?.caption ?? "";
          }}
          onCaptionBlur={() => {
            const current = imagesRef.current.find((image) => image.id === focusRef.current);
            if (current) rememberAdded(parseTags(captionBefore.current), parseTags(current.caption));
            void flush();
          }}
        />
      </div>
      )}
      <datalist id="vocab">
        {vocab.map((tag) => (
          <option key={tag} value={pretty(tag)} />
        ))}
      </datalist>
      {menuImage && imageMenu && (
        <ImageMenu
          x={imageMenu.x}
          y={imageMenu.y}
          image={menuImage}
          selectedCount={selected.size}
          canReveal={inTauri()}
          isReference={referenceIds.includes(menuImage.id)}
          onClose={() => setImageMenu(null)}
          onRename={() => {
            setRenameId(menuImage.id);
            setImageMenu(null);
          }}
          onReveal={() => {
            const path = menuImage.path;
            setImageMenu(null);
            void revealImage(path).catch((err) => setError(errorMessage(err)));
          }}
          onCopyTags={() => {
            const caption = menuImage.caption;
            setImageMenu(null);
            void copyText(caption);
          }}
          onPasteTags={() => {
            setImageMenu(null);
            void pasteTags();
          }}
          onCopyFilename={() => {
            const slash = Math.max(menuImage.name.lastIndexOf("/"), menuImage.name.lastIndexOf("\\"));
            const filename = slash >= 0 ? menuImage.name.slice(slash + 1) : menuImage.name;
            setImageMenu(null);
            void copyText(filename);
          }}
          onCopyPath={() => {
            const path = menuImage.path;
            setImageMenu(null);
            void copyText(path);
          }}
          onAddReference={() => {
            addReference(menuImage.id);
            setImageMenu(null);
          }}
        />
      )}
      {renameImageItem && (
        <RenameDialog image={renameImageItem} onClose={() => setRenameId(null)} onSubmit={submitRename} />
      )}
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onChange={setSettings}
      />
    </div>
  );
}
