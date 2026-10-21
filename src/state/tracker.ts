/**
 * Tracker connection and loaded data. One store for the whole app: which folder and workbooks are
 * connected, the loaded dataset, and what the viewer needs to do next.
 *
 * A new master tracker starts every year. Every "… Field Tracker …" workbook in the folder is
 * loaded and merged, oldest first; the newest year is the current one. Past years rarely change,
 * so their parsed rows are cached in the browser and only the current year is parsed each time.
 */
import { create } from "zustand";
import { localToday } from "@/data/dates";
import { PARSER_VERSION, type RawWorkbook } from "@/data/parse";
import { parseInWorker } from "@/data/parseInWorker";
import type { Dataset } from "@/data/types";
import type { WorkerFile } from "@/data/worker";
import * as access from "@/file/access";

export type Phase =
  /** Checking for a remembered folder. */
  | "starting"
  /** This browser can't open local folders (not Chrome or Edge). */
  | "unsupported"
  /** No folder chosen yet. */
  | "needs-folder"
  /** A folder is remembered, but this session needs a click to allow access again. */
  | "needs-permission"
  /** The folder has workbooks but none named like a field tracker, and none has been picked. */
  | "choose-file"
  | "loading"
  | "ready"
  | "error";

export type LoadedFile = { name: string; lastModified: number; size: number; cached: boolean };

