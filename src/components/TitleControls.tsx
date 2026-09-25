import { useEffect, useState } from "react";
import { inTauri } from "../api";
import { closeWindow, listenMaximized, minimizeWindow, toggleMaximizeWindow } from "../window";

export function TitleControls() {
  const [maximized, setMaximized] = useState(false);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    setDesktop(inTauri());
  }, []);

  useEffect(() => {
    if (!desktop) return undefined;
    return listenMaximized(setMaximized);
  }, [desktop]);

  if (!desktop) return null;

  return (
    <div className="win-controls">
      <button type="button" className="win-btn" aria-label="Minimize" onClick={minimizeWindow}>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 6h8" />
        </svg>
      </button>
      <button type="button" className="win-btn" aria-label={maximized ? "Restore" : "Maximize"} onClick={toggleMaximizeWindow}>
        {maximized ? (
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3.5 4.5h5v5h-5zM4.5 3.5h5v5" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 2.5h7v7h-7z" />
          </svg>
        )}
      </button>
      <button type="button" className="win-btn close" aria-label="Close" onClick={closeWindow}>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      </button>
    </div>
  );
}
