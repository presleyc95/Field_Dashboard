/**
 * Tracker connection and loaded data. One store for the whole app: which folder and file are
 * connected, the loaded dataset, and what the viewer needs to do next.
 */
import { create } from "zustand";
import { localToday } from "@/data/dates";
import { parseInWorker } from "@/data/parseInWorker";
import type { Dataset } from "@/data/types";
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
  /** The folder has several workbooks and none has been picked. */
  | "choose-file"
  | "loading"
  | "ready"
  | "error";

type TrackerState = {
  phase: Phase;
  folder: FileSystemDirectoryHandle | null;
  fileName: string | null;
  /** Workbooks in the folder, for choosing between them. */
  workbooks: string[];
  /** The file's last-modified time when it was loaded. */
  fileModified: number | null;
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

export const useTracker = create<TrackerState>()((setState, getState) => {
  /** Finds the workbook to use in the folder, then loads it. */
  async function openFolder(folder: FileSystemDirectoryHandle) {
    const workbooks = await access.findWorkbooks(folder);
    setState({ folder, workbooks });
    if (workbooks.length === 0) {
      setState({ phase: "error", error: `No Excel workbooks found in "${folder.name}". Pick the folder that holds the TSG Field Tracker.` });
      return;
    }
    const remembered = await access.savedFileName();
    const name =
      remembered && workbooks.includes(remembered)
        ? remembered
        : workbooks.filter((w) => /field tracker/i.test(w)).length === 1 || workbooks.length === 1
          ? workbooks[0]!
          : null;
    if (!name) {
      setState({ phase: "choose-file" });
      return;
    }
    await load(name);
  }

  async function load(name: string) {
    const { folder, dataset } = getState();
    if (!folder) return;
    setState(dataset ? { refreshing: true, error: null } : { phase: "loading", fileName: name, error: null });
    try {
      const file = await access.readFile(folder, name);
      const buffer = await file.arrayBuffer();
      const { dataset: next, ms } = await parseInWorker(buffer, localToday());
      await access.saveFileName(name);
      setState({
        phase: "ready",
        fileName: name,
        fileModified: file.lastModified,
        dataset: next,
        loadedAt: Date.now(),
        loadMs: ms,
        refreshing: false,
      });
    } catch (err) {
      setState({ phase: dataset ? "ready" : "error", refreshing: false, error: describeError(err, name) });
    }
  }

  return {
    phase: "starting",
    folder: null,
    fileName: null,
    workbooks: [],
    fileModified: null,
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
        setState({ dataset: null, fileName: null });
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

    chooseFile: load,

    async reload() {
      const { fileName } = getState();
      if (fileName) await load(fileName);
    },

    async checkForChanges() {
      const { folder, fileName, fileModified, phase, refreshing } = getState();
      if (phase !== "ready" || refreshing || !folder || !fileName) return;
      try {
        if ((await access.lastModified(folder, fileName)) !== fileModified) await load(fileName);
      } catch {
        // The file may be mid-sync or locked for a moment; try again next time.
      }
    },

    async disconnect() {
      await access.forgetFolder();
      setState({
        phase: "needs-folder",
        folder: null,
        fileName: null,
        workbooks: [],
        fileModified: null,
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

/** How often the tracker's last-modified time is checked while the page is open. */
export const CHANGE_CHECK_MS = 30_000;
