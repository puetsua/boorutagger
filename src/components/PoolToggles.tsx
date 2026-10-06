import type { TagPool } from "../settings";

export function PoolToggles({
  pools,
  active,
  label,
  onToggle,
}: {
  pools: readonly TagPool[];
  active: (id: string) => boolean;
  label: string;
  onToggle: (id: string) => void;
}) {
  if (!pools.length) return null;
  return (
    <div className="tag-badges pool-toggles" aria-label={label}>
      {pools.map((pool) => (
        <button
          key={pool.id}
          type="button"
          className="tag-badge"
          title={pool.tags.join(", ")}
          aria-pressed={active(pool.id)}
          onClick={() => onToggle(pool.id)}
        >
          <span>{pool.name}</span>
        </button>
      ))}
    </div>
  );
}