type TrackerState = {
  phase: Phase;
  folder: FileSystemDirectoryHandle | null;
  /** The current year's workbook (the one that's edited and saved to). */
  fileName: string | null;
  /** Every workbook loaded, oldest first. */
  files: LoadedFile[];
  /** Workbooks in the folder, for choosing between them. */
  workbooks: string[];
  dataset: Dataset | null;
  loadedAt: number | null;
  loadMs: number | null;
  error: string | null;
  /** True while a reload runs with older data still showing. */
  refreshing: boolean;

  start: () => Promise<void>;
  connectFolder: () => Promise<void>;
  allowAccess: () => Promise<void>;
  chooseFile: (name: string) => Promise<void>;
  reload: () => Promise<void>;
  checkForChanges: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const cacheKey = (f: File) => `v${PARSER_VERSION}:${f.name}:${f.size}:${f.lastModified}`;

export const useTracker = create<TrackerState>()((setState, getState) => {
  /** Finds the tracker workbooks in the folder, then loads them. */
  async function openFolder(folder: FileSystemDirectoryHandle) {
    const workbooks = await access.findWorkbooks(folder);
    setState({ folder, workbooks });
    if (workbooks.length === 0) {
      setState({ phase: "error", error: `No Excel workbooks found in "${folder.name}". Pick the folder that holds the TSG Field Tracker.` });
      return;
    }
    const trackers = access.trackerWorkbooks(workbooks);
    if (trackers.length) {
      await load(trackers);
      return;
    }
    // No file is named like a tracker: use the one picked before, the only one, or ask.
    const remembered = await access.savedFileName();
    const name = remembered && workbooks.includes(remembered) ? remembered : workbooks.length === 1 ? workbooks[0]! : null;
    if (name) await load([name]);
    else setState({ phase: "choose-file" });
  }

  /** Loads workbooks, oldest first; the last is the current year. */
  async function load(names: string[]) {
    const { folder, dataset } = getState();
    if (!folder || names.length === 0) return;
    const current = names.at(-1)!;
    setState(dataset ? { refreshing: true, error: null } : { phase: "loading", fileName: current, error: null });
    try {
      const handles = await Promise.all(names.map((n) => access.readFile(folder, n)));
      const files: WorkerFile[] = [];
      const loaded: LoadedFile[] = [];
      for (const [i, file] of handles.entries()) {
        const isCurrent = i === handles.length - 1;
        const cached = isCurrent ? null : await access.cachedWorkbook<RawWorkbook>(cacheKey(file));
        files.push(cached ? { name: file.name, raw: cached } : { name: file.name, buffer: await file.arrayBuffer() });
        loaded.push({ name: file.name, lastModified: file.lastModified, size: file.size, cached: !!cached });
      }

      const { dataset: next, ms, parsed } = await parseInWorker(files, localToday());

      // Cache past years that were just parsed (never the current year: it changes daily).
      const pastKeys = handles.slice(0, -1).map(cacheKey);
      for (const file of handles.slice(0, -1)) {
        const raw = parsed[file.name];
        if (raw) await access.cacheWorkbook(cacheKey(file), raw, pastKeys);
      }
      await access.saveFileName(current);

      setState({
        phase: "ready",
        fileName: current,
        files: loaded,
        dataset: next,
        loadedAt: Date.now(),
        loadMs: ms,
        refreshing: false,
      });
    } catch (err) {
      setState({ phase: dataset ? "ready" : "error", refreshing: false, error: describeError(err, current) });
    }
  }

  return {
    phase: "starting",
    folder: null,
    fileName: null,
    files: [],
    workbooks: [],
    dataset: null,
    loadedAt: null,
    loadMs: null,
    error: null,
    refreshing: false,

    async start() {
      if (!access.isSupported()) {
        setState({ phase: "unsupported" });
        return;
      }
      const folder = await access.savedFolder();
      if (!folder) {
        setState({ phase: "needs-folder" });
        return;
      }
      setState({ folder });
      if (await access.hasPermission(folder)) await openFolder(folder);
      else setState({ phase: "needs-permission" });
    },

    async connectFolder() {
      try {
        const folder = await access.pickFolder();
        setState({ dataset: null, fileName: null, files: [] });
        await openFolder(folder);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return; // picker cancelled
        setState({ phase: "error", error: describeError(err, null) });
      }
    },

    async allowAccess() {
      const { folder } = getState();
      if (!folder) return;
      try {
        if (await access.requestPermission(folder)) await openFolder(folder);
      } catch (err) {
        setState({ phase: "error", error: describeError(err, null) });
      }
    },

    chooseFile: (name) => load([name]),

    async reload() {
      const { folder } = getState();
      // Re-scan the folder so a new year's workbook is picked up.
      if (folder) await openFolder(folder);
    },

    async checkForChanges() {
      const { folder, files, phase, refreshing } = getState();
      if (phase !== "ready" || refreshing || !folder || files.length === 0) return;
      try {
        const names = access.trackerWorkbooks(await access.findWorkbooks(folder));
        const sameSet = names.length === 0 || names.join("|") === files.map((f) => f.name).join("|");
        if (!sameSet) {
          await openFolder(folder); // a workbook was added or removed (e.g. the new year's tracker)
          return;
        }
        for (const f of files) {
          if ((await access.lastModified(folder, f.name)) !== f.lastModified) {
            await load(files.map((x) => x.name));
            return;
          }
        }
      } catch {
        // A file may be mid-sync or locked for a moment; try again next time.
      }
    },

    async disconnect() {
      await access.forgetFolder();
      setState({
        phase: "needs-folder",
        folder: null,
        fileName: null,
        files: [],
        workbooks: [],
        dataset: null,
        loadedAt: null,
        loadMs: null,
        error: null,
      });
    },
  };
});

function describeError(err: unknown, fileName: string | null): string {
  if (err instanceof DOMException) {
    if (err.name === "NotFoundError") return `"${fileName ?? "The tracker"}" is no longer in that folder. It may have been moved or renamed.`;
    if (err.name === "NotReadableError" || err.name === "NoModificationAllowedError") {
      return `Couldn't read "${fileName ?? "the tracker"}". If OneDrive is still syncing it, wait a moment and reload.`;
    }
    if (err.name === "NotAllowedError" || err.name === "SecurityError") return "The browser didn't allow access to the folder.";
  }
  return err instanceof Error ? err.message : String(err);
}

/** How often the tracker workbooks' last-modified times are checked while the page is open. */
export const CHANGE_CHECK_MS = 30_000;
