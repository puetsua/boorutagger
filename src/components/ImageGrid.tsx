import { useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import type { GalleryView } from "../settings";
import { needsCaption, parseTags } from "../tags";
import type { ImageItem } from "../types";

const MASONRY_GAP = 8;
const MASONRY_ROW = 200;

type ImageGridProps = {
  gridRef: Ref<HTMLDivElement>;
  folder: string | null;
  images: readonly ImageItem[];
  visible: readonly ImageItem[];
  selected: ReadonlySet<string>;
  focusId: string | null;
  hiddenNote: string;
  galleryView: GalleryView;
  busy: boolean;
  onOpen: () => void;
  onSelect: (id: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onAddReference: (id: string) => void;
  onImageMenu: (id: string, x: number, y: number) => void;
  onZoom: (id: string) => void;
  onSelectShown: () => void;
  onClear: () => void;
};

export function ImageGrid({
  gridRef,
  folder,
  images,
  visible,
  selected,
  focusId,
  hiddenNote,
  galleryView,
  busy,
  onOpen,
  onSelect,
  onAddReference,
  onImageMenu,
  onZoom,
  onSelectShown,
  onClear,
}: ImageGridProps) {
  return (
    <section className="stage" aria-label="Images">
      <div className="grid-head">
        <p>
          {selected.size === 0
            ? "Click selects one. Double-click zooms. Ctrl click toggles. Shift click selects a range. Arrow keys move."
            : hiddenNote}
        </p>
        <div className="spacer" />
        <button className="ghost" type="button" onClick={onSelectShown} disabled={!visible.length}>
          Select all
        </button>
        <button className="ghost" type="button" onClick={onClear} disabled={!selected.size}>
          Clear
        </button>
      </div>
      <div className={`grid view-${galleryView}`} ref={gridRef}>
        {!folder && (
          <div className="empty-grid">
            <p>Open a folder of images.</p>
            <p>Each caption is a .txt file beside the image.</p>
            <button className="ghost" type="button" onClick={onOpen} disabled={busy}>
              Open folder
            </button>
          </div>
        )}
        {folder && images.length === 0 && (
          <div className="empty-grid">
            <p>No images in this folder.</p>
            <p>BooruTagger reads png, jpg, jpeg, webp, gif, bmp, and avif files in this folder and its subfolders.</p>
          </div>
        )}
        {folder && images.length > 0 && visible.length === 0 && (
          <div className="empty-grid">No images match this working set. Clear a tag filter or choose All images.</div>
        )}
        {galleryView === "masonry" && visible.length > 0 ? (
          <Masonry
            images={visible}
            selected={selected}
            focusId={focusId}
            onSelect={onSelect}
            onAddReference={onAddReference}
            onImageMenu={onImageMenu}
            onZoom={onZoom}
          />
        ) : (
          visible.map((image) => (
            <Cell
              key={image.id}
              image={image}
              galleryView={galleryView}
              selected={selected.has(image.id)}
              focused={image.id === focusId}
              onSelect={onSelect}
              onAddReference={onAddReference}
              onImageMenu={onImageMenu}
              onZoom={onZoom}
            />
          ))
        )}
      </div>
    </section>
  );
}

function layoutRows(
  aspects: readonly number[],
  containerWidth: number,
  targetHeight: number,
  maxHeight: number,
  gap: number,
) {
  const sizes = aspects.map(() => ({ width: 0, height: 0 }));
  if (containerWidth <= 0 || aspects.length === 0) return sizes;

  const rowHeight = (from: number, to: number) => {
    const gaps = Math.max(0, to - from - 1) * gap;
    const avail = Math.max(1, containerWidth - gaps);
    const sumAspect = aspects.slice(from, to).reduce((sum, aspect) => sum + aspect, 0);
    return avail / sumAspect;
  };

  const breaks = [0];
  let used = 0;
  for (let index = 0; index < aspects.length; index++) {
    const width = aspects[index] * targetHeight;
    const next = used === 0 ? width : used + gap + width;
    if (used > 0 && next > containerWidth) {
      breaks.push(index);
      used = width;
    } else {
      used = next;
    }
  }
  breaks.push(aspects.length);

  // A short last row leaves a gap, so fold it into the row above.
  if (breaks.length > 2) {
    const from = breaks[breaks.length - 2];
    const to = breaks[breaks.length - 1];
    if (rowHeight(from, to) > maxHeight + 0.5) breaks.splice(breaks.length - 2, 1);
  }

  for (let row = 0; row < breaks.length - 1; row++) {
    const from = breaks[row];
    const to = breaks[row + 1];
    const raw = rowHeight(from, to);
    const height = Math.min(raw, maxHeight);
    const capped = raw > height + 0.5;
    const gaps = Math.max(0, to - from - 1) * gap;
    const avail = Math.max(1, containerWidth - gaps);
    let filled = 0;
    for (let index = from; index < to; index++) {
      const last = index === to - 1;
      const width = !capped && last ? avail - filled : Math.max(1, Math.round(aspects[index] * height));
      sizes[index] = { width, height };
      filled += width;
    }
  }
  return sizes;
}

function Masonry({
  images,
  selected,
  focusId,
  onSelect,
  onAddReference,
  onImageMenu,
  onZoom,
}: {
  images: readonly ImageItem[];
  selected: ReadonlySet<string>;
  focusId: string | null;
  onSelect: ImageGridProps["onSelect"];
  onAddReference: ImageGridProps["onAddReference"];
  onImageMenu: ImageGridProps["onImageMenu"];
  onZoom: ImageGridProps["onZoom"];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [aspects, setAspects] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const update = () => setFrame({ width: node.clientWidth, height: node.parentElement?.clientHeight ?? 0 });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    if (node.parentElement) observer.observe(node.parentElement);
    return () => observer.disconnect();
  }, []);

  // A short row stretches to the pane width; keep it within half the gallery.
  const maxHeight = Math.max(MASONRY_ROW, frame.height / 2);
  const sizes = useMemo(
    () =>
      layoutRows(
        images.map((image) => aspects[image.id] ?? 0.75),
        frame.width,
        MASONRY_ROW,
        maxHeight,
        MASONRY_GAP,
      ),
    [aspects, frame, images, maxHeight],
  );

  function rememberAspect(id: string, aspect: number) {
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    setAspects((current) => {
      if (current[id] !== undefined && Math.abs(current[id] - aspect) < 0.002) return current;
      return { ...current, [id]: aspect };
    });
  }

  return (
    <div className="masonry" ref={ref}>
      {images.map((image, index) => (
        <div
          key={image.id}
          className="masonry-item"
          style={{ width: sizes[index]?.width, height: sizes[index]?.height }}
        >
          <Cell
            image={image}
            galleryView="masonry"
            selected={selected.has(image.id)}
            focused={image.id === focusId}
            onSelect={onSelect}
            onAddReference={onAddReference}
            onImageMenu={onImageMenu}
            onZoom={onZoom}
            onAspect={rememberAspect}
          />
        </div>
      ))}
    </div>
  );
}

function Cell({
  image,
  galleryView,
  selected,
  focused,
  onSelect,
  onAddReference,
  onImageMenu,
  onZoom,
  onAspect,
}: {
  image: ImageItem;
  galleryView: GalleryView;
  selected: boolean;
  focused: boolean;
  onSelect: ImageGridProps["onSelect"];
  onAddReference: ImageGridProps["onAddReference"];
  onImageMenu: ImageGridProps["onImageMenu"];
  onZoom: ImageGridProps["onZoom"];
  onAspect?: (id: string, aspect: number) => void;
}) {
  const tags = parseTags(image.caption);
  const empty = needsCaption(image.caption);
  const caption = empty ? "No caption" : tags.join(", ");
  const overlayName = galleryView === "tile" || galleryView === "masonry";
  const drag = useRef<ThumbDrag | null>(null);
  const suppressClick = useRef(false);

  function readAspect(img: HTMLImageElement) {
    if (!onAspect || !img.naturalWidth || !img.naturalHeight) return;
    onAspect(image.id, img.naturalWidth / img.naturalHeight);
  }

  return (
    <button
      type="button"
      className="cell"
      data-id={image.id}
      aria-pressed={selected ? true : undefined}
      aria-current={focused ? "true" : undefined}
      aria-label={image.name}
      title={caption}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* pointer capture is unavailable for this event */
        }
        drag.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          started: false,
          ghost: null,
        };
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        if (!current.started) {
          if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
          current.started = true;
          suppressClick.current = true;
          event.currentTarget.classList.add("dragging");
          current.ghost = thumbGhost(image.src, event.clientX, event.clientY);
        }
        if (current.ghost) {
          current.ghost.style.left = `${event.clientX}px`;
          current.ghost.style.top = `${event.clientY}px`;
        }
        markReferenceDrop(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const hit = current.started && referenceDropAt(event.clientX, event.clientY);
        endThumbDrag(event.currentTarget, current);
        drag.current = null;
        if (hit) onAddReference(image.id);
      }}
      onPointerCancel={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        endThumbDrag(event.currentTarget, current);
        drag.current = null;
      }}
      onClick={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onSelect(image.id, event);
      }}
      onDoubleClick={() => {
        if (suppressClick.current) return;
        onZoom(image.id);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onImageMenu(image.id, event.clientX, event.clientY);
      }}
    >
      <span className="thumb">
        <img
          src={image.src}
          alt=""
          draggable={false}
          decoding="async"
          loading="lazy"
          onLoad={(event) => readAspect(event.currentTarget)}
          ref={(img) => {
            if (img?.complete) queueMicrotask(() => readAspect(img));
          }}
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
          }}
        />
        {overlayName && <span className="fname">{image.name}</span>}
      </span>
      {!overlayName && (
        <span className="cell-copy">
          <span className="fname">{image.name}</span>
          <span className={empty ? "fmeta empty" : "fmeta"}>{empty ? "Untagged" : `${tags.length} tags`}</span>
          {galleryView === "list" && !empty && <span className="fcaption">{caption}</span>}
        </span>
      )}
    </button>
  );
}

