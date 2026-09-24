type TopBarProps = {
  folder: string | null;
  captioned: number;
  total: number;
  busy: boolean;
  onOpen: () => void;
  onSettings: () => void;
};

export function TopBar({ folder, captioned, total, busy, onOpen, onSettings }: TopBarProps) {
  return (
    <header className="top">
      <div className="brand">
        <span className="mark" aria-hidden="true">
          B
        </span>
        BooruTagger
      </div>
      <div className="path" title={folder ?? undefined}>
        {folder ?? "No folder open"}
      </div>
      <button className="ghost" type="button" onClick={onOpen} disabled={busy}>
        Open folder
      </button>
      <button className="ghost" type="button" onClick={onSettings}>
        Settings
      </button>
      <div className="count">
        {folder ? (
          <>
            <b>{captioned}</b> of {total} captioned
          </>
        ) : (
          "No folder open"
        )}
      </div>
    </header>
  );
}
