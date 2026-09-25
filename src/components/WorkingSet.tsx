import { useEffect, useRef, useState } from "react";
import type { FilterPreset } from "../settings";

type WorkingSetProps = {
  total: number;
  shown: number;
  emptyCount: number;
  query: string;
  hasTags: readonly string[];
  missingTags: readonly string[];
  presets: readonly FilterPreset[];
  activePreset: "all" | "empty" | "";
  activeSavedId: string;
  resetToken: number;
  onQuery: (value: string) => void;
  onPreset: (preset: "all" | "empty") => void;
  onApplySaved: (id: string) => void;
  onSavePreset: (name: string) => void;
  onOverridePreset: (id: string) => void;
  overridePreset: FilterPreset | null;
  onRenamePreset: (id: string, name: string) => void;
  onRemovePreset: (id: string) => void;
  onAddFilter: (kind: "has" | "missing", raw: string) => void;
  onRemoveFilter: (kind: "has" | "missing", tag: string) => void;
  onClear: () => void;
};

export function WorkingSet({
  total,
  shown,
  emptyCount,
  query,
  hasTags,
  missingTags,
  presets,
  activePreset,
  activeSavedId,
  resetToken,
  onQuery,
  onPreset,
  onApplySaved,
  onSavePreset,
  onOverridePreset,
  overridePreset,
  onRenamePreset,
  onRemovePreset,
  onAddFilter,
  onRemoveFilter,
  onClear,
}: WorkingSetProps) {
  const [hasDraft, setHasDraft] = useState("");
  const [missDraft, setMissDraft] = useState("");
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const skipSave = useRef(false);
  const canSave = !activeSavedId && (hasTags.length > 0 || missingTags.length > 0);
  const filtering = Boolean(query.trim()) || hasTags.length > 0 || missingTags.length > 0 || activePreset === "empty";
  const selectedPresetId = activeSavedId || overridePreset?.id || "";

  useEffect(() => {
    setHasDraft("");
    setMissDraft("");
  }, [resetToken]);

  function startNaming() {
    setPresetName(suggestPresetName(hasTags, missingTags));
    setNaming(true);
  }

  function commitName() {
    const name = presetName.trim();
    setNaming(false);
    setPresetName("");
    if (name) onSavePreset(name);
  }

  function cancelNaming() {
    skipSave.current = true;
    setNaming(false);
    setPresetName("");
  }

  function startRename(preset: FilterPreset) {
    if (naming) cancelNaming();
    setEditingId(preset.id);
    setEditName(preset.name);
  }

  function commitRename() {
    const id = editingId;
    const name = editName.trim();
    setEditingId(null);
    setEditName("");
    if (id && name) onRenamePreset(id, name);
  }

  function cancelRename() {
    skipSave.current = true;
    setEditingId(null);
    setEditName("");
  }

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
        Untagged<span>{emptyCount}</span>
      </button>
      {presets.map((preset) => (
        <div className="preset-row" key={preset.id}>
          {editingId === preset.id ? (
            <input
              className="preset-name"
              type="text"
              aria-label={`Preset name for ${preset.name}`}
              spellCheck={false}
              autoComplete="off"
              autoFocus
              maxLength={40}
              value={editName}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setEditName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitRename();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelRename();
                }
              }}
              onBlur={() => {
                if (skipSave.current) {
                  skipSave.current = false;
                  return;
                }
                commitRename();
              }}
            />
          ) : (
            <button
              className="preset"
              type="button"
              title={`${presetDetail(preset)}. Double-click to rename.`}
              aria-pressed={selectedPresetId === preset.id}
              onClick={() => {
                if (selectedPresetId === preset.id) startRename(preset);
                else onApplySaved(preset.id);
              }}
              onDoubleClick={() => startRename(preset)}
            >
              {preset.name}
            </button>
          )}
          <button
            className="preset-remove"
            type="button"
            aria-label={`Remove preset ${preset.name}`}
            onClick={() => onRemovePreset(preset.id)}
          >
            ×
          </button>
        </div>
      ))}
      {canSave && !naming && (
        <div className="preset-actions">
          {overridePreset ? (
            <button className="preset save" type="button" onClick={() => onOverridePreset(overridePreset.id)}>
              Save
            </button>
          ) : (
            <button className="preset save" type="button" onClick={startNaming}>
              Save
            </button>
          )}
          {overridePreset && (
            <button className="preset save" type="button" onClick={startNaming}>
              Save as new
            </button>
          )}
        </div>
      )}
      {canSave && naming && (
        <input
          className="preset-name"
          type="text"
          placeholder="Preset name"
          spellCheck={false}
          autoComplete="off"
          autoFocus
          maxLength={40}
          value={presetName}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setPresetName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitName();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              cancelNaming();
            }
          }}
          onBlur={() => {
            if (skipSave.current) {
              skipSave.current = false;
              return;
            }
            commitName();
          }}
        />
      )}
      <hr className="split" />
      <div className="kicker">Has tag</div>
      <FilterChips tags={hasTags} kind="has" onRemove={onRemoveFilter} />
      <input
        type="text"
        list="vocab"
        placeholder="Add a tag to filter images"
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
      <div className="kicker">Without tag</div>
      <FilterChips tags={missingTags} kind="missing" onRemove={onRemoveFilter} />
      <input
        type="text"
        list="vocab"
        placeholder="Add a tag to filter images"
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
      {filtering && (
        <button
          className="preset clear-filters"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (naming) cancelNaming();
            if (editingId) cancelRename();
            onClear();
          }}
        >
          Clear filters
        </button>
      )}
      <div className="shown">
        {shown} of {total} shown
      </div>
    </aside>
  );
}

function suggestPresetName(hasTags: readonly string[], missingTags: readonly string[]): string {
  const has = hasTags.join(", ");
  const missing = missingTags.map((tag) => `without ${tag}`).join(", ");
  return [has, missing].filter(Boolean).join(", ").slice(0, 40);
}

function presetDetail(preset: FilterPreset): string {
  const parts: string[] = [];
  if (preset.hasTags.length) parts.push(`Has ${preset.hasTags.join(", ")}`);
  if (preset.missingTags.length) parts.push(`Without ${preset.missingTags.join(", ")}`);
  return parts.join(". ");
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
          <span>{tag}</span>
          <button type="button" aria-label={`Remove ${tag} filter`} onClick={() => onRemove(kind, tag)}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