type ThumbDrag = {
  pointerId: number;
  x: number;
  y: number;
  started: boolean;
  ghost: HTMLElement | null;
};

function thumbGhost(src: string, x: number, y: number): HTMLElement {
  const ghost = document.createElement("img");
  ghost.className = "image-ghost";
  ghost.src = src;
  ghost.alt = "";
  ghost.style.left = `${x}px`;
  ghost.style.top = `${y}px`;
  document.body.appendChild(ghost);
  return ghost;
}

function referenceDropAt(x: number, y: number): HTMLElement | null {
  const drop = document.querySelector<HTMLElement>(".ref-drop");
  if (!drop) return null;
  const box = drop.getBoundingClientRect();
  const inside = x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  return inside ? drop : null;
}

function markReferenceDrop(x: number, y: number) {
  const drop = document.querySelector(".ref-drop");
  drop?.classList.toggle("over", referenceDropAt(x, y) === drop);
}

function endThumbDrag(cell: HTMLElement, drag: ThumbDrag) {
  cell.classList.remove("dragging");
  drag.ghost?.remove();
  document.querySelector(".ref-drop")?.classList.remove("over");
  if (cell.hasPointerCapture?.(drag.pointerId)) {
    try {
      cell.releasePointerCapture(drag.pointerId);
    } catch {
      /* pointer already released */
    }
  }
}
