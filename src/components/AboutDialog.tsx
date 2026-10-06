import { useEffect, useRef } from "react";
import mark from "../../src-tauri/icons/32x32.png";
import { openLink, REPO_URL } from "../api";
import type { UpdaterState } from "../useUpdater";

type AboutDialogProps = {
  updater: UpdaterState;
  onClose: () => void;
};

export function AboutDialog({ updater, onClose }: AboutDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { version, update, checking, checked, progress, error, checkNow, install } = updater;
  const installing = progress !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.show();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || installing) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [installing, onClose]);

  let status = "";
  if (installing) status = progress < 100 ? `Downloading ${progress}%` : "Installing…";
  else if (update) status = `Version ${update.version} is available.`;
  else if (checking) status = "Checking for updates…";
  else if (checked) status = "You have the latest version.";

  return (
    <>
      <div className="scrim" />
      <dialog ref={dialogRef} className="about" aria-label="About BooruTagger" onClose={onClose}>
        <div className="dialog-head">
          <h2>About</h2>
          <button className="icon-btn" type="button" aria-label="Close" title="Close" disabled={installing} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="about-app">
          <img src={mark} alt="" />
          <div>
            <div className="about-name">BooruTagger</div>
            <div className="about-version">{version ? `Version ${version}` : "Browser preview"}</div>
          </div>
        </div>
        {status && <p className="hint-line">{status}</p>}
        {error && (
          <p className="sheet-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button className="quiet" type="button" onClick={() => void openLink(REPO_URL)}>
            GitHub
          </button>
          {update ? (
            <button className="quiet" type="button" disabled={installing} onClick={() => void install()}>
              Update and restart
            </button>
          ) : (
            <button className="quiet" type="button" disabled={!version || checking} onClick={() => void checkNow()}>
              Check for updates
            </button>
          )}
        </div>
      </dialog>
    </>
  );
}
