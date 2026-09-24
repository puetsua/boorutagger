import type { DragEvent, KeyboardEvent } from "react";
import {
  categoryOf,
  frequentTags,
  parseTags,
  pretty,
  sidecarName,
  TAG_COLORS,
  tagLedger,
} from "../tags";
import type { ImageItem } from "../types";

type CaptionSheetProps = {
  images: readonly ImageItem[];
  selected: ReadonlySet<string>;
  focus: ImageItem | null;
  showSidecar: boolean;
  frequentCount: number;
  recentCount: number;
  recent: readonly string[];
  note: string;
  error: string;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onReplace: (from: string, to: string) => void;
  onReorderShared: (from: number, to: number) => void;
  onReorderSingle: (from: number, to: number) => void;
  onRemoveChip: (index: number) => void;
  onCaptionChange: (value: string) => void;
  onCaptionFocus: () => void;
  onCaptionBlur: () => void;
};

export function CaptionSheet({
  images,
  selected,
  focus,
  showSidecar,
  frequentCount,
  recentCount,
  recent,
  note,
  error,
  onAddTag,
  onRemoveTag,
  onReplace,
  onReorderShared,
  onReorderSingle,
  onRemoveChip,
  onCaptionChange,
  onCaptionFocus,
  onCaptionBlur,
}: CaptionSheetProps) {
  const selectedImages = images.filter((image) => selected.has(image.id));
  const count = selectedImages.length;
  const who = count === 0 ? "Nothing selected" : count === 1 ? "1 image" : `${count} images`;
  const focusCaption = selected.has(focus?.id ?? "") ? focus?.caption ?? "" : selectedImages[0]?.caption ?? "";
  const ledger = count > 1 ? tagLedger(selectedImages.map((image) => image.caption), focusCaption) : null;
  const singleTags = count === 1 ? parseTags(selectedImages[0].caption) : [];

  const skip = new Set<string>();
  if (count === 1) parseTags(selectedImages[0].caption).forEach((tag) => skip.add(tag));
  else if (count > 1 && ledger) ledger.shared.forEach((tag) => skip.add(tag));
  const suggestions = frequentTags(images.map((image) => image.caption), skip, frequentCount);
  const recentTags = recent.slice(0, recentCount);

  return (
    <aside className="sheet" aria-label="Edit captions">
      <div className={focus ? "preview" : "preview empty"}>
        {focus ? (
          <>
            <span className="thumb">
              <img src={focus.src} alt="" />
            </span>
            <div>
              <div className="name">{focus.name}</div>
              <div className="side">{sidecarName(focus.name)}</div>
              <div className="who">{who}</div>
            </div>
          </>
        ) : (
          <div className="who">No image</div>
        )}
      </div>
      <div className="sheet-scroll">
        {!focus && (
          <p className="lede">Open a folder of images. Each caption is a .txt file beside the image.</p>
        )}
        {focus && count === 0 && (
          <p className="lede">Select one image to edit its caption, or several to change them together.</p>
        )}
        {ledger && (
          <div>
            {ledger.shared.length === 0 && ledger.partial.length === 0 && (
              <p className="lede">None of the selected images have a caption yet.</p>
            )}
            {ledger.shared.length > 0 && (
              <>
                <div className="section">On every image. Drag to reorder.</div>
                {ledger.shared.map((tag, index) => (
                  <div
                    key={tag}
                    className="trow"
                    data-shared={tag}
                    {...reorderHandlers(index, ledger.shared.length, false, onReorderShared)}
                  >
                    <i className="swatch" style={{ background: TAG_COLORS[categoryOf(tag)] }} />
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
              </>
            )}
            {ledger.partial.length > 0 && (
              <>
                <div className="section">On some</div>
                {ledger.partial.map(({ tag, count: have }) => (
                  <div className="trow" key={tag}>
                    <i className="swatch" style={{ background: TAG_COLORS[categoryOf(tag)] }} />
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
          <div>
            <p className="section">Drag tags to reorder</p>
            <div className="chips">
              {singleTags.map((tag, index) => (
                <span
                  key={`${tag}-${index}`}
                  className="chip"
                  data-chip={String(index)}
                  {...reorderHandlers(index, singleTags.length, true, onReorderSingle)}
                >
                  <i className="swatch" style={{ background: TAG_COLORS[categoryOf(tag)] }} />
                  <span className="tag">{pretty(tag)}</span>
                  <button type="button" aria-label={`Remove ${pretty(tag)}`} onClick={() => onRemoveChip(index)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
        {focus && frequentCount > 0 && (
          <div className="tag-block">
            <h2>Frequently used tags</h2>
            {suggestions.length === 0 ? (
              <p className="hint-line">Every frequent tag is already on this selection.</p>
            ) : (
              <div className="suggest">
                {suggestions.map((tag) => (
                  <button key={tag} type="button" onClick={() => onAddTag(tag)}>
                    {pretty(tag)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {focus && recentCount > 0 && (
          <div className="tag-block">
            <h2>Last tags used</h2>
            {recentTags.length === 0 ? (
              <p className="hint-line">Tags you add show up here, newest first.</p>
            ) : (
              <div className="suggest">
                {recentTags.map((tag) => (
                  <button key={tag} type="button" onClick={() => onAddTag(tag)}>
                    {pretty(tag)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {focus && showSidecar && (
          <label className="field" htmlFor="caption">
            <span>Sidecar text · {sidecarName(focus.name)}</span>
            <textarea
              id="caption"
              spellCheck={false}
              placeholder="comma-separated tags"
              value={focus.caption}
              onChange={(event) => onCaptionChange(event.target.value)}
              onFocus={onCaptionFocus}
              onBlur={onCaptionBlur}
            />
          </label>
        )}
      </div>
      <div className="foot">
        {count > 1 && (
          <div>
            <div className="foot-row">
              <label htmlFor="add-tag">Add</label>
              <input
                id="add-tag"
                type="text"
                list="vocab"
                placeholder="Tag for every selected image"
                spellCheck={false}
                autoComplete="off"
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  onAddTag(event.currentTarget.value);
                  event.currentTarget.value = "";
                }}
              />
              <button
                className="quiet"
                type="button"
                onClick={(event) => {
                  const input = event.currentTarget.previousElementSibling as HTMLInputElement;
                  onAddTag(input.value);
                  input.value = "";
                }}
              >
                Add
              </button>
            </div>
            <div className="foot-row">
              <label htmlFor="rep-from">Replace</label>
              <input id="rep-from" type="text" placeholder="Find tag" spellCheck={false} autoComplete="off" />
              <input id="rep-to" type="text" placeholder="Replacement" spellCheck={false} autoComplete="off" />
              <button
                className="quiet"
                type="button"
                onClick={() => {
                  const from = document.getElementById("rep-from") as HTMLInputElement;
                  const to = document.getElementById("rep-to") as HTMLInputElement;
                  onReplace(from.value, to.value);
                }}
              >
                Replace
              </button>
            </div>
          </div>
        )}
        <div className={error ? "note error" : "note"} role="status">
          {error || note}
        </div>
      </div>
    </aside>
  );
}

function reorderHandlers(
  index: number,
  count: number,
  horizontal: boolean,
  onMove: (from: number, to: number) => void,
) {
  return {
    draggable: true,
    tabIndex: 0,
    onDragStart(event: DragEvent<HTMLElement>) {
      if ((event.target as HTMLElement).closest("button")) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
      event.currentTarget.classList.add("dragging");
    },
    onDragEnd(event: DragEvent<HTMLElement>) {
      event.currentTarget.classList.remove("dragging", "over");
    },
    onDragOver(event: DragEvent<HTMLElement>) {
      event.preventDefault();
      event.currentTarget.classList.add("over");
    },
    onDragLeave(event: DragEvent<HTMLElement>) {
      event.currentTarget.classList.remove("over");
    },
    onDrop(event: DragEvent<HTMLElement>) {
      event.preventDefault();
      event.currentTarget.classList.remove("over");
      const raw = event.dataTransfer.getData("text/plain");
      const start = Number(raw);
      if (raw === "" || !Number.isInteger(start) || start === index) return;
      onMove(start, index);
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
