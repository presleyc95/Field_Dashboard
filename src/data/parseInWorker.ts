import type { Dataset, ISODate } from "./types";
import type { WorkerRequest, WorkerResponse } from "./worker";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: { dataset: Dataset; ms: number }) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const res = event.data;
      const job = pending.get(res.id);
      if (!job) return;
      pending.delete(res.id);
      if (res.ok) job.resolve({ dataset: res.dataset, ms: res.ms });
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

/** Parses a workbook in the background worker. The buffer is handed over, not copied. */
export function parseInWorker(buffer: ArrayBuffer, today: ISODate): Promise<{ dataset: Dataset; ms: number }> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const request: WorkerRequest = { id, buffer, today };
    getWorker().postMessage(request, [buffer]);
  });
}
