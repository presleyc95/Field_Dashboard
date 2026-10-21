import { buildDataset } from "./model";
import { readWorkbook } from "./parse";
import type { Dataset, ISODate } from "./types";

/** Reads a tracker workbook and builds the full data model. */
export function loadDataset(data: ArrayBuffer | Uint8Array, today: ISODate): Dataset {
  return buildDataset(readWorkbook(data), today);
}
