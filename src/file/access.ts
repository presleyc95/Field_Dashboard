/**
 * Access to the synced tracker folder through the File System Access API (ARCHITECTURE.md §4).
 * The folder handle is remembered in IndexedDB; each new session needs one click to allow
 * access again. Folder access (not just the file) is what later lets the app keep backups and a
 * save log next to the tracker.
 */
import { del, get, keys, set } from "idb-keyval";

const FOLDER_KEY = "tracker-folder";
/** Used by earlier versions to remember a picked workbook; cleared on disconnect. */
const OLD_FILE_KEY = "tracker-file-name";

export function isSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Asks the viewer to pick the tracker's folder. Throws AbortError if they cancel. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  const folder = await window.showDirectoryPicker({ id: "field-tracker", mode: "read" });
  await set(FOLDER_KEY, folder);
  return folder;
}

export async function savedFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await get<FileSystemDirectoryHandle>(FOLDER_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function forgetFolder() {
  await del(FOLDER_KEY);
  await del(OLD_FILE_KEY);
}

export async function hasPermission(folder: FileSystemDirectoryHandle): Promise<boolean> {
  return (await folder.queryPermission({ mode: "read" })) === "granted";
}

/** Must be called from a click: the browser shows its "allow access" prompt. */
export async function requestPermission(folder: FileSystemDirectoryHandle): Promise<boolean> {
  return (await folder.requestPermission({ mode: "read" })) === "granted";
}

/** Excel workbooks in the folder. Skips Excel's `~$` lock files. */
export async function findWorkbooks(folder: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of folder.values()) {
    if (entry.kind === "file" && /\.xlsx$/i.test(entry.name) && !entry.name.startsWith("~$")) {
      names.push(entry.name);
    }
  }
  return names;
}

/**
 * A yearly master tracker: "Master" in the name and a year right before ".xlsx"
 * ("TSG Field Tracker - Master 2026.xlsx"). Copies like "… Master 2026 (backup).xlsx" don't count.
 */
const MASTER_TRACKER = /master.*?(?:^|\D)(20\d\d)\.xlsx$/i;

/** The yearly master trackers among these file names, oldest first (the last is the current year). */
export function trackerWorkbooks(names: string[]): string[] {
  return names
    .filter((n) => !n.startsWith("~$") && MASTER_TRACKER.test(n.trim()))
    .sort((a, b) => yearIn(a) - yearIn(b) || a.localeCompare(b));
}

function yearIn(name: string): number {
  return Number(MASTER_TRACKER.exec(name.trim())?.[1] ?? 0);
}

/**
 * Cache of parsed past-year workbooks, so they're parsed once instead of on every load. Keyed by
 * name, size and last-modified time (a changed file is parsed again) plus the parser version.
 */
export async function cachedWorkbook<T>(key: string): Promise<T | null> {
  try {
    return (await get<T>(`workbook:${key}`)) ?? null;
  } catch {
    return null;
  }
}

export async function cacheWorkbook(key: string, value: unknown, keep: string[]) {
  try {
    await set(`workbook:${key}`, value);
    // Drop cached copies of older versions of the same files.
    const wanted = new Set(keep.map((k) => `workbook:${k}`));
    for (const k of await keys()) {
      if (typeof k === "string" && k.startsWith("workbook:") && !wanted.has(k)) await del(k);
    }
  } catch {
    // Caching is only a speed-up; loading still works without it.
  }
}

export async function readFile(folder: FileSystemDirectoryHandle, name: string): Promise<File> {
  const handle = await folder.getFileHandle(name);
  return handle.getFile();
}

/** Last-modified time of the tracker, for spotting saves (by the admin or through OneDrive). */
export async function lastModified(folder: FileSystemDirectoryHandle, name: string): Promise<number> {
  return (await readFile(folder, name)).lastModified;
}
