import type { KeyboardEvent, PointerEvent } from "react";

// Inputs and buttons inside a draggable row keep their own pointer and arrow keys.
function fromControl(target: EventTarget): boolean {
  return Boolean((target as HTMLElement).closest("button, input, textarea"));
}

type ActiveDrag = {
  from: number;
  over: number;
  onMove: (from: number, to: number) => void;
  pointerId: number;
  horizontal: boolean;
  startX: number;
  startY: number;
  started: boolean;
  ghost: HTMLElement | null;
  marker: HTMLElement | null;
};

let activeDrag: ActiveDrag | null = null;

function reorderNodes(parent: HTMLElement): HTMLElement[] {
  return [...parent.querySelectorAll<HTMLElement>(":scope > [data-reorder-index]")];
}

function insertionIndex(parent: HTMLElement, x: number, y: number, horizontal: boolean, from: number): number {
  const nodes = reorderNodes(parent);
  let best: { index: number; box: DOMRect; dist: number } | null = null;
  for (const node of nodes) {
    const index = Number(node.dataset.reorderIndex);
    if (index === from) continue;
    const box = node.getBoundingClientRect();
    const nearestX = Math.max(box.left, Math.min(x, box.right));
    const nearestY = Math.max(box.top, Math.min(y, box.bottom));
    const dist = (x - nearestX) ** 2 + (y - nearestY) ** 2;
    if (!best || dist < best.dist) best = { index, box, dist };
  }
  if (!best) return from;
  const before = horizontal
    ? x < best.box.left + best.box.width / 2
    : y < best.box.top + best.box.height / 2;
  const gap = before ? best.index : best.index + 1;
  const to = gap <= from ? gap : gap - 1;
  return Math.max(0, Math.min(to, nodes.length - 1));
}

function makeGhost(source: HTMLElement): HTMLElement {
  const ghost = document.createElement("span");
  ghost.className = "chip tag-ghost";
  const label = source.querySelector(".tag, .tagname");
  const text = document.createElement("span");
  text.className = "tag";
  text.textContent = label?.textContent ?? source.dataset.reorderLabel ?? "";
  ghost.appendChild(text);
  document.body.appendChild(ghost);
  return ghost;
}

function placeGhost(ghost: HTMLElement, x: number, y: number) {
  ghost.style.left = `${x}px`;
  ghost.style.top = `${y}px`;
}

function placeMarker(marker: HTMLElement, parent: HTMLElement, to: number, from: number, horizontal: boolean) {
  const node = reorderNodes(parent).find((item) => Number(item.dataset.reorderIndex) === to);
  if (!node) {
    marker.hidden = true;
    return;
  }
  marker.hidden = false;
  const box = node.getBoundingClientRect();
  const after = to > from;
  if (horizontal) {
    const edge = after ? box.right + 3 : box.left - 3;
    marker.style.left = `${edge - 1}px`;
    marker.style.top = `${box.top}px`;
    marker.style.width = "2px";
    marker.style.height = `${box.height}px`;
  } else {
    const edge = after ? box.bottom + 2 : box.top - 2;
    marker.style.left = `${box.left}px`;
    marker.style.top = `${edge - 1}px`;
    marker.style.width = `${box.width}px`;
    marker.style.height = "2px";
  }
}

function beginReorder(source: HTMLElement, x: number, y: number) {
  if (!activeDrag || activeDrag.started) return;
  activeDrag.started = true;
  source.classList.add("dragging");
  const ghost = makeGhost(source);
  const marker = document.createElement("div");
  marker.className = "tag-insert";
  document.body.appendChild(marker);
  activeDrag.ghost = ghost;
  activeDrag.marker = marker;
  placeGhost(ghost, x, y);
  const parent = source.parentElement;
  if (parent) placeMarker(marker, parent, activeDrag.over, activeDrag.from, activeDrag.horizontal);
}

function finishReorder(node: HTMLElement) {
  node.classList.remove("dragging");
  activeDrag?.ghost?.remove();
  activeDrag?.marker?.remove();
  if (node.hasPointerCapture?.(activeDrag?.pointerId ?? -1)) {
    try {
      node.releasePointerCapture(activeDrag!.pointerId);
    } catch {
      /* pointer already released */
    }
  }
  activeDrag = null;
}

export function reorderHandlers(
  index: number,
  count: number,
  horizontal: boolean,
  onMove: (from: number, to: number) => void,
) {
  return {
    tabIndex: 0,
    "data-reorder-index": String(index),
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      if (fromControl(event.target)) return;
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* pointer capture is unavailable for this event */
      }
      event.currentTarget.focus();
      activeDrag = {
        from: index,
        over: index,
        onMove,
        pointerId: event.pointerId,
        horizontal,
        startX: event.clientX,
        startY: event.clientY,
        started: false,
        ghost: null,
        marker: null,
      };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
      const moved = Math.hypot(event.clientX - activeDrag.startX, event.clientY - activeDrag.startY);
      if (!activeDrag.started) {
        if (moved < 4) return;
        beginReorder(event.currentTarget, event.clientX, event.clientY);
      }
      const parent = event.currentTarget.parentElement;
      if (!parent || !activeDrag.ghost || !activeDrag.marker) return;
      placeGhost(activeDrag.ghost, event.clientX, event.clientY);
      const to = insertionIndex(parent, event.clientX, event.clientY, activeDrag.horizontal, activeDrag.from);
      activeDrag.over = to;
      placeMarker(activeDrag.marker, parent, to, activeDrag.from, activeDrag.horizontal);
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
      const { from, over, onMove: move, started } = activeDrag;
      finishReorder(event.currentTarget);
      if (started && over !== from) move(from, over);
    },
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
      finishReorder(event.currentTarget);
    },
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      const previous = horizontal ? "ArrowLeft" : "ArrowUp";
      const next = horizontal ? "ArrowRight" : "ArrowDown";
      if (event.key !== previous && event.key !== next) return;
      if (fromControl(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      const to = index + (event.key === previous ? -1 : 1);
      if (to < 0 || to >= count) return;
      onMove(index, to);
    },
  };
}
