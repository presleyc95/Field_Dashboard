/**
 * Background work, off the main thread so the page stays responsive:
 * - `load`: parse and merge the tracker workbooks (~2 s a year; cached past years skip parsing).
 * - `mark`: mark rows uploaded in the current workbook's bytes (checks each row first).
 * - `check`: read which of the given rows are marked uploaded (to confirm a save).
 */
import { markUploaded, type PatchResult, type UploadTarget } from "@/file/xlsxPatch";
import { loadWorkbooks } from "./load";
import { buildDataset } from "./model";
import { type RawWorkbook, readWorkbook } from "./parse";
import type { Dataset, ISODate } from "./types";

export type WorkerFile = { name: string; buffer?: ArrayBuffer; raw?: RawWorkbook };

export type WorkerRequest =
  | { id: number; kind: "load"; files: WorkerFile[]; today: ISODate }
  | { id: number; kind: "mark"; buffer: ArrayBuffer; targets: UploadTarget[] }
  | { id: number; kind: "check"; buffer: ArrayBuffer; rows: number[] };

export type LoadResult = { dataset: Dataset; ms: number; parsed: Record<string, RawWorkbook> };
export type CheckResult = { uploaded: number[] };

export type WorkerResponse =
  | { id: number; ok: true; result: LoadResult | PatchResult | CheckResult }
  | { id: number; ok: false; error: string };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    const result = await handle(req);
    const transfer = "bytes" in result && result.bytes ? [result.bytes.buffer as ArrayBuffer] : [];
    self.postMessage({ id: req.id, ok: true, result } satisfies WorkerResponse, { transfer });
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse);
  }
};

async function handle(req: WorkerRequest): Promise<LoadResult | PatchResult | CheckResult> {
  switch (req.kind) {
    case "load": {
      const started = performance.now();
      const { dataset, raws } = loadWorkbooks(
        req.files.map((f) => ({ name: f.name, raw: f.raw, data: f.buffer ? new Uint8Array(f.buffer) : undefined })),
        req.today,
      );
      // Hand back the rows of every workbook that was parsed here, for caching.
      const parsed: Record<string, RawWorkbook> = {};
      req.files.forEach((f, i) => {
        if (f.buffer) parsed[f.name] = raws[i]!;
      });
      return { dataset, ms: Math.round(performance.now() - started), parsed };
    }
    case "mark":
      return markUploaded(new Uint8Array(req.buffer), req.targets);
    case "check": {
      const ds = buildDataset(readWorkbook(new Uint8Array(req.buffer)), "2100-01-01");
      const wanted = new Set(req.rows);
      return { uploaded: ds.records.filter((r) => wanted.has(r.excelRow) && r.uploaded).map((r) => r.excelRow) };
    }
  }
}
