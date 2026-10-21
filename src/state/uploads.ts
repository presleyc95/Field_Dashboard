/**
 * The field admin's pending "uploaded" marks and edit mode. Marks wait in a tray until Save, and
 * are kept in this browser (localStorage) so a reload doesn't lose them.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { TrackerRecord } from "@/data/types";
import { hasWriteAccess, requestWriteAccess, type SaveReport, type SaveStep, saveUploads, SaveError } from "@/file/writeback";
import { useTracker } from "./tracker";

/** What a pending mark remembers about its row, to find and re-check it at save time. */
export type PendingMark = {
  source: string;
  excelRow: number;
  date: string | null;
  tech: string | null;
  partner: string | null;
  permitId: string | null;
  task: string | null;
  opco: string | null;
  poles: number | null;
};

export const markKey = (m: { source: string; excelRow: number }) => `${m.source}|${m.excelRow}`;

export function toMark(r: TrackerRecord): PendingMark {
  return {
    source: r.source,
    excelRow: r.excelRow,
    date: r.date,
    tech: r.tech,
    partner: r.partner,
    permitId: r.permitId,
    task: r.task,
    opco: r.opco,
    poles: r.poles,
  };
}

type UploadsState = {
  /** Edit mode: checkboxes and the tray show. Needs write access to the folder to save. */
  editMode: boolean;
  /** This session has write access to the folder. */
  canWrite: boolean;
  pending: Record<string, PendingMark>;
  saving: SaveStep | null;
  report: SaveReport | null;
  error: { message: string; kind: SaveError["kind"] } | null;
  trayOpen: boolean;

  enableEditing: () => Promise<boolean>;
  disableEditing: () => void;
  refreshAccess: () => Promise<void>;
  toggle: (r: TrackerRecord) => void;
  add: (rows: TrackerRecord[]) => void;
  remove: (key: string) => void;
  clear: () => void;
  setTrayOpen: (open: boolean) => void;
  save: () => Promise<void>;
  dismissReport: () => void;
};

export const useUploads = create<UploadsState>()(
  persist(
    (set, get) => ({
      editMode: false,
      canWrite: false,
      pending: {},
      saving: null,
      report: null,
      error: null,
      trayOpen: false,

      async enableEditing() {
        const folder = useTracker.getState().folder;
        if (!folder) return false;
        try {
          const granted = await requestWriteAccess(folder);
          set({ editMode: granted, canWrite: granted, error: granted ? null : { message: "Editing needs permission to change files in the tracker folder.", kind: "permission" } });
          return granted;
        } catch {
          set({ error: { message: "The browser didn't allow changing files in this folder.", kind: "permission" } });
          return false;
        }
      },

      disableEditing: () => set({ editMode: false, trayOpen: false }),

      async refreshAccess() {
        const folder = useTracker.getState().folder;
        set({ canWrite: folder ? await hasWriteAccess(folder) : false });
      },

      toggle(r) {
        const key = markKey(r);
        const pending = { ...get().pending };
        if (pending[key]) delete pending[key];
        else pending[key] = toMark(r);
        set({ pending });
      },

      add(rows) {
        const pending = { ...get().pending };
        for (const r of rows) pending[markKey(r)] = toMark(r);
        set({ pending });
      },

      remove(key) {
        const pending = { ...get().pending };
        delete pending[key];
        set({ pending });
      },

      clear: () => set({ pending: {} }),
      setTrayOpen: (open) => set({ trayOpen: open, report: open ? get().report : null }),

      async save() {
        const tracker = useTracker.getState();
        const { folder, fileName, files } = tracker;
        const marks = Object.values(get().pending).filter((m) => m.source === fileName);
        if (!folder || !fileName || marks.length === 0) return;

        set({ saving: "reading", error: null, report: null });
        try {
          // Asking again is harmless when already granted, and covers a new browser session.
          if (!(await hasWriteAccess(folder)) && !(await requestWriteAccess(folder))) {
            throw new SaveError("Saving needs permission to change files in the tracker folder.", "permission");
          }
          const loadedModified = files.find((f) => f.name === fileName)?.lastModified ?? null;
          const report = await saveUploads(
            folder,
            fileName,
            marks.map((m) => ({ excelRow: m.excelRow, expect: { date: m.date, tech: m.tech, permitId: m.permitId }, permitId: m.permitId, task: m.task })),
            loadedModified,
            (step) => set({ saving: step }),
          );
          // Saved and already-marked rows leave the tray; rows that changed stay for a look.
          const done = new Set([...report.applied, ...report.skipped.filter((s) => s.reason === "already-uploaded").map((s) => s.excelRow)]);
          const pending = { ...get().pending };
          for (const m of marks) if (done.has(m.excelRow)) delete pending[markKey(m)];
          set({ pending, report, saving: null, canWrite: true });
          if (report.applied.length) await tracker.reload();
        } catch (err) {
          const e = err instanceof SaveError ? err : new SaveError(err instanceof Error ? err.message : String(err), "other");
          set({ saving: null, error: { message: e.message, kind: e.kind } });
        }
      },

      dismissReport: () => set({ report: null, error: null }),
    }),
    {
      name: "field-dashboard-uploads",
      storage: createJSONStorage(() => localStorage),
      // Edit mode and pending marks survive a reload; permission and save state don't.
      partialize: (s) => ({ editMode: s.editMode, pending: s.pending }),
    },
  ),
);
