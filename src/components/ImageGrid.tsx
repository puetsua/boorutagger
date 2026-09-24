import type { Ref } from "react";
import { needsCaption, parseTags, pretty } from "../tags";
import type { ImageItem } from "../types";

type ImageGridProps = {
  gridRef: Ref<HTMLDivElement>;
  folder: string | null;
  images: readonly ImageItem[];
  visible: readonly ImageItem[];
  selected: ReadonlySet<string>;
  focusId: string | null;
  hiddenNote: string;
  busy: boolean;
  onOpen: () => void;
  onSelect: (id: string, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
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
  busy,
  onOpen,
  onSelect,
  onSelectShown,
  onClear,
}: ImageGridProps) {
  return (
    <section className="stage" aria-label="Images">
      <div className="grid-head">
        <p>{hiddenNote}</p>
        <div className="spacer" />
        <button className="ghost" type="button" onClick={onSelectShown} disabled={!visible.length}>
          Select shown
        </button>
        <button className="ghost" type="button" onClick={onClear} disabled={!selected.size}>
          Clear
        </button>
      </div>
      <div className="hint">Click selects one. Ctrl click toggles. Shift click selects a range. Arrow keys move.</div>
      <div className="grid" ref={gridRef}>
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
            <p>BooruTagger reads png, jpg, jpeg, webp, gif, bmp, and avif files here. Images inside subfolders are not included.</p>
          </div>
        )}
        {folder && images.length > 0 && visible.length === 0 && (
          <div className="empty-grid">No images match this working set. Clear a tag filter or choose All images.</div>
        )}
        {visible.map((image) => {
          const tags = parseTags(image.caption);
          const empty = needsCaption(image.caption);
          return (
            <button
              key={image.id}
              type="button"
              className="cell"
              data-id={image.id}
              aria-pressed={selected.has(image.id) ? true : undefined}
              aria-current={image.id === focusId ? "true" : undefined}
              title={empty ? "No caption" : tags.map(pretty).join(", ")}
              onClick={(event) => onSelect(image.id, event)}
            >
              <span className="thumb">
                <img
                  src={image.src}
                  alt=""
                  decoding="async"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.visibility = "hidden";
                  }}
                />
              </span>
              <span className="fname">{image.name}</span>
              <span className={empty ? "fmeta empty" : "fmeta"}>{empty ? "Needs caption" : `${tags.length} tags`}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
