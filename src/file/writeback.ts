/**
 * Saving "Uploaded to Katapult" marks to the current tracker (ARCHITECTURE.md §8):
 *
 * 1. Read the tracker as it is now (it may have changed since the dashboard loaded it).
 * 2. Check every row still matches (date, tech, permit); skip any that moved or changed.
 * 3. Keep a timestamped backup in `.dashboard-backups/` next to the tracker (last 10 kept).
 * 4. Change only the marked cells (xlsxPatch) and write the file. If Excel has it open, the
 *    write is refused and nothing changes.
 * 5. Add an entry to `dashboard-log.json`.
 * 6. Re-read the saved file and confirm the cells say Yes.
 */
import { checkInWorker, markInWorker } from "@/data/parseInWorker";
import type { PatchResult, UploadTarget } from "./xlsxPatch";

export const BACKUP_DIR = ".dashboard-backups";
export const LOG_FILE = "dashboard-log.json";
const BACKUPS_KEPT = 10;

export type SaveStep = "reading" | "checking" | "backing-up" | "writing" | "logging" | "confirming";

export type SaveReport = {
  fileName: string;
  applied: number[];
  skipped: PatchResult["skipped"];
  /** Rows written but not reading Yes afterwards (should always be empty). */
  unconfirmed: number[];
  backupName: string | null;
  /** True when the tracker had been saved by someone since the dashboard loaded it. */
  changedSinceLoad: boolean;
};

export class SaveError extends Error {
  constructor(
    message: string,
    readonly kind: "locked" | "permission" | "other",
  ) {
    super(message);
  }
}

/** Must be called from a click: asks the browser for permission to change files in the folder. */
export async function requestWriteAccess(folder: FileSystemDirectoryHandle): Promise<boolean> {
  if ((await folder.queryPermission({ mode: "readwrite" })) === "granted") return true;
  return (await folder.requestPermission({ mode: "readwrite" })) === "granted";
}

export async function hasWriteAccess(folder: FileSystemDirectoryHandle): Promise<boolean> {
  return (await folder.queryPermission({ mode: "readwrite" })) === "granted";
}

export async function saveUploads(
  folder: FileSystemDirectoryHandle,
  fileName: string,
  targets: (UploadTarget & { permitId: string | null; task: string | null })[],
  loadedModified: number | null,
  onStep: (step: SaveStep) => void = () => {},
): Promise<SaveReport> {
  if (!(await hasWriteAccess(folder))) {
    throw new SaveError("The dashboard doesn't have permission to change files in this folder. Turn on editing first.", "permission");
  }

  onStep("reading");
  const handle = await folder.getFileHandle(fileName);
  const file = await handle.getFile();
  const original = await file.arrayBuffer();
  const changedSinceLoad = loadedModified !== null && file.lastModified !== loadedModified;

  onStep("checking");
  const result = await markInWorker(original.slice(0), targets);
  if (!result.bytes) {
    return { fileName, applied: [], skipped: result.skipped, unconfirmed: [], backupName: null, changedSinceLoad };
  }

  onStep("backing-up");
  const backupName = await writeBackup(folder, fileName, original);

  onStep("writing");
  try {
    const writable = await handle.createWritable();
    await writable.write(result.bytes as Uint8Array<ArrayBuffer>);
    await writable.close();
  } catch (err) {
    throw describeWriteError(err, fileName);
  }

  onStep("logging");
  await appendLog(folder, {
    at: new Date().toISOString(),
    file: fileName,
    action: "Uploaded to Katapult = Yes",
    rows: result.applied.map((row) => {
      const t = targets.find((x) => x.excelRow === row)!;
      return { row, permit: t.permitId, date: t.expect.date, tech: t.expect.tech, task: t.task };
    }),
    skipped: result.skipped,
    backup: backupName,
  });

  onStep("confirming");
  const saved = await (await handle.getFile()).arrayBuffer();
  const { uploaded } = await checkInWorker(saved, result.applied);
  const confirmed = new Set(uploaded);

  return {
    fileName,
    applied: result.applied,
    skipped: result.skipped,
    unconfirmed: result.applied.filter((r) => !confirmed.has(r)),
    backupName,
    changedSinceLoad,
  };
}

async function writeBackup(folder: FileSystemDirectoryHandle, fileName: string, bytes: ArrayBuffer): Promise<string> {
  const dir = await folder.getDirectoryHandle(BACKUP_DIR, { create: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const base = fileName.replace(/\.xlsx$/i, "");
  const name = `${base} ${stamp}.xlsx`;
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();

  // Keep only the newest backups of this workbook (timestamps sort as text).
  const mine: string[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind === "file" && entry.name.startsWith(`${base} `) && entry.name.endsWith(".xlsx")) mine.push(entry.name);
  }
  for (const old of mine.sort().slice(0, -BACKUPS_KEPT)) await dir.removeEntry(old);
  return name;
}

async function appendLog(folder: FileSystemDirectoryHandle, entry: unknown) {
  const handle = await folder.getFileHandle(LOG_FILE, { create: true });
  let log: unknown[] = [];
  try {
    const text = await (await handle.getFile()).text();
    if (text.trim()) log = JSON.parse(text) as unknown[];
  } catch {
    // An unreadable log is started fresh rather than blocking the save (the save already happened).
  }
  log.push(entry);
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(log, null, 2));
  await writable.close();
}

function describeWriteError(err: unknown, fileName: string): SaveError {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NoModificationAllowedError" || name === "InvalidStateError" || name === "InvalidModificationError") {
    return new SaveError(`"${fileName}" is open in Excel (or OneDrive is syncing it). Close it in Excel, then save again. Nothing was changed.`, "locked");
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new SaveError("The browser didn't allow changing the tracker. You may only have view access to this folder.", "permission");
  }
  return new SaveError(`Couldn't save "${fileName}": ${err instanceof Error ? err.message : String(err)}. Nothing was changed.`, "other");
}
