import { useEffect, useRef, type CSSProperties } from "react";
import { GALLERY_VIEWS, type GalleryView, type Settings } from "../settings";
import { clampCount } from "../tags";

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
};

export function SettingsDialog({ open, settings, onClose, onChange }: SettingsDialogProps) {
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
          onChange={(recentCount) => onChange({ ...settings, recentCount })}
        />
        <button className="quiet" type="submit">
          Done
        </button>
      </form>
    </dialog>
    </>
  );
}

function CountSlider({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="setting">
      <span className="slider-head">
        {label}
        <span className="slider-value">{value}</span>
      </span>
      <p>{hint}</p>
      <input
        type="range"
        min={0}
        max={20}
        step={1}
        value={value}
        aria-valuetext={String(value)}
        style={{ "--fill": `${(value / 20) * 100}%` } as CSSProperties}
        onChange={(event) => onChange(clampCount(event.target.value))}
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
