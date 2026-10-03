import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { downloadTagger, errorMessage, inTauri, taggerStatus, type DownloadProgress, type TaggerStatus } from "./api";

export type TaggerState = {
  status: TaggerStatus | null;
  progress: number | null;
  error: string;
  download: () => Promise<void>;
};

export function useTagger(folder: string | null): TaggerState {
  const [status, setStatus] = useState<TaggerStatus | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!inTauri()) return undefined;
    let live = true;
    setError("");
    taggerStatus(folder)
      .then((next) => live && setStatus(next))
      .catch((err) => live && setError(errorMessage(err)));
    return () => {
      live = false;
    };
  }, [folder]);

  const download = useCallback(async () => {
    setError("");
    setProgress(0);
    const stop = await listen<DownloadProgress>("tagger-progress", ({ payload }) => {
      setProgress(payload.total ? Math.floor((payload.received / payload.total) * 100) : 0);
    });
    try {
      setStatus(await downloadTagger(folder));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      stop();
      setProgress(null);
    }
  }, [folder]);

  return { status, progress, error, download };
}
