import { useState } from "react";
import mark from "../../src-tauri/icons/32x32.png";
import { useAnchoredMenu } from "./ImageMenu";
import type { PaneSide } from "../settings";
import type { SettingsView } from "./SettingsDialog";
import { TitleControls } from "./TitleControls";
import { toggleMaximizeWindow } from "../window";

type TopBarProps = {
  folder: string | null;
  busy: boolean;
  popupOpen: boolean;
  onOpen: () => void;
  onSettings: (view: SettingsView) => void;
  onAbout: () => void;
  updateVersion: string | null;
  leftOpen: boolean;
  rightOpen: boolean;
  onTogglePane: (side: PaneSide) => void;
};

type MenuPick = SettingsView | "about";

export function TopBar({
  folder,
  busy,
  popupOpen,
  onOpen,
  onSettings,
  onAbout,
  updateVersion,
  leftOpen,
  rightOpen,
  onTogglePane,
}: TopBarProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <header className="top">
      <div className="brand" data-tauri-drag-region onDoubleClick={toggleMaximizeWindow}>
        <img className="brand-mark" src={mark} alt="" />
        BooruTagger
      </div>
      <div className="top-actions">
        <button className="icon-btn" type="button" onClick={onOpen} disabled={busy || popupOpen} aria-label="Open folder" title="Open folder">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
        </button>
        <button
          className="icon-btn"
          type="button"
          disabled={popupOpen}
          aria-label="Settings"
          title={updateVersion ? `Settings. Version ${updateVersion} is available.` : "Settings"}
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          // Keeps the menu's outside-click close from reopening it on the same click.
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setMenu(menu ? null : { x: box.left, y: box.bottom + 2 });
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          {updateVersion && <span className="update-dot" aria-hidden="true" />}
        </button>
      </div>
      <div className="spacer" data-tauri-drag-region onDoubleClick={toggleMaximizeWindow} />
      {folder && (
        <div className="path" data-tauri-drag-region title={folder} onDoubleClick={toggleMaximizeWindow}>
          {folder}
        </div>
      )}
      {folder && (
        <div className="pane-toggles">
          <button
            className="icon-btn"
            type="button"
            aria-label="Working set"
            title={leftOpen ? "Hide working set" : "Show working set"}
            aria-pressed={leftOpen}
            onClick={() => onTogglePane("left")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
            </svg>
          </button>
          <button
            className="icon-btn"
            type="button"
            aria-label="Caption sheet"
            title={rightOpen ? "Hide caption sheet" : "Show caption sheet"}
            aria-pressed={rightOpen}
            onClick={() => onTogglePane("right")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M15 4v16" />
            </svg>
          </button>
        </div>
      )}
      <TitleControls />
      {menu && (
        <SettingsMenu
          x={menu.x}
          y={menu.y}
          updateVersion={updateVersion}
          onClose={() => setMenu(null)}
          onPick={(pick) => {
            setMenu(null);
            if (pick === "about") onAbout();
            else onSettings(pick);
          }}
        />
      )}
    </header>
  );
}

function SettingsMenu({
  x,
  y,
  updateVersion,
  onClose,
  onPick,
}: {
  x: number;
  y: number;
  updateVersion: string | null;
  onClose: () => void;
  onPick: (pick: MenuPick) => void;
}) {
  const ref = useAnchoredMenu(x, y, onClose);
  return (
    <div ref={ref} className="menu" role="menu" aria-label="Settings" style={{ left: x, top: y }}>
      <button type="button" role="menuitem" onClick={() => onPick("pools")}>
        Tag pools
      </button>
      <button type="button" role="menuitem" onClick={() => onPick("general")}>
        Settings
      </button>
      <hr />
      {updateVersion && (
        <button className="update" type="button" role="menuitem" onClick={() => onPick("about")}>
          Update to {updateVersion}
        </button>
      )}
      <button type="button" role="menuitem" onClick={() => onPick("about")}>
        About
      </button>
    </div>
  );
}
