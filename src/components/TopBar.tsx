import { TitleControls } from "./TitleControls";
import { toggleMaximizeWindow } from "../window";

type TopBarProps = {
  folder: string | null;
  busy: boolean;
  popupOpen: boolean;
  onOpen: () => void;
  onSettings: () => void;
};

export function TopBar({ folder, busy, popupOpen, onOpen, onSettings }: TopBarProps) {
  return (
    <header className="top">
      <div className="brand" data-tauri-drag-region onDoubleClick={toggleMaximizeWindow}>
        BooruTagger
      </div>
      <div className="top-actions">
        <button className="icon-btn" type="button" onClick={onOpen} disabled={busy || popupOpen} aria-label="Open folder" title="Open folder">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
        </button>
        <button className="icon-btn" type="button" onClick={onSettings} disabled={popupOpen} aria-label="Settings" title="Settings">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
      <div className="spacer" data-tauri-drag-region onDoubleClick={toggleMaximizeWindow} />
      {folder && (
        <div className="path" data-tauri-drag-region title={folder} onDoubleClick={toggleMaximizeWindow}>
          {folder}
        </div>
      )}
      <TitleControls />
    </header>
  );
}
