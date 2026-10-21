import type { RawWorkbook } from "./parse";
import type { Dataset, ISODate } from "./types";
import type { WorkerFile, WorkerRequest, WorkerResponse } from "./worker";

type Result = { dataset: Dataset; ms: number; parsed: Record<string, RawWorkbook> };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: Result) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const res = event.data;
      const job = pending.get(res.id);
      if (!job) return;
      pending.delete(res.id);
      if (res.ok) job.resolve({ dataset: res.dataset, ms: res.ms, parsed: res.parsed });
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

/**
 * Parses and merges workbooks (oldest first) in the background worker. Buffers are handed over,
 * not copied.
 */
export function parseInWorker(files: WorkerFile[], today: ISODate): Promise<Result>;
/** Single workbook (kept for quick checks in the browser console). */
export function parseInWorker(buffer: ArrayBuffer, today: ISODate): Promise<Result>;
export function parseInWorker(input: WorkerFile[] | ArrayBuffer, today: ISODate): Promise<Result> {
  const files = input instanceof ArrayBuffer ? [{ name: "Tracker", buffer: input }] : input;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const request: WorkerRequest = { id, files, today };
    const transfer = files.flatMap((f) => (f.buffer ? [f.buffer] : []));
    getWorker().postMessage(request, transfer);
  });
}
