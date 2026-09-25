import { getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri } from "./api";

export type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

function current() {
  return getCurrentWindow();
}

export function minimizeWindow() {
  if (!inTauri()) return;
  void current().minimize();
}

export function toggleMaximizeWindow() {
  if (!inTauri()) return;
  void current().toggleMaximize();
}

export function closeWindow() {
  if (!inTauri()) return;
  void current().close();
}

export function resizeWindow(edge: ResizeDirection) {
  if (!inTauri()) return;
  void current().startResizeDragging(edge);
}

export function listenMaximized(onChange: (maximized: boolean) => void): () => void {
  if (!inTauri()) return () => undefined;
  const window = current();
  let stop = () => {};
  void window.isMaximized().then(onChange);
  void window
    .onResized(() => {
      void window.isMaximized().then(onChange);
    })
    .then((unlisten) => {
      stop = unlisten;
    });
  return () => stop();
}
