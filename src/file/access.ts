/**
 * Access to the synced tracker folder through the File System Access API (ARCHITECTURE.md §4).
 * The folder handle is remembered in IndexedDB; each new session needs one click to allow
 * access again. Folder access (not just the file) is what later lets the app keep backups and a
 * save log next to the tracker.
 */
import { del, get, keys, set } from "idb-keyval";

const FOLDER_KEY = "tracker-folder";
const FILE_KEY = "tracker-file-name";

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
  await del(FILE_KEY);
}

export async function hasPermission(folder: FileSystemDirectoryHandle): Promise<boolean> {
  return (await folder.queryPermission({ mode: "read" })) === "granted";
}

/** Must be called from a click: the browser shows its "allow access" prompt. */
export async function requestPermission(folder: FileSystemDirectoryHandle): Promise<boolean> {
  return (await folder.requestPermission({ mode: "read" })) === "granted";
}

/**
 * Excel workbooks in the folder, likeliest tracker first. Skips Excel's `~$` lock files.
 */
export async function findWorkbooks(folder: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of folder.values()) {
    if (entry.kind === "file" && /\.xlsx$/i.test(entry.name) && !entry.name.startsWith("~$")) {
      names.push(entry.name);
    }
  }
  const score = (name: string) => (/field tracker/i.test(name) ? 0 : 1);
  return names.sort((a, b) => score(a) - score(b) || a.localeCompare(b));
}

/**
 * The yearly master trackers in a folder ("TSG Field Tracker - Master 2025.xlsx", "… 2026.xlsx"),
 * oldest first, so the last one is the current year.
 */
export function trackerWorkbooks(names: string[]): string[] {
  return names
    .filter((n) => /field tracker/i.test(n))
    .sort((a, b) => (yearIn(a) ?? 0) - (yearIn(b) ?? 0) || a.localeCompare(b));
}

function yearIn(name: string): number | null {
  const m = /(?:^|\D)(20\d\d)(?:\D|$)/.exec(name);
  return m ? Number(m[1]) : null;
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

export async function savedFileName(): Promise<string | null> {
  try {
    return (await get<string>(FILE_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function saveFileName(name: string) {
  await set(FILE_KEY, name);
}

export async function readFile(folder: FileSystemDirectoryHandle, name: string): Promise<File> {
  const handle = await folder.getFileHandle(name);
  return handle.getFile();
}

/** Last-modified time of the tracker, for spotting saves (by the admin or through OneDrive). */
export async function lastModified(folder: FileSystemDirectoryHandle, name: string): Promise<number> {
  return (await readFile(folder, name)).lastModified;
}
