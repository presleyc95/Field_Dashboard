import type { PatchResult, UploadTarget } from "@/file/xlsxPatch";
import type { ISODate } from "./types";
import type { CheckResult, LoadResult, WorkerFile, WorkerRequest, WorkerResponse } from "./worker";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const res = event.data;
      const job = pending.get(res.id);
      if (!job) return;
      pending.delete(res.id);
      if (res.ok) job.resolve(res.result);
      else job.reject(new Error(res.error));
    };
    worker.onerror = (event) => {
      for (const job of pending.values()) job.reject(new Error(event.message || "The data worker crashed."));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

function call<T>(request: WithoutId<WorkerRequest>, transfer: Transferable[]): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (r: unknown) => void, reject });
    getWorker().postMessage({ ...request, id } as WorkerRequest, transfer);
  });
}

/**
 * Parses and merges workbooks (oldest first) in the background worker. Buffers are handed over,
 * not copied. A single buffer is accepted for quick checks in the browser console.
 */
export function parseInWorker(input: WorkerFile[] | ArrayBuffer, today: ISODate): Promise<LoadResult> {
  const files = input instanceof ArrayBuffer ? [{ name: "Tracker", buffer: input }] : input;
  return call<LoadResult>({ kind: "load", files, today }, files.flatMap((f) => (f.buffer ? [f.buffer] : [])));
}

/** Marks rows uploaded in a copy of the workbook; returns the new bytes and what was skipped. */
export function markInWorker(buffer: ArrayBuffer, targets: UploadTarget[]): Promise<PatchResult> {
  return call<PatchResult>({ kind: "mark", buffer, targets }, [buffer]);
}

/** Which of these rows are marked uploaded in the workbook (to confirm a save). */
export function checkInWorker(buffer: ArrayBuffer, rows: number[]): Promise<CheckResult> {
  return call<CheckResult>({ kind: "check", buffer, rows }, [buffer]);
}
