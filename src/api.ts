import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { UserConfig } from "./settings";

export type RenamedImage = {
  name: string;
  path: string;
  captionPath: string;
};

export type ScannedImage = {
  name: string;
  path: string;
  captionPath: string;
  caption: string;
  modified: number;
};

export type ScanResult = {
  images: ScannedImage[];
  unreadable: number;
};

export type TaggerStatus = {
  folder: string;
  installed: boolean;
};

export type DownloadProgress = {
  received: number;
  total: number;
};

export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function pickFolder(title = "Open image folder"): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title,
  });
  if (selected === null || Array.isArray(selected)) return null;
  return selected;
}

export function scanDataset(folder: string): Promise<ScanResult> {
  return invoke<ScanResult>("scan_dataset", { folder });
}

export function writeCaptions(items: { path: string; text: string }[]): Promise<void> {
  return invoke("write_captions", { items });
}

export function renameImage(path: string, fileName: string): Promise<RenamedImage> {
  return invoke<RenamedImage>("rename_dataset_image", { path, fileName });
}

export function revealImage(path: string): Promise<void> {
  return revealItemInDir(path);
}

export function loadUserConfig(): Promise<{ config: UserConfig; exists: boolean }> {
  return invoke("load_user_config");
}

export function saveUserConfig(config: UserConfig): Promise<void> {
  return invoke("save_user_config", { config });
}

export function taggerStatus(folder: string | null): Promise<TaggerStatus> {
  return invoke<TaggerStatus>("tagger_status", { folder });
}

export function downloadTagger(folder: string | null): Promise<TaggerStatus> {
  return invoke<TaggerStatus>("download_tagger", { folder });
}

export function suggestTags(path: string, folder: string | null, threshold: number): Promise<string[]> {
  return invoke<string[]>("suggest_tags", { path, folder, threshold });
}

// The version changes the URL when the file changes, so the webview drops its cached copy.
export function imageSrc(path: string, version?: number): string {
  const src = convertFileSrc(path);
  return version ? `${src}?v=${version}` : src;
}

export function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong.";
}
