/**
 * Access to the synced tracker folder through the File System Access API (ARCHITECTURE.md §4).
 * The folder handle is remembered in IndexedDB; each new session needs one click to allow
 * access again. Folder access (not just the file) is what later lets the app keep backups and a
 * save log next to the tracker.
 */
import { del, get, set } from "idb-keyval";

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
