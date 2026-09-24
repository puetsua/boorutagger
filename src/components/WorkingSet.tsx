import { useEffect, useState } from "react";
import { pretty } from "../tags";

type WorkingSetProps = {
  total: number;
  shown: number;
  emptyCount: number;
  query: string;
  hasTags: readonly string[];
  missingTags: readonly string[];
  activePreset: "all" | "empty" | "";
  resetToken: number;
  onQuery: (value: string) => void;
  onPreset: (preset: "all" | "empty") => void;
  onAddFilter: (kind: "has" | "missing", raw: string) => void;
  onRemoveFilter: (kind: "has" | "missing", tag: string) => void;
};

export function WorkingSet({
  total,
  shown,
  emptyCount,
  query,
  hasTags,
  missingTags,
  activePreset,
  resetToken,
  onQuery,
  onPreset,
  onAddFilter,
  onRemoveFilter,
}: WorkingSetProps) {
  const [hasDraft, setHasDraft] = useState("");
  const [missDraft, setMissDraft] = useState("");

  useEffect(() => {
    setHasDraft("");
    setMissDraft("");
  }, [resetToken]);

  return (
    <aside className="filters" aria-label="Working set">
      <h2>Working set</h2>
      <label className="kicker" htmlFor="search">
        Find
      </label>
      <input
        id="search"
        type="text"
        placeholder="Filename or tag"
        spellCheck={false}
        autoComplete="off"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />
      <button
        className="preset"
        type="button"
        aria-pressed={activePreset === "all"}
        onClick={() => onPreset("all")}
      >
        All images<span>{total}</span>
      </button>
      <button
        className="preset"
        type="button"
        aria-pressed={activePreset === "empty"}
        onClick={() => onPreset("empty")}
      >
        Needs caption<span>{emptyCount}</span>
      </button>
      <div className="kicker">Has tag</div>
      <FilterChips tags={hasTags} kind="has" onRemove={onRemoveFilter} />
      <input
        type="text"
        list="vocab"
        placeholder="Add a tag filter"
        spellCheck={false}
        autoComplete="off"
        value={hasDraft}
        onChange={(event) => setHasDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onAddFilter("has", hasDraft);
          setHasDraft("");
        }}
      />
      <div className="kicker">Missing tag</div>
      <FilterChips tags={missingTags} kind="missing" onRemove={onRemoveFilter} />
      <input
        type="text"
        list="vocab"
        placeholder="Add a tag filter"
        spellCheck={false}
        autoComplete="off"
        value={missDraft}
        onChange={(event) => setMissDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onAddFilter("missing", missDraft);
          setMissDraft("");
        }}
      />
      <div className="shown">
        {shown} of {total} shown
      </div>
    </aside>
  );
}

function FilterChips({
  tags,
  kind,
  onRemove,
}: {
  tags: readonly string[];
  kind: "has" | "missing";
  onRemove: (kind: "has" | "missing", tag: string) => void;
}) {
  if (!tags.length) return <div className="fchips" />;
  return (
    <div className="fchips">
      {tags.map((tag) => (
        <span className="fchip" key={tag}>
          <span>{pretty(tag)}</span>
          <button type="button" aria-label={`Remove ${pretty(tag)} filter`} onClick={() => onRemove(kind, tag)}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
