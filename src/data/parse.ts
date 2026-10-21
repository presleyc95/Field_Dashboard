/**
 * Reads the tracker workbook with SheetJS into raw rows. Columns are found by header name, not
 * position, so inserting or reordering columns in the tracker doesn't break the dashboard.
 * Only the sheets the dashboard needs are parsed.
 */
import * as XLSX from "xlsx";
import type { RawCell } from "./clean";
import { excelSerialToISO, parseDateText } from "./dates";
import type { HitchDates } from "./hitches";

export const TRACKER_SHEET = "TSG Field Tracker";
export const HITCH_SHEET = "Validations";

/** Tracker fields and how to recognize their header cells. */
const TRACKER_COLUMNS = {
  opco: (h: string) => h === "opco",
  permitId: (h: string) => h === "permit id",
  tech: (h: string) => h === "tech name",
  partner: (h: string) => h === "paired with",
  date: (h: string) => h === "date",
  task: (h: string) => h === "task",
  status: (h: string) => h === "status",
  poles: (h: string) => h === "poles collected",
  hoursOnPermit: (h: string) => h === "hours on permit",
  driveHours: (h: string) => h.startsWith("drive time"),
  totalHours: (h: string) => h === "total",
  mileage: (h: string) => h === "mileage",
  notes: (h: string) => h === "notes",
  uploaded: (h: string) => h === "uploaded to katapult",
} as const;

export type TrackerField = keyof typeof TRACKER_COLUMNS;

/** Headers the dashboard can't work without. */
const REQUIRED: TrackerField[] = ["opco", "permitId", "tech", "date", "task", "status", "poles", "uploaded"];

export type RawTrackerRow = { excelRow: number } & Record<TrackerField, RawCell>;

export type RawWorkbook = {
  rows: RawTrackerRow[];
  /** 0-based column index of each field (for writing back later). */
  columns: Partial<Record<TrackerField, number>>;
  headerRow: number;
  hitches: HitchDates[];
};

export class WorkbookError extends Error {}

type DenseCell = { v?: unknown; w?: string; t?: string } | null | undefined;
type DenseSheet = { "!data"?: DenseCell[][]; "!ref"?: string };

export function readWorkbook(data: ArrayBuffer | Uint8Array): RawWorkbook {
  const wb = XLSX.read(data, {
    type: "array",
    dense: true,
    sheets: [TRACKER_SHEET, HITCH_SHEET],
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    cellDates: false,
  });

  const tracker = wb.Sheets[TRACKER_SHEET] as DenseSheet | undefined;
  if (!tracker) {
    throw new WorkbookError(`This workbook has no "${TRACKER_SHEET}" sheet. Is it the TSG Field Tracker?`);
  }
  const { rows, columns, headerRow } = readTracker(tracker);

  const hitchSheet = wb.Sheets[HITCH_SHEET] as DenseSheet | undefined;
  const hitches = hitchSheet ? readHitchDates(hitchSheet) : [];

  return { rows, columns, headerRow, hitches };
}

function readTracker(sheet: DenseSheet) {
  const data = sheet["!data"] ?? [];
  const origin = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]).s.r : 0;

  const headerIndex = data.slice(0, 20).findIndex((row) => {
    const headers = (row ?? []).map(headerText);
    return headers.includes("permit id") && headers.includes("tech name");
  });
  if (headerIndex < 0) {
    throw new WorkbookError(`Couldn't find the header row (with "Permit ID" and "Tech Name") on "${TRACKER_SHEET}".`);
  }

  const headers = (data[headerIndex] ?? []).map(headerText);
  const columns: Partial<Record<TrackerField, number>> = {};
  for (const [field, matches] of Object.entries(TRACKER_COLUMNS) as [TrackerField, (h: string) => boolean][]) {
    const index = headers.findIndex(matches);
    if (index >= 0) columns[field] = index;
  }
  const missing = REQUIRED.filter((f) => columns[f] === undefined);
  if (missing.length) {
    throw new WorkbookError(`"${TRACKER_SHEET}" is missing columns: ${missing.join(", ")}.`);
  }

  const fields = Object.keys(TRACKER_COLUMNS) as TrackerField[];
  const rows: RawTrackerRow[] = [];
  for (let i = headerIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const raw = { excelRow: origin + i + 1 } as RawTrackerRow;
    let empty = true;
    for (const field of fields) {
      const col = columns[field];
      const cell = col === undefined ? undefined : row[col];
      if (hasValue(cell)) {
        raw[field] = { v: cell!.v, w: cell!.w };
        empty = false;
      }
    }
    // Rows with only formula leftovers (outside the tracker's own columns) aren't data.
    if (!empty) rows.push(raw);
  }
  return { rows, columns, headerRow: origin + headerIndex + 1 };
}

/** Reads the "Hitch Start Dates" / "Hitch End Dates" columns, wherever they are. */
function readHitchDates(sheet: DenseSheet): HitchDates[] {
  const data = sheet["!data"] ?? [];
  for (let r = 0; r < Math.min(data.length, 20); r++) {
    const headers = (data[r] ?? []).map(headerText);
    const startCol = headers.indexOf("hitch start dates");
    const endCol = headers.indexOf("hitch end dates");
    if (startCol < 0 || endCol < 0) continue;

    const hitches: HitchDates[] = [];
    for (let i = r + 1; i < data.length; i++) {
      const start = cellDate(data[i]?.[startCol]);
      const end = cellDate(data[i]?.[endCol]);
      if (start && end) hitches.push({ start, end });
    }
    return hitches;
  }
  return [];
}

function cellDate(cell: DenseCell) {
  if (!cell) return null;
  if (typeof cell.v === "number") return excelSerialToISO(cell.v);
  if (typeof cell.v === "string") return parseDateText(cell.v);
  return null;
}

function headerText(cell: DenseCell): string {
  return typeof cell?.v === "string" ? cell.v.replace(/\s+/g, " ").trim().toLowerCase() : "";
}

function hasValue(cell: DenseCell): boolean {
  return !!cell && cell.v !== null && cell.v !== undefined && cell.v !== "";
}
