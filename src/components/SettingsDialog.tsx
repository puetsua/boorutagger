import { useEffect, useRef } from "react";
import { THEMES, type Settings } from "../settings";
import { clampCount } from "../tags";

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
        <div className="setting">
          Theme
          <p>Fluent 2 dark, five purple brands.</p>
          <div className="theme-grid">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className="theme-swatch"
                aria-pressed={settings.theme === theme.id}
                onClick={() => onChange({ ...settings, theme: theme.id })}
              >
                <i style={{ background: theme.swatch }} />
                {theme.name}
              </button>
            ))}
          </div>
        </div>
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
