import { useEffect, useState } from "react";
import { inTauri } from "../api";
import { resizeWindow, type ResizeDirection } from "../window";

const EDGES: { edge: ResizeDirection; className: string }[] = [
  { edge: "North", className: "n" },
  { edge: "South", className: "s" },
  { edge: "East", className: "e" },
  { edge: "West", className: "w" },
  { edge: "NorthEast", className: "ne" },
  { edge: "NorthWest", className: "nw" },
  { edge: "SouthEast", className: "se" },
  { edge: "SouthWest", className: "sw" },
];

export function ResizeEdges() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    setDesktop(inTauri());
  }, []);
  if (!desktop) return null;
  return (
    <div className="resize-frame" aria-hidden="true">
      {EDGES.map(({ edge, className }) => (
        <i key={edge} className={`resize ${className}`} onMouseDown={() => resizeWindow(edge)} />
      ))}
    </div>
  );
}
