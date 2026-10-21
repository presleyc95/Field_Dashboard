/**
 * Parses the workbook off the main thread so the page stays responsive (~1.5 s for the full
 * tracker).
 */
import { loadDataset } from "./load";
import type { Dataset, ISODate } from "./types";

export type WorkerRequest = { id: number; buffer: ArrayBuffer; today: ISODate };
export type WorkerResponse =
  | { id: number; ok: true; dataset: Dataset; ms: number }
  | { id: number; ok: false; error: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, buffer, today } = event.data;
  const started = performance.now();
  let response: WorkerResponse;
  try {
    const dataset = loadDataset(new Uint8Array(buffer), today);
    response = { id, ok: true, dataset, ms: Math.round(performance.now() - started) };
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(response);
};
