import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent, type ReactNode } from "react";
import { errorMessage } from "../api";
import { TagMenu } from "./ImageMenu";
import { PoolToggles } from "./PoolToggles";
import type { TagPool } from "../settings";
import { reorderHandlers } from "../reorder";
import { needsCaption, parseTags, sidecarName } from "../tags";
import { GALLERY_DRAG_TYPE, type ImageItem } from "../types";

type TagFilterKind = "has" | "missing" | "only";

type CaptionSheetProps = {
  images: readonly ImageItem[];
  selected: ReadonlySet<string>;
  focus: ImageItem | null;
  showSidecar: boolean;
  references: readonly ImageItem[];
  recentCount: number;
  recent: readonly string[];
  pools: readonly TagPool[];
  hiddenPools: readonly string[];
  onTogglePool: (id: string) => void;
  error: string;
  taggerReady: boolean;
  onSuggest: (path: string) => Promise<string[]>;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
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
  references,
  recentCount,
  recent,
  pools,
  hiddenPools,
  onTogglePool,
  error,
  taggerReady,
  onSuggest,
  onAddTag,
  onRemoveTag,
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
  const selectedIds = [...selected];
  const lastSelected = images.find((image) => image.id === selectedIds[selectedIds.length - 1]);
  const preview = focus && selected.has(focus.id) ? focus : lastSelected ?? null;
  const singleTags = count === 1 ? parseTags(selectedImages[0].caption) : [];
  const selectionTags = count > 1 ? tagCounts(selectedImages) : [];
  const ownedTags = new Set(
    count === 1 ? singleTags : selectionTags.filter(([, have]) => have === count).map(([tag]) => tag),
  );

  // Folded sections stay folded while the selection changes.
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const fold = (name: string) => ({
    open: !folded.has(name),
    onToggle: () =>
      setFolded((current) => {
        const next = new Set(current);
        if (!next.delete(name)) next.add(name);
        return next;
      }),
  });
  const zoomRef = useRef<HTMLDialogElement>(null);
  const recentTags = recent.slice(0, recentCount);
  const referenceTags = referenceTagList(references);

  // Dimmed suggestions are tags every selected image already has.
  function toggleTag(tag: string) {
    if (ownedTags.has(tag)) onRemoveTag(tag);
    else onAddTag(tag);
  }

  useEffect(() => {
    if ((!preview || count === 0) && zoomed) onCloseZoom();
  }, [preview, count, zoomed, onCloseZoom]);

  useEffect(() => {
    const dialog = zoomRef.current;
    if (!dialog) return;
    if (zoomed && preview && !dialog.open) dialog.show();
    if (!zoomed && dialog.open) dialog.close();
  }, [zoomed, preview]);

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
      {preview && (
      <div
        className="preview"
        onContextMenu={(event) => {
          event.preventDefault();
          onImageMenu(preview.id, event.clientX, event.clientY);
        }}
      >
        <button
          type="button"
          className="thumb"
          aria-label={`Zoom ${preview.name}`}
          onClick={onZoom}
        >
          <img src={preview.src} alt="" />
        </button>
        <div>
          <div className="name" title={preview.path}>{preview.name}</div>
        </div>
      </div>
      )}
      {preview && zoomed && <div className="scrim zoom-scrim" />}
      {preview && (
        <dialog
          ref={zoomRef}
          className="zoom"
          aria-label={preview.name}
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
              onImageMenu(preview.id, event.clientX, event.clientY);
            }}
          >
            <img src={preview.src} alt="" />
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
          <FolderStats images={images} hasTags={hasTags} onFilterTag={onFilterTag} onCopyTag={onCopyTag} />
        ) : (
          <>
        {count > 1 && (
          <div className="own-tags">
            {selectionTags.length === 0 ? (
              <p className="lede">None of the selected images have a caption yet.</p>
            ) : (
              <TagBadges
              tags={selectionTags}
              hasTags={hasTags}
              onFilterTag={onFilterTag}
              onCopyTag={onCopyTag}
              onApply={onAddTag}
              onRemove={onRemoveTag}
              chips
            />
            )}
          </div>
        )}
        {count === 1 && (
          <div className="own-tags">
            {singleTags.length === 0 ? (
              <p className="hint-line">Untagged</p>
            ) : (
              <TagChipMenu
                onFilterTag={onFilterTag}
                onCopyTag={onCopyTag}
                onApply={onAddTag}
                onRemove={onRemoveTag}
              >
                {(openMenu) => (
                  <>
                    <p className="section">Drag tags to reorder</p>
                    <div className="chips">
                      {singleTags.map((tag, index) => (
                        <span
                          key={`${tag}-${index}`}
                          className="chip"
                          data-chip={String(index)}
                          {...reorderHandlers(index, singleTags.length, true, onReorderSingle)}
                          onContextMenu={(event) => openMenu(tag, event)}
                        >
                          <span className="tag">{tag}</span>
                          <button type="button" aria-label={`Remove ${tag}`} onClick={() => onRemoveChip(index)}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </TagChipMenu>
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
        {count === 1 && taggerReady && preview && (
          <AiTags key={preview.src} path={preview.path} owned={ownedTags} onSuggest={onSuggest} onAdd={onAddTag} />
        )}
        {referenceTags.some((tag) => !ownedTags.has(tag)) && (
          <div className="tag-block ref-tags">
            <h2>Tags from references</h2>
            <div className="suggest">
              {referenceTags
                .filter((tag) => !ownedTags.has(tag))
                .map((tag) => (
                  <button key={tag} type="button" onClick={() => onAddTag(tag)}>
                    {tag}
                  </button>
                ))}
            </div>
          </div>
        )}
        <FoldBlock title="Reference images" {...fold("references")}>
          <References images={references} onAdd={onAddReference} onRemove={onRemoveReference} />
        </FoldBlock>
        {pools.length > 0 && (
          <FoldBlock title="Tag pools" {...fold("pools")}>
            <PoolToggles
              pools={pools}
              label="Tag pools to show"
              active={(id) => !hiddenPools.includes(id)}
              onToggle={onTogglePool}
            />
            {pools
              .filter((pool) => !hiddenPools.includes(pool.id))
              .map((pool) => (
                <div className="pool-suggest" key={pool.id}>
                  <p className="section">{pool.name}</p>
                  <div className="suggest">
                    {pool.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={ownedTags.has(tag) ? "present" : undefined}
                        title={ownedTags.has(tag) ? "Remove tag" : undefined}
                        onClick={() => toggleTag(tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </FoldBlock>
        )}
        {recentCount > 0 && (
          <FoldBlock title="Last tags used" {...fold("recent")}>
            {recentTags.length === 0 ? (
              <p className="hint-line">Tags you add show up here, newest first.</p>
            ) : (
              <div className="suggest">
                {recentTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={ownedTags.has(tag) ? "present" : undefined}
                    title={ownedTags.has(tag) ? "Remove tag" : undefined}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </FoldBlock>
        )}
        {showSidecar && preview && (
          <label className="field" htmlFor="caption">
            <span>Sidecar text · {sidecarName(preview.name)}</span>
            <textarea
              id="caption"
              spellCheck={false}
              placeholder="comma-separated tags"
              value={preview.caption}
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

function AiTags({
  path,
  owned,
  onSuggest,
  onAdd,
}: {
  path: string;
  owned: ReadonlySet<string>;
  onSuggest: (path: string) => Promise<string[]>;
  onAdd: (tag: string) => void;
}) {
  const [tags, setTags] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fresh = tags?.filter((tag) => !owned.has(tag)) ?? [];

  async function suggest() {
    setBusy(true);
    setError("");
    try {
      setTags(await onSuggest(path));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tag-block ai-tags">
      <h2>AI tags</h2>
      {tags === null ? (
        <button className="quiet" type="button" disabled={busy} onClick={() => void suggest()}>
          {busy ? "Tagging…" : "Suggest tags"}
        </button>
      ) : fresh.length === 0 ? (
        <p className="hint-line">No new tags above the threshold.</p>
      ) : (
        <div className="suggest">
          {fresh.map((tag) => (
            <button key={tag} type="button" onClick={() => onAdd(tag)}>
              {tag}
            </button>
          ))}
        </div>
      )}
      {error && <p className="sheet-error">{error}</p>}
    </div>
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
            <button className="quiet warn" type="button" onClick={() => onRemove(image.id)}>
              Remove
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function FoldBlock({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="tag-block">
      <h2>
        <button className="fold" type="button" aria-expanded={open} onClick={onToggle}>
          <span className="fold-mark" />
          {title}
        </button>
      </h2>
      {open && children}
    </div>
  );
}

function tagCounts(images: readonly ImageItem[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const image of images) {
    for (const tag of new Set(parseTags(image.caption))) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function TagChipMenu({
  onFilterTag,
  onCopyTag,
  onApply,
  onRemove,
  children,
}: {
  onFilterTag: (kind: TagFilterKind, tag: string) => void;
  onCopyTag: (tag: string) => void;
  onApply?: (tag: string) => void;
  onRemove?: (tag: string) => void;
  children: (openMenu: (tag: string, event: MouseEvent) => void) => ReactNode;
}) {
  const [menu, setMenu] = useState<{ tag: string; x: number; y: number } | null>(null);
  function openMenu(tag: string, event: MouseEvent) {
    event.preventDefault();
    setMenu({ tag, x: event.clientX, y: event.clientY });
  }
  return (
    <>
      {children(openMenu)}
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
          onApply={
            onApply
              ? () => {
                  onApply(menu.tag);
                  setMenu(null);
                }
              : undefined
          }
          onRemove={
            onRemove
              ? () => {
                  onRemove(menu.tag);
                  setMenu(null);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

function TagBadges({
  tags,
  hasTags,
  onFilterTag,
  onCopyTag,
  onApply,
  onRemove,
  chips,
}: {
  tags: readonly [string, number][];
  hasTags: readonly string[];
  onFilterTag: (kind: TagFilterKind, tag: string) => void;
  onCopyTag: (tag: string) => void;
  onApply?: (tag: string) => void;
  onRemove?: (tag: string) => void;
  chips?: boolean;
}) {
  return (
    <TagChipMenu onFilterTag={onFilterTag} onCopyTag={onCopyTag} onApply={onApply} onRemove={onRemove}>
      {(openMenu) =>
        chips ? (
          <div className="chips static">
            {tags.map(([tag, have]) => (
              <span key={tag} className="chip" onContextMenu={(event) => openMenu(tag, event)}>
                <span className="tag">{tag}</span>
                {have > 1 && <span className="n">{have}</span>}
                {onRemove && (
                  <button type="button" aria-label={`Remove ${tag}`} onClick={() => onRemove(tag)}>
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        ) : (
          <div className="tag-badges" aria-label="Tag counts">
            {tags.map(([tag, have]) => (
              <button
                key={tag}
                type="button"
                className="tag-badge"
                aria-pressed={hasTags.includes(tag)}
                onClick={() => onFilterTag("has", tag)}
                onContextMenu={(event) => openMenu(tag, event)}
              >
                <span>{tag}</span>
                {have > 1 && <span className="n">{have}</span>}
              </button>
            ))}
          </div>
        )
      }
    </TagChipMenu>
  );
}

function FolderStats({
  images,
  hasTags,
  onFilterTag,
  onCopyTag,
}: {
  images: readonly ImageItem[];
  hasTags: readonly string[];
  onFilterTag: (kind: TagFilterKind, tag: string) => void;
  onCopyTag: (tag: string) => void;
}) {
  let captioned = 0;
  const folders = new Set<string>();
  for (const image of images) {
    if (!needsCaption(image.caption)) captioned += 1;
    const slash = image.name.lastIndexOf("/");
    if (slash > 0) folders.add(image.name.slice(0, slash));
  }
  const total = images.length;
  const empty = total - captioned;
  const tags = tagCounts(images);

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
        <span>{tags.length}</span>
      </div>
      {tags.length > 0 && (
        <TagBadges tags={tags} hasTags={hasTags} onFilterTag={onFilterTag} onCopyTag={onCopyTag} />
      )}
    </div>
  );
}
