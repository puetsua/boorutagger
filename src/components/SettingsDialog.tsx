import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { reorderHandlers } from "../reorder";
import {
  clampThreshold,
  folderKey,
  GALLERY_VIEWS,
  MAX_THRESHOLD,
  MIN_THRESHOLD,
  poolsFor,
  type GalleryView,
  type Settings,
  type TagPool,
} from "../settings";
import { clampCount, parseTags } from "../tags";
import type { TaggerState } from "../useTagger";

export type SettingsView = "general" | "pools";

const VIEW_LABELS: Record<GalleryView, string> = {
  masonry: "Masonry",
  tile: "Tile",
  list: "List",
};

type SettingsDialogProps = {
  view: SettingsView | null;
  settings: Settings;
  folder: string | null;
  onClose: () => void;
  onChange: (settings: Settings) => void;
  tagger: TaggerState;
  onPickModelFolder: () => void;
};

export function SettingsDialog({ view, settings, folder, onClose, onChange, tagger, onPickModelFolder }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = view !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.show();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  return (
    <>
    {open && <div className="scrim" />}
    <dialog ref={dialogRef} className="settings" onClose={onClose}>
      <form method="dialog">
        <div className="dialog-head">
          <h2>{view === "pools" ? "Tag pools" : "Settings"}</h2>
          <button className="icon-btn" type="button" aria-label="Close" title="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {view === "pools" ? (
          <TagPoolsSetting
            pools={settings.tagPools}
            folder={folder}
            onChange={(tagPools) => onChange({ ...settings, tagPools })}
          />
        ) : (
        <>
        <label className="setting check">
          <input
            type="checkbox"
            checked={settings.showSidecar}
            onChange={(event) => onChange({ ...settings, showSidecar: event.target.checked })}
          />
          Show sidecar text
        </label>
        <p className="hint-line sidecar-help">The caption file in the right panel.</p>
        <fieldset className="setting choices">
          <legend>Gallery view</legend>
          <p>How images are shown in the middle pane.</p>
          <div className="view-picks" role="radiogroup" aria-label="Gallery view">
            {GALLERY_VIEWS.map((view) => (
              <button
                key={view}
                type="button"
                className="view-pick"
                role="radio"
                aria-checked={settings.galleryView === view}
                onClick={() => onChange({ ...settings, galleryView: view })}
              >
                <ViewPreview view={view} />
                {VIEW_LABELS[view]}
              </button>
            ))}
          </div>
        </fieldset>
        <CountSlider
          label="Last tags used"
          hint="How many of the last tags you added to show. 0 hides the list."
          value={settings.recentCount}
          onChange={(recentCount) => onChange({ ...settings, recentCount: clampCount(recentCount) })}
        />
        <TaggerSetting tagger={tagger} onPickFolder={onPickModelFolder} />
        <CountSlider
          label="AI tag threshold"
          hint="Lowest confidence for a suggested tag."
          min={MIN_THRESHOLD}
          max={MAX_THRESHOLD}
          value={settings.taggerThreshold}
          shown={(settings.taggerThreshold / 100).toFixed(2)}
          onChange={(taggerThreshold) => onChange({ ...settings, taggerThreshold: clampThreshold(taggerThreshold) })}
        />
        </>
        )}
      </form>
    </dialog>
    </>
  );
}

function TagPoolsSetting({
  pools,
  folder,
  onChange,
}: {
  pools: readonly TagPool[];
  folder: string | null;
  onChange: (pools: TagPool[]) => void;
}) {
  const key = folder ? folderKey(folder) : null;

  const shown = poolsFor(pools, folder);

  function update(id: string, patch: Partial<TagPool>) {
    onChange(pools.map((pool) => (pool.id === id ? { ...pool, ...patch } : pool)));
  }

  // Shown pools are a slice of every pool, so move by neighbour, and only within global or folder pools.
  function move(from: number, to: number) {
    const moving = shown[from];
    const globals = shown.filter((pool) => !pool.folder).length;
    const at = moving.folder ? Math.max(to, globals) : Math.min(to, globals - 1);
    if (at === from) return;
    const rest = pools.filter((pool) => pool !== moving);
    rest.splice(rest.indexOf(shown[at]) + (at > from ? 1 : 0), 0, moving);
    onChange(rest);
  }

  return (
    <div className="setting">
      <p>Tags you add with one click in the right pane and filter by on the left. A pool shows only in this folder unless Global is on.</p>
      {shown.map((pool, index) => (
        <PoolEditor
          key={pool.id}
          pool={pool}
          rowProps={{ ...reorderHandlers(index, shown.length, false, move), "data-reorder-label": pool.name } as HTMLAttributes<HTMLDivElement>}
          folderKey={key}
          onChange={(patch) => update(pool.id, patch)}
          onRemove={() => onChange(pools.filter((item) => item.id !== pool.id))}
        />
      ))}
      <NewPool folderKey={key} onAdd={(pool) => onChange([...pools, pool])} />
    </div>
  );
}

