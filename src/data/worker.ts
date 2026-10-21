/**
 * Parses the workbooks off the main thread so the page stays responsive (~2 s for a year's
 * tracker). Past years that were parsed before arrive as cached rows and skip parsing.
 */
import { loadWorkbooks } from "./load";
import type { RawWorkbook } from "./parse";
import type { Dataset, ISODate } from "./types";

export type WorkerFile = { name: string; buffer?: ArrayBuffer; raw?: RawWorkbook };
export type WorkerRequest = { id: number; files: WorkerFile[]; today: ISODate };
export type WorkerResponse =
  | { id: number; ok: true; dataset: Dataset; ms: number; parsed: Record<string, RawWorkbook> }
  | { id: number; ok: false; error: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, files, today } = event.data;
  const started = performance.now();
  let response: WorkerResponse;
  try {
    const { dataset, raws } = loadWorkbooks(
      files.map((f) => ({ name: f.name, raw: f.raw, data: f.buffer ? new Uint8Array(f.buffer) : undefined })),
      today,
    );
    // Hand back the rows of every workbook that was parsed here, for caching.
    const parsed: Record<string, RawWorkbook> = {};
    files.forEach((f, i) => {
      if (f.buffer) parsed[f.name] = raws[i]!;
    });
    response = { id, ok: true, dataset, ms: Math.round(performance.now() - started), parsed };
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(response);
};
