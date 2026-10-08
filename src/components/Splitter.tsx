import { clampPane, type PaneSide } from "../settings";

const MIN_GALLERY = 320;

// Dragging moves the CSS width live and saves once on release.
export function Splitter({ side, width, onResize }: { side: PaneSide; width: number; onResize: (width: number) => void }) {
  return (
    <div
      className={`splitter ${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={side === "left" ? "Resize working set" : "Resize caption sheet"}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const handle = event.currentTarget;
        const body = handle.parentElement;
        const gallery = body?.querySelector<HTMLElement>(".stage");
        if (!body || !gallery) return;
        const startX = event.clientX;
        const room = width + gallery.clientWidth - MIN_GALLERY;
        let next = width;
        handle.setPointerCapture(event.pointerId);
        handle.classList.add("dragging");
        function move(moveEvent: PointerEvent) {
          const delta = side === "left" ? moveEvent.clientX - startX : startX - moveEvent.clientX;
          next = clampPane(side, Math.min(width + delta, room));
          body?.style.setProperty(`--${side}-pane`, `${next}px`);
        }
        function end() {
          handle.classList.remove("dragging");
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", end);
          handle.removeEventListener("pointercancel", end);
          onResize(next);
        }
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", end);
        handle.addEventListener("pointercancel", end);
      }}
    />
  );
}
