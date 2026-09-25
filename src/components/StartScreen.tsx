type StartScreenProps = {
  busy: boolean;
  onOpen: () => void;
};

export function StartScreen({ busy, onOpen }: StartScreenProps) {
  return (
    <main className="start" aria-label="Open a dataset">
      <div className="start-card">
        <h1>Open a dataset folder</h1>
        <p>
          Each image keeps a sidecar <span className="mono">.txt</span> of comma-separated tags, including
          images in subfolders.
        </p>
        <button className="start-open" type="button" onClick={onOpen} disabled={busy}>
          Open folder
        </button>
      </div>
    </main>
  );
}
