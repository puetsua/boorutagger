import { useCallback, useEffect, useRef } from "react";
import { errorMessage, inTauri, writeCaptions } from "./api";

type SaveItem = { path: string; text: string };

export function useCaptionSaver(setError: (message: string) => void) {
  const pending = useRef(new Map<string, string>());
  const chain = useRef(Promise.resolve());
  const timer = useRef(0);
  const setErrorRef = useRef(setError);
  setErrorRef.current = setError;

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const run = async (): Promise<boolean> => {
      const batch: SaveItem[] = [...pending.current.entries()].map(([path, text]) => ({ path, text }));
      if (!batch.length) return true;
      pending.current.clear();
      try {
        if (inTauri()) await writeCaptions(batch);
        setErrorRef.current("");
        return true;
      } catch (err) {
        for (const item of batch) {
          if (!pending.current.has(item.path)) pending.current.set(item.path, item.text);
        }
        setErrorRef.current(errorMessage(err));
        return false;
      }
    };
    const next = chain.current.then(run, run);
    chain.current = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }, []);

  const saveSoon = useCallback(
    (path: string, text: string) => {
      pending.current.set(path, text);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void flush();
      }, 400);
    },
    [flush],
  );

  const saveNow = useCallback(
    (items: SaveItem[]) => {
      for (const item of items) pending.current.set(item.path, item.text);
      return flush();
    },
    [flush],
  );

  useEffect(() => {
    return () => {
      void flush();
    };
  }, [flush]);

  return { saveSoon, saveNow, flush };
}
