import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type KeyboardEvent, type PointerEvent } from "react";
import { TagMenu } from "./ImageMenu";
import {
  categoryOf,
  compileColorRules,
  needsCaption,
  parseTags,
  pretty,
  sidecarName,
  tagLedger,
} from "../tags";
import { GALLERY_DRAG_TYPE, type ImageItem } from "../types";

type TagFilterKind = "has" | "missing" | "only";

type CaptionSheetProps = {
  images: readonly ImageItem[];
  selected: ReadonlySet<string>;
  focus: ImageItem | null;
  showSidecar: boolean;
  coloredTags: readonly string[];
  colorRules: readonly string[];
  references: readonly ImageItem[];
  recentCount: number;
  recent: readonly string[];
  error: string;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onReorderShared: (from: number, to: number) => void;
  onReorderSingle: (from: number, to: number) => void;
  onRemoveChip: (index: number) => void;
  onAddReference: (id: string) => void;
  onRemoveReference: (id: string) => void;
  onCaptionChange: (value: string) => void;
  onCaptionFocus: () => void;
  onCaptionBlur: () => void;
  onImageMenu: (id: string, x: number, y: number) => void;
  hasTags: readonly string[];
  onFilterTag: (kind: TagFilterKind, tag: string) => void;
  onCopyTag: (tag: string) => void;
  zoomed: boolean;
  onZoom: () => void;
  onCloseZoom: () => void;
};

