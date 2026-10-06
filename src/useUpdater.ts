import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { errorMessage, inTauri } from "./api";

export type UpdaterState = {
  version: string | null;
  update: Update | null;
  checking: boolean;
  checked: boolean;
  progress: number | null;
  error: string;
  checkNow: () => Promise<void>;
  install: () => Promise<void>;
};

// Checks once at launch without showing errors; About shows errors from a manual check.
export function useUpdater(saveFirst: () => Promise<boolean>): UpdaterState {
  const [version, setVersion] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!inTauri()) return;
    void getVersion().then(setVersion);
    void check()
      .then(setUpdate)
      .catch(() => undefined);
  }, []);

  const checkNow = useCallback(async () => {
    if (!inTauri()) return;
    setChecking(true);
    setError("");
    try {
      setUpdate(await check());
      setChecked(true);
    } catch {
      setError("Could not check for updates. Try again later.");
    } finally {
      setChecking(false);
    }
  }, []);

  const install = useCallback(async () => {
    if (!update) return;
    setError("");
    setProgress(0);
    try {
      if (!(await saveFirst())) throw new Error("Captions could not be saved, so the update was not installed.");
      let total = 0;
      let received = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          received += event.data.chunkLength;
          setProgress(total ? Math.floor((received / total) * 100) : 0);
        }
      });
    } catch (err) {
      setError(errorMessage(err));
      setProgress(null);
    }
  }, [update, saveFirst]);

  return { version, update, checking, checked, progress, error, checkNow, install };
}