function cleanPoolName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function NewPool({ folderKey, onAdd }: { folderKey: string | null; onAdd: (pool: TagPool) => void }) {
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [folderOnly, setFolderOnly] = useState(true);
  const clean = cleanPoolName(name);
  const tagList = parseTags(tags);
  const ready = Boolean(clean) && tagList.length > 0;

  function add() {
    if (!ready) return;
    onAdd({ id: crypto.randomUUID(), name: clean, tags: tagList, folder: folderOnly ? folderKey : null });
    setName("");
    setTags("");
    setFolderOnly(true);
  }

  return (
    <PoolFields
      footer={
        <button className="icon-btn pool-add" type="button" aria-label="Add pool" title="Add pool" disabled={!ready} onClick={add}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      }
      name={name}
      onName={setName}
      onEnter={add}
      folderOnly={folderOnly}
      folderKey={folderKey}
      onFolderOnly={setFolderOnly}
      tags={tags}
      tagsLabel="Tags in the new pool"
      onTags={setTags}
    />
  );
}

function PoolEditor({
  pool,
  rowProps,
  folderKey,
  onChange,
  onRemove,
}: {
  pool: TagPool;
  rowProps: HTMLAttributes<HTMLDivElement>;
  folderKey: string | null;
  onChange: (patch: Partial<TagPool>) => void;
  onRemove: () => void;
}) {
  // Raw text stays local so a trailing comma survives while typing.
  const [name, setName] = useState(pool.name);
  const [tags, setTags] = useState(pool.tags.join(", "));
  const [confirming, setConfirming] = useState(false);

  return (
    <PoolFields
      rowProps={rowProps}
      handle={
        <span className="pool-grip" title="Drag to reorder" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="9" cy="6" r="1" />
            <circle cx="15" cy="6" r="1" />
            <circle cx="9" cy="12" r="1" />
            <circle cx="15" cy="12" r="1" />
            <circle cx="9" cy="18" r="1" />
            <circle cx="15" cy="18" r="1" />
          </svg>
        </span>
      }
      action={
        <button
          className="icon-btn warn"
          type="button"
          aria-label={`Remove ${pool.name}`}
          title="Remove pool"
          onClick={() => setConfirming(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
          </svg>
        </button>
      }
      warning={
        confirming && (
          <div className="pool-head" role="alert">
            <span className="pool-warn">Remove {pool.name} and its tags?</span>
            <button className="quiet" type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button className="quiet warn" type="button" onClick={onRemove}>
              Remove
            </button>
          </div>
        )
      }
      name={name}
      onName={(value) => {
        setName(value);
        if (cleanPoolName(value)) onChange({ name: cleanPoolName(value) });
      }}
      onNameBlur={() => setName(pool.name)}
      folderOnly={pool.folder !== null}
      folderKey={folderKey}
      onFolderOnly={(checked) => onChange({ folder: checked ? folderKey : null })}
      tags={tags}
      tagsLabel={`Tags in ${pool.name}`}
      onTags={(value) => {
        setTags(value);
        if (parseTags(value).length) onChange({ tags: parseTags(value) });
      }}
      onTagsBlur={() => setTags(pool.tags.join(", "))}
    />
  );
}

function PoolFields({
  rowProps,
  handle,
  action,
  footer,
  warning,
  name,
  onName,
  onNameBlur,
  onEnter,
  folderOnly,
  folderKey,
  onFolderOnly,
  tags,
  tagsLabel,
  onTags,
  onTagsBlur,
}: {
  rowProps?: HTMLAttributes<HTMLDivElement>;
  handle?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  warning?: ReactNode;
  name: string;
  onName: (value: string) => void;
  onNameBlur?: () => void;
  onEnter?: () => void;
  folderOnly: boolean;
  folderKey: string | null;
  onFolderOnly: (checked: boolean) => void;
  tags: string;
  tagsLabel: string;
  onTags: (value: string) => void;
  onTagsBlur?: () => void;
}) {
  const global = !folderOnly || !folderKey;
  return (
    <div {...rowProps} className={global ? "pool-edit global" : "pool-edit"}>
      {warning || (
        <div className="pool-head">
          {handle}
          <input
            type="text"
            aria-label="Pool name"
            placeholder="Pool name"
            spellCheck={false}
            autoComplete="off"
            maxLength={40}
            value={name}
            onChange={(event) => onName(event.target.value)}
            onBlur={onNameBlur}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onEnter?.();
            }}
          />
          <button
            className="icon-btn"
            type="button"
            aria-label="Global"
            title={global ? "Global, shown in every folder" : "This folder only"}
            aria-pressed={global}
            disabled={!folderKey}
            onClick={() => onFolderOnly(!folderOnly)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
            </svg>
          </button>
          {action}
        </div>
      )}
      <textarea
        aria-label={tagsLabel}
        placeholder="i.e. portrait, upper body, cowboy shot"
        spellCheck={false}
        value={tags}
        onChange={(event) => onTags(event.target.value)}
        onBlur={onTagsBlur}
      />
      {footer}
    </div>
  );
}

function TaggerSetting({ tagger, onPickFolder }: { tagger: TaggerState; onPickFolder: () => void }) {
  const { status, progress, error, download } = tagger;
  const downloading = progress !== null;
  return (
    <div className="setting">
      AI tagger
      <p>WD ViT Tagger v3 suggests tags for the selected image. The model is about 370 MB and downloads only when you ask.</p>
      {status ? (
        <div className="model-row">
          <span className="model-path" title={status.folder}>
            {status.folder}
          </span>
          <button className="quiet" type="button" disabled={downloading} onClick={onPickFolder}>
            Change
          </button>
          {status.installed ? (
            <span className="model-state">Ready</span>
          ) : (
            <button className="quiet" type="button" disabled={downloading} onClick={() => void download()}>
              {downloading ? `Downloading ${progress}%` : "Download"}
            </button>
          )}
        </div>
      ) : (
        <p>Available in the desktop app.</p>
      )}
      {error && <p className="model-error">{error}</p>}
    </div>
  );
}

function CountSlider({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = 20,
  shown = String(value),
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  shown?: string;
}) {
  return (
    <label className="setting">
      <span className="slider-head">
        {label}
        <span className="slider-value">{shown}</span>
      </span>
      <p>{hint}</p>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-valuetext={shown}
        style={{ "--fill": `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ViewPreview({ view }: { view: GalleryView }) {
  return (
    <span className={`view-preview view-preview-${view}`} aria-hidden="true">
      {view === "masonry" && (
        <>
          <span className="vp-row">
            <span className="vp-block wide" />
            <span className="vp-block" />
            <span className="vp-block mid" />
          </span>
          <span className="vp-row">
            <span className="vp-block mid" />
            <span className="vp-block wide" />
          </span>
        </>
      )}
      {view === "tile" && (
        <>
          <span className="vp-block" />
          <span className="vp-block" />
          <span className="vp-block" />
          <span className="vp-block" />
          <span className="vp-block" />
          <span className="vp-block" />
        </>
      )}
      {view === "list" && (
        <>
          <span className="vp-row">
            <span className="vp-sq" />
            <span className="vp-line" />
          </span>
          <span className="vp-row">
            <span className="vp-sq" />
            <span className="vp-line" />
          </span>
          <span className="vp-row">
            <span className="vp-sq" />
            <span className="vp-line" />
          </span>
        </>
      )}
    </span>
  );
}
