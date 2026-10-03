import { useEffect, useRef, type CSSProperties } from "react";
import { clampThreshold, GALLERY_VIEWS, MAX_THRESHOLD, MIN_THRESHOLD, type GalleryView, type Settings } from "../settings";
import { clampCount } from "../tags";
import type { TaggerState } from "../useTagger";

const VIEW_LABELS: Record<GalleryView, string> = {
  masonry: "Masonry",
  tile: "Tile",
  list: "List",
};

type SettingsDialogProps = {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onChange: (settings: Settings) => void;
  tagger: TaggerState;
  onPickModelFolder: () => void;
};

export function SettingsDialog({ open, settings, onClose, onChange, tagger, onPickModelFolder }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

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
        <h2>Settings</h2>
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
        <button className="quiet" type="submit">
          Done
        </button>
      </form>
    </dialog>
    </>
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
