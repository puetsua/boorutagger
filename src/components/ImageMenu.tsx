import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ImageItem } from "../types";

const INVALID_NAME = /[\\/:*?"<>|]/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function fileParts(name: string): { stem: string; ext: string } {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return { stem: base, ext: "" };
  return { stem: base.slice(0, dot), ext: base.slice(dot) };
}

export function renameProblem(stem: string): string {
  if (!stem || stem === "." || stem === "..") return "Enter a file name.";
  if (INVALID_NAME.test(stem) || stem.endsWith(" ") || stem.endsWith(".")) {
    return "That file name has a character Windows does not allow.";
  }
  if (RESERVED.test(stem)) return "That file name is reserved by Windows.";
  return "";
}

type ImageMenuProps = {
  x: number;
  y: number;
  image: ImageItem;
  selectedCount: number;
  canReveal: boolean;
  isReference: boolean;
  onClose: () => void;
  onRename: () => void;
  onReveal: () => void;
  onCopyTags: () => void;
  onPasteTags: () => void;
  onCopyFilename: () => void;
  onCopyPath: () => void;
  onAddReference: () => void;
};

export function ImageMenu({
  x,
  y,
  image,
  selectedCount,
  canReveal,
  isReference,
  onClose,
  onRename,
  onReveal,
  onCopyTags,
  onPasteTags,
  onCopyFilename,
  onCopyPath,
  onAddReference,
}: ImageMenuProps) {
  const ref = useAnchoredMenu(x, y, onClose);
  const pasteLabel = selectedCount > 1 ? `Paste tags on ${selectedCount} images` : "Paste tags";

  return (
    <div ref={ref} className="menu" role="menu" aria-label={`Actions for ${image.name}`} style={{ left: x, top: y }}>
      <button type="button" role="menuitem" onClick={onRename}>
        Rename
      </button>
      <button type="button" role="menuitem" onClick={onReveal} disabled={!canReveal}>
        Reveal in Explorer
      </button>
      <hr />
      <button type="button" role="menuitem" onClick={onCopyTags} disabled={!image.caption.trim()}>
        Copy tags
      </button>
      <button type="button" role="menuitem" onClick={onPasteTags}>
        {pasteLabel}
      </button>
      <button type="button" role="menuitem" onClick={onCopyFilename}>
        Copy filename
      </button>
      <button type="button" role="menuitem" onClick={onCopyPath}>
        Copy path
      </button>
      <hr />
      <button type="button" role="menuitem" onClick={onAddReference} disabled={isReference}>
        Add as reference
      </button>
    </div>
  );
}

type TagMenuProps = {
  x: number;
  y: number;
  tag: string;
  onClose: () => void;
  onHas: () => void;
  onWithout: () => void;
  onOnly: () => void;
  onCopy: () => void;
  onApply?: () => void;
  onRemove?: () => void;
};

export function TagMenu({ x, y, tag, onClose, onHas, onWithout, onOnly, onCopy, onApply, onRemove }: TagMenuProps) {
  const ref = useAnchoredMenu(x, y, onClose);
  const name = tag;

  return (
    <div ref={ref} className="menu" role="menu" aria-label={name} style={{ left: x, top: y }}>
      <button type="button" role="menuitem" onClick={onHas}>
        Has tag
      </button>
      <button type="button" role="menuitem" onClick={onWithout}>
        Without tag
      </button>
      <button type="button" role="menuitem" onClick={onOnly}>
        Only this tag
      </button>
      {(onApply || onRemove) && (
        <>
          <hr />
          {onApply && (
            <button type="button" role="menuitem" onClick={onApply}>
              Apply to selected
            </button>
          )}
          {onRemove && (
            <button className="warn" type="button" role="menuitem" onClick={onRemove}>
              Remove from selected
            </button>
          )}
        </>
      )}
      <hr />
      <button type="button" role="menuitem" onClick={onCopy}>
        Copy tag
      </button>
    </div>
  );
}

function useAnchoredMenu(x: number, y: number, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const box = menu.getBoundingClientRect();
    const titlebar = document.querySelector(".top")?.getBoundingClientRect().height ?? 32;
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - box.width - 8))}px`;
    menu.style.top = `${Math.max(titlebar, Math.min(y, window.innerHeight - box.height - 8))}px`;
  }, [x, y]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    function onPointer(event: MouseEvent) {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    }
    function onScroll() {
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  return ref;
}

type RenameDialogProps = {
  image: ImageItem;
  onClose: () => void;
  onSubmit: (stem: string) => Promise<void>;
};

export function RenameDialog({ image, onClose, onSubmit }: RenameDialogProps) {
  const { stem, ext } = fileParts(image.name);
  const [value, setValue] = useState(stem);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.show();
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

  return (
    <>
    <div className="scrim" />
    <dialog ref={dialogRef} className="rename" aria-label={`Rename ${image.name}`} onClose={onClose}>
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          const next = value.trim();
          const issue = renameProblem(next);
          if (issue) {
            setProblem(issue);
            return;
          }
          if (next === stem) {
            onClose();
            return;
          }
          setBusy(true);
          setProblem("");
          void onSubmit(next).catch((err: unknown) => {
            setProblem(err instanceof Error ? err.message : "Could not rename the image.");
            setBusy(false);
          });
        }}
      >
        <h2>Rename image</h2>
        <p className="hint-line">The caption file is renamed with the image.</p>
        <label className="rename-field">
          New name
          <span>
            <input
              ref={inputRef}
              value={value}
              spellCheck={false}
              autoComplete="off"
              disabled={busy}
              aria-label="New file name"
              onChange={(event) => setValue(event.target.value)}
            />
            <span>{ext}</span>
          </span>
        </label>
        {problem && (
          <p className="sheet-error" role="alert">
            {problem}
          </p>
        )}
        <div className="dialog-actions">
          <button className="quiet" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="quiet" type="submit" disabled={busy}>
            Rename
          </button>
        </div>
      </form>
    </dialog>
    </>
  );
}
