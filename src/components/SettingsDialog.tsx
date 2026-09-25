import { useEffect, useRef } from "react";
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
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
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
        <label className="setting">
          Frequently used tags
          <p>How many of the most common tags to show. 0 hides the list.</p>
          <input
            type="number"
            min={0}
            max={20}
            value={settings.frequentCount}
            onChange={(event) => onChange({ ...settings, frequentCount: clampCount(event.target.value) })}
          />
        </label>
        <label className="setting">
          Last tags used
          <p>Show the last n tags you added. 0 hides the list. n can be 0 to 20.</p>
          <input
            type="number"
            min={0}
            max={20}
            value={settings.recentCount}
            onChange={(event) => onChange({ ...settings, recentCount: clampCount(event.target.value) })}
          />
        </label>
        <button className="quiet" type="submit">
          Done
        </button>
      </form>
    </dialog>
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
