import { buildDataset } from "./model";
import { type RawWorkbook, readWorkbook } from "./parse";
import type { Dataset, ISODate } from "./types";

/** Reads one tracker workbook and builds the full data model. */
export function loadDataset(data: ArrayBuffer | Uint8Array, today: ISODate): Dataset {
  return buildDataset(readWorkbook(data), today);
}

/** A workbook to load: its bytes, or its already-parsed rows (cached past years). */
export type WorkbookInput = { name: string; data?: ArrayBuffer | Uint8Array; raw?: RawWorkbook };

/**
 * Reads several years' workbooks (oldest first; the last is current) and merges them.
 * Returns the parsed rows too, so the caller can cache past years and skip parsing them next time.
 */
export function loadWorkbooks(inputs: WorkbookInput[], today: ISODate): { dataset: Dataset; raws: RawWorkbook[] } {
  const raws = inputs.map((input) => {
    if (input.raw) return { ...input.raw, source: input.name };
    if (!input.data) throw new Error(`No data for ${input.name}`);
    return readWorkbook(input.data, { source: input.name });
  });
  return { dataset: buildDataset(raws, today), raws };
}