export function CaptionSheet({
  images,
  selected,
  focus,
  showSidecar,
  coloredTags,
  colorRules,
  references,
  recentCount,
  recent,
  error,
  onAddTag,
  onRemoveTag,
  onReorderShared,
  onReorderSingle,
  onRemoveChip,
  onAddReference,
  onRemoveReference,
  onCaptionChange,
  onCaptionFocus,
  onCaptionBlur,
  onImageMenu,
  hasTags,
  onFilterTag,
  onCopyTag,
  zoomed,
  onZoom,
  onCloseZoom,
}: CaptionSheetProps) {
  const selectedImages = images.filter((image) => selected.has(image.id));
  const count = selectedImages.length;
  const who = count === 0 ? "Nothing selected" : count === 1 ? "Selected image" : `${count} images`;
  const focusCaption = selected.has(focus?.id ?? "") ? focus?.caption ?? "" : selectedImages[0]?.caption ?? "";
  const ledger = count > 1 ? tagLedger(selectedImages.map((image) => image.caption), focusCaption) : null;
  const singleTags = count === 1 ? parseTags(selectedImages[0].caption) : [];
  const ownedTags = new Set(count === 1 ? singleTags : (ledger?.shared ?? []));

  const [recentOpen, setRecentOpen] = useState(true);
  const zoomRef = useRef<HTMLDialogElement>(null);
  const colored = useMemo(() => new Set(coloredTags), [coloredTags]);
  const rules = useMemo(() => compileColorRules(colorRules), [colorRules]);
  const meta = (tag: string) => categoryOf(tag, colored, rules) === "meta";
  const recentTags = recent.slice(0, recentCount);
  const referenceTags = referenceTagList(references);

  useEffect(() => {
    if ((!focus || count === 0) && zoomed) onCloseZoom();
  }, [focus, count, zoomed, onCloseZoom]);

  useEffect(() => {
    const dialog = zoomRef.current;
    if (!dialog) return;
    if (zoomed && focus && !dialog.open) dialog.show();
    if (!zoomed && dialog.open) dialog.close();
  }, [zoomed, focus]);

  useEffect(() => {
    if (!zoomed) return undefined;
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCloseZoom();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [zoomed, onCloseZoom]);

  return (
    <aside className="sheet" aria-label="Edit captions">
      {count > 0 && focus && (
      <div
        className="preview"
        onContextMenu={(event) => {
          event.preventDefault();
          onImageMenu(focus.id, event.clientX, event.clientY);
        }}
      >
        <button
          type="button"
          className="thumb"
          aria-label={`Zoom ${focus.name}`}
          onClick={onZoom}
        >
          <img src={focus.src} alt="" />
        </button>
        <div>
          <div className="name" title={focus.path}>{focus.name}</div>
          <div className="who">{who}</div>
        </div>
      </div>
      )}
      {count > 0 && focus && zoomed && <div className="scrim zoom-scrim" />}
      {count > 0 && focus && (
        <dialog
          ref={zoomRef}
          className="zoom"
          aria-label={focus.name}
          onClick={(event) => {
            if (event.target === event.currentTarget) onCloseZoom();
          }}
          onClose={onCloseZoom}
        >
          <button
            type="button"
            className="zoom-shot"
            aria-label="Close zoom"
            onClick={onCloseZoom}
            onContextMenu={(event) => {
              event.preventDefault();
              onImageMenu(focus.id, event.clientX, event.clientY);
            }}
          >
            <img src={focus.src} alt="" />
          </button>
        </dialog>
      )}
      <div className="sheet-scroll">
        {error && (
          <p className="sheet-error" role="alert">
            {error}
          </p>
        )}
        {count === 0 ? (
          <FolderStats
            images={images}
            hasTags={hasTags}
            isMeta={meta}
            onFilterTag={onFilterTag}
            onCopyTag={onCopyTag}
          />
        ) : (
          <>
        {ledger && (
          <div className="own-tags">
            {ledger.shared.length === 0 && ledger.partial.length === 0 && (
              <p className="lede">None of the selected images have a caption yet.</p>
            )}
            {ledger.shared.length > 0 && (
              <>
                <div className="section">On every image. Drag to reorder.</div>
                <div className="reorder">
                {ledger.shared.map((tag, index) => (
                  <div
                    key={tag}
                    className={meta(tag) ? "trow" : "trow plain"}
                    data-shared={tag}
                    {...reorderHandlers(index, ledger.shared.length, false, onReorderShared)}
                  >
                    {meta(tag) && (
                      <i className="swatch meta" />
                    )}
                    <span className="tagname">{pretty(tag)}</span>
                    <span className="tagops">
                      <span className="frac">
                        {count}/{count}
                      </span>
                      <button className="quiet" type="button" onClick={() => onRemoveTag(tag)}>
                        Remove
                      </button>
                    </span>
                  </div>
                ))}
                </div>
              </>
            )}
            {ledger.partial.length > 0 && (
              <>
                <div className="section">On some</div>
                {ledger.partial.map(({ tag, count: have }) => (
                  <div className={meta(tag) ? "trow" : "trow plain"} key={tag}>
                    {meta(tag) && (
                      <i className="swatch meta" />
                    )}
                    <span className="tagname">{pretty(tag)}</span>
                    <span className="tagops">
                      <span className="frac">
                        {have}/{count}
                      </span>
                      <button className="quiet" type="button" onClick={() => onAddTag(tag)}>
                        Add to rest
                      </button>
                      <button className="quiet" type="button" onClick={() => onRemoveTag(tag)}>
                        Remove
                      </button>
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
        {count === 1 && (
          <div className="own-tags">
            {singleTags.length === 0 ? (
              <p className="hint-line">Untagged</p>
            ) : (
              <>
                <p className="section">Drag tags to reorder</p>
                <div className="chips">
                  {singleTags.map((tag, index) => (
                    <span
                      key={`${tag}-${index}`}
                      className="chip"
                      data-chip={String(index)}
                      {...reorderHandlers(index, singleTags.length, true, onReorderSingle)}
                    >
                      {meta(tag) && (
                        <i className="swatch meta" />
                      )}
                      <span className="tag">{pretty(tag)}</span>
                      <button type="button" aria-label={`Remove ${pretty(tag)}`} onClick={() => onRemoveChip(index)}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <form
          className="add-tag"
          onSubmit={(event) => {
            event.preventDefault();
            const input = event.currentTarget.elements.namedItem("tag") as HTMLInputElement;
            onAddTag(input.value);
            input.value = "";
          }}
        >
          <input
            id="add-tag"
            name="tag"
            type="text"
            list="vocab"
            aria-label={count === 1 ? "New tag" : "Tag for every selected image"}
            placeholder={count === 1 ? "New tag" : "Tag for every selected image"}
            spellCheck={false}
            autoComplete="off"
          />
          <button className="quiet" type="submit">
            Add
          </button>
        </form>
        {referenceTags.some((tag) => !ownedTags.has(tag)) && (
          <div className="tag-block ref-tags">
            <h2>Tags from references</h2>
            <div className="suggest">
              {referenceTags
                .filter((tag) => !ownedTags.has(tag))
                .map((tag) => (
                  <button key={tag} type="button" onClick={() => onAddTag(tag)}>
                    {pretty(tag)}
                  </button>
                ))}
            </div>
          </div>
        )}
        <References images={references} onAdd={onAddReference} onRemove={onRemoveReference} />
        {recentCount > 0 && (
          <div className="tag-block">
            <h2>
              <button
                className="fold"
                type="button"
                aria-expanded={recentOpen}
                onClick={() => setRecentOpen((open) => !open)}
              >
                <span className="fold-mark" />
                Last tags used
              </button>
            </h2>
            {recentOpen &&
              (recentTags.length === 0 ? (
                <p className="hint-line">Tags you add show up here, newest first.</p>
              ) : (
                <div className="suggest">
                  {recentTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={ownedTags.has(tag) ? "present" : undefined}
                      onClick={() => onAddTag(tag)}
                    >
                      {pretty(tag)}
                    </button>
                  ))}
                </div>
              ))}
          </div>
        )}
        {showSidecar && (focus || selectedImages[0]) && (
          <label className="field" htmlFor="caption">
            <span>Sidecar text · {sidecarName((focus ?? selectedImages[0]).name)}</span>
            <textarea
              id="caption"
              spellCheck={false}
              placeholder="comma-separated tags"
              value={(focus ?? selectedImages[0]).caption}
              onChange={(event) => onCaptionChange(event.target.value)}
              onFocus={onCaptionFocus}
              onBlur={onCaptionBlur}
            />
          </label>
        )}
          </>
        )}
      </div>
    </aside>
  );
}

function referenceTagList(images: readonly ImageItem[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const image of images) {
    for (const tag of parseTags(image.caption)) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

function galleryDragId(event: ReactDragEvent<HTMLElement>): string {
  const custom = event.dataTransfer.getData(GALLERY_DRAG_TYPE);
  if (custom) return custom;
  const text = event.dataTransfer.getData("text/plain");
  return text.startsWith("boorutagger:") ? text.slice("boorutagger:".length) : "";
}

function isGalleryDrag(event: ReactDragEvent<HTMLElement>): boolean {
  const types = [...event.dataTransfer.types];
  return types.includes(GALLERY_DRAG_TYPE) || types.includes("text/plain");
}

function References({
  images,
  onAdd,
  onRemove,
}: {
  images: readonly ImageItem[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [over, setOver] = useState(false);

  return (
    <div className="tag-block">
      <h2>Reference images</h2>
      <div
        className={over ? "ref-drop over" : "ref-drop"}
        onDragEnter={(event) => {
          if (!isGalleryDrag(event)) return;
          event.preventDefault();
          setOver(true);
        }}
        onDragOver={(event) => {
          if (!isGalleryDrag(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setOver(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setOver(false);
        }}
        onDrop={(event) => {
          const id = galleryDragId(event);
          setOver(false);
          if (!id) return;
          event.preventDefault();
          onAdd(id);
        }}
      >
        {images.length === 0 ? (
          <p className="hint-line">Drop tagged images from the gallery.</p>
        ) : (
          images.map((image) => (
            <div className="ref-row" key={image.id}>
              <span className="thumb">
                <img src={image.src} alt="" draggable={false} />
              </span>
              <span className="ref-name">{image.name}</span>
              <button className="quiet" type="button" onClick={() => onRemove(image.id)}>
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FolderStats({
  images,
  hasTags,
  isMeta,
  onFilterTag,
  onCopyTag,
}: {
  images: readonly ImageItem[];
  hasTags: readonly string[];
  isMeta: (tag: string) => boolean;
  onFilterTag: (kind: TagFilterKind, tag: string) => void;
  onCopyTag: (tag: string) => void;
}) {
  const [menu, setMenu] = useState<{ tag: string; x: number; y: number } | null>(null);
  let captioned = 0;
  const tagCounts = new Map<string, number>();
  const folders = new Set<string>();
  for (const image of images) {
    const tags = parseTags(image.caption);
    if (!needsCaption(image.caption)) captioned += 1;
    for (const tag of new Set(tags)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    const slash = image.name.lastIndexOf("/");
    if (slash > 0) folders.add(image.name.slice(0, slash));
  }
  const total = images.length;
  const empty = total - captioned;
  const unique = tagCounts.size;
  const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <div>
      <div className="section">Folder</div>
      <div className="stat">
        <span>Images</span>
        <span>{total}</span>
      </div>
      <div className="stat">
        <span>Captioned</span>
        <span>{captioned}</span>
      </div>
      <div className="stat">
        <span>Untagged</span>
        <span>{empty}</span>
      </div>
      {folders.size > 0 && (
        <div className="stat">
          <span>Subfolders</span>
          <span>{folders.size}</span>
        </div>
      )}
      <div className="stat">
        <span>Unique tags</span>
        <span>{unique}</span>
      </div>
      {tags.length > 0 && (
        <div className="tag-badges" aria-label="Tag counts">
          {tags.map(([tag, have]) => (
            <button
              key={tag}
              type="button"
              className="tag-badge"
              aria-pressed={hasTags.includes(tag)}
              onClick={() => onFilterTag("has", tag)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ tag, x: event.clientX, y: event.clientY });
              }}
            >
              {isMeta(tag) && (
                <i className="swatch meta" />
              )}
              <span>{pretty(tag)}</span>
              {have > 1 && <span className="n">{have}</span>}
            </button>
          ))}
        </div>
      )}
      {menu && (
        <TagMenu
          x={menu.x}
          y={menu.y}
          tag={menu.tag}
          onClose={() => setMenu(null)}
          onHas={() => {
            onFilterTag("has", menu.tag);
            setMenu(null);
          }}
          onWithout={() => {
            onFilterTag("missing", menu.tag);
            setMenu(null);
          }}
          onOnly={() => {
            onFilterTag("only", menu.tag);
            setMenu(null);
          }}
          onCopy={() => {
            onCopyTag(menu.tag);
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}

type ActiveDrag = {
  from: number;
  over: number;
  onMove: (from: number, to: number) => void;
  pointerId: number;
  horizontal: boolean;
  startX: number;
  startY: number;
  started: boolean;
  ghost: HTMLElement | null;
  marker: HTMLElement | null;
};

let activeDrag: ActiveDrag | null = null;

function reorderNodes(parent: HTMLElement): HTMLElement[] {
  return [...parent.querySelectorAll<HTMLElement>(":scope > [data-reorder-index]")];
}

function insertionIndex(parent: HTMLElement, x: number, y: number, horizontal: boolean, from: number): number {
  const nodes = reorderNodes(parent);
  let best: { index: number; box: DOMRect; dist: number } | null = null;
  for (const node of nodes) {
    const index = Number(node.dataset.reorderIndex);
    if (index === from) continue;
    const box = node.getBoundingClientRect();
    const nearestX = Math.max(box.left, Math.min(x, box.right));
    const nearestY = Math.max(box.top, Math.min(y, box.bottom));
    const dist = (x - nearestX) ** 2 + (y - nearestY) ** 2;
    if (!best || dist < best.dist) best = { index, box, dist };
  }
  if (!best) return from;
  const before = horizontal
    ? x < best.box.left + best.box.width / 2
    : y < best.box.top + best.box.height / 2;
  const gap = before ? best.index : best.index + 1;
  const to = gap <= from ? gap : gap - 1;
  return Math.max(0, Math.min(to, nodes.length - 1));
}

function makeGhost(source: HTMLElement): HTMLElement {
  const ghost = document.createElement("span");
  ghost.className = "chip tag-ghost";
  const swatch = source.querySelector(".swatch");
  if (swatch) ghost.appendChild(swatch.cloneNode(true));
  const label = source.querySelector(".tag, .tagname");
  const text = document.createElement("span");
  text.className = "tag";
  text.textContent = label?.textContent ?? "";
  ghost.appendChild(text);
  document.body.appendChild(ghost);
  return ghost;
}

function placeGhost(ghost: HTMLElement, x: number, y: number) {
  ghost.style.left = `${x}px`;
  ghost.style.top = `${y}px`;
}

function placeMarker(marker: HTMLElement, parent: HTMLElement, to: number, from: number, horizontal: boolean) {
  const node = reorderNodes(parent).find((item) => Number(item.dataset.reorderIndex) === to);
  if (!node) {
    marker.hidden = true;
    return;
  }
  marker.hidden = false;
  const box = node.getBoundingClientRect();
  const after = to > from;
  if (horizontal) {
    const edge = after ? box.right + 3 : box.left - 3;
    marker.style.left = `${edge - 1}px`;
    marker.style.top = `${box.top}px`;
    marker.style.width = "2px";
    marker.style.height = `${box.height}px`;
  } else {
    const edge = after ? box.bottom + 2 : box.top - 2;
    marker.style.left = `${box.left}px`;
    marker.style.top = `${edge - 1}px`;
    marker.style.width = `${box.width}px`;
    marker.style.height = "2px";
  }
}

function beginReorder(source: HTMLElement, x: number, y: number) {
  if (!activeDrag || activeDrag.started) return;
  activeDrag.started = true;
  source.classList.add("dragging");
  const ghost = makeGhost(source);
  const marker = document.createElement("div");
  marker.className = "tag-insert";
  document.body.appendChild(marker);
  activeDrag.ghost = ghost;
  activeDrag.marker = marker;
  placeGhost(ghost, x, y);
  const parent = source.parentElement;
  if (parent) placeMarker(marker, parent, activeDrag.over, activeDrag.from, activeDrag.horizontal);
}

function finishReorder(node: HTMLElement) {
  node.classList.remove("dragging");
  activeDrag?.ghost?.remove();
  activeDrag?.marker?.remove();
  if (node.hasPointerCapture?.(activeDrag?.pointerId ?? -1)) {
    try {
      node.releasePointerCapture(activeDrag!.pointerId);
    } catch {
      /* pointer already released */
    }
  }
  activeDrag = null;
}

function reorderHandlers(
  index: number,
  count: number,
  horizontal: boolean,
  onMove: (from: number, to: number) => void,
) {
  return {
    tabIndex: 0,
    "data-reorder-index": String(index),
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest("button")) return;
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* pointer capture is unavailable for this event */
      }
      event.currentTarget.focus();
      activeDrag = {
        from: index,
        over: index,
        onMove,
        pointerId: event.pointerId,
        horizontal,
        startX: event.clientX,
        startY: event.clientY,
        started: false,
        ghost: null,
        marker: null,
      };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
      const moved = Math.hypot(event.clientX - activeDrag.startX, event.clientY - activeDrag.startY);
      if (!activeDrag.started) {
        if (moved < 4) return;
        beginReorder(event.currentTarget, event.clientX, event.clientY);
      }
      const parent = event.currentTarget.parentElement;
      if (!parent || !activeDrag.ghost || !activeDrag.marker) return;
      placeGhost(activeDrag.ghost, event.clientX, event.clientY);
      const to = insertionIndex(parent, event.clientX, event.clientY, activeDrag.horizontal, activeDrag.from);
      activeDrag.over = to;
      placeMarker(activeDrag.marker, parent, to, activeDrag.from, activeDrag.horizontal);
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
      const { from, over, onMove: move, started } = activeDrag;
      finishReorder(event.currentTarget);
      if (started && over !== from) move(from, over);
    },
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
      finishReorder(event.currentTarget);
    },
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      const previous = horizontal ? "ArrowLeft" : "ArrowUp";
      const next = horizontal ? "ArrowRight" : "ArrowDown";
      if (event.key !== previous && event.key !== next) return;
      if ((event.target as HTMLElement).closest("button")) return;
      event.preventDefault();
      event.stopPropagation();
      const to = index + (event.key === previous ? -1 : 1);
      if (to < 0 || to >= count) return;
      onMove(index, to);
    },
  };
}
