/**
 * Reads the tracker workbook with SheetJS into raw rows. Columns are found by header name, not
 * position, so inserting or reordering columns in the tracker doesn't break the dashboard.
 * Only the sheets the dashboard needs are parsed.
 */
import * as XLSX from "xlsx";
import { permitKey, type RawCell, tidyText } from "./clean";
import { excelSerialToISO, parseDateText } from "./dates";
import type { HitchDates } from "./hitches";
import type { ScopeItem } from "./types";

/**
 * Bump whenever readWorkbook's output changes: cached past-year workbooks (parsed once and kept
 * in the browser) with an older version are parsed again.
 */
export const PARSER_VERSION = 2;

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
  /** File name (e.g. "TSG Field Tracker - Master 2026.xlsx"). */
  source?: string;
  rows: RawTrackerRow[];
  /** 0-based column index of each field (for writing back later). */
  columns: Partial<Record<TrackerField, number>>;
  headerRow: number;
  hitches: HitchDates[];
  /** Field-queue rows; optional so older callers and tests can leave it out. */
  scope?: ScopeItem[];
};

/**
 * The field schedules (RM# CNP, Entergy) aren't reliable enough to use yet, so they're not read.
 * Set this to true to bring the field queue back on the Projects pages; the parsing, matching
 * and pace math below are kept and tested for that.
 */
export const READ_FIELD_SCHEDULES = false;

/**
 * Field-queue sheets and the tracker OPCO each one belongs to. Sheets are matched by name, so a
 * new "RM20 CNP" sheet is picked up without a code change.
 */
const SCOPE_SHEETS: { match: RegExp; opco: string }[] = [
  { match: /^RM\s*\d+\s*CNP$/i, opco: "CenterPoint" },
  { match: /^Entergy\s*Eng.*Schedule$/i, opco: "ENTERGY" },
  { match: /^EntergyJU.*Schedule$/i, opco: "ENTERGY" },
];

/** Scope-sheet columns, by header text (lowercase, spaces removed). */
const SCOPE_COLUMNS: Record<Exclude<keyof ScopeItem, "sheet" | "opco" | "permitKey" | "excelRow">, string[]> = {
  key: ["circuit", "wodescription", "permit"],
  status: ["status"],
  poles: ["polecount", "count"],
  goBackPoles: ["gobackpolecount"],
  city: ["city"],
  state: ["state"],
  priority: ["fieldpriority", "priority"],
  workOrder: ["billto-workorder", "workorder"],
  received: ["receiveddate", "datereceivedwork"],
  due: ["fieldduedate", "duedate"],
};

export class WorkbookError extends Error {}

type DenseCell = { v?: unknown; w?: string; t?: string } | null | undefined;
type DenseSheet = { "!data"?: DenseCell[][]; "!ref"?: string };

export type ReadOptions = {
  /** File name, recorded on every row and issue so multi-year data says where it came from. */
  source?: string;
  readSchedules?: boolean;
};

export function readWorkbook(data: ArrayBuffer | Uint8Array, options: ReadOptions = {}): RawWorkbook {
  const { source, readSchedules = READ_FIELD_SCHEDULES } = options;
  // Listing sheet names is cheap; it tells us which scope sheets to parse.
  const scopeSheets = readSchedules
    ? XLSX.read(data, { type: "array", bookSheets: true }).SheetNames.filter((n) => SCOPE_SHEETS.some((s) => s.match.test(n.trim())))
    : [];

  const wb = XLSX.read(data, {
    type: "array",
    dense: true,
    sheets: [TRACKER_SHEET, HITCH_SHEET, ...scopeSheets],
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

  const scope = scopeSheets.flatMap((name) => {
    const sheet = wb.Sheets[name] as DenseSheet | undefined;
    const opco = SCOPE_SHEETS.find((s) => s.match.test(name.trim()))!.opco;
    return sheet ? readScope(sheet, name, opco) : [];
  });

  return { source, rows, columns, headerRow, hitches, scope };
}

function readScope(sheet: DenseSheet, name: string, opco: string): ScopeItem[] {
  const data = sheet["!data"] ?? [];
  const origin = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]).s.r : 0;
  const squash = (cell: DenseCell) => headerText(cell).replace(/\s+/g, "");

  const headerIndex = data.slice(0, 20).findIndex((row) => {
    const h = (row ?? []).map(squash);
    return h.includes("status") && SCOPE_COLUMNS.key.some((k) => h.includes(k));
  });
  if (headerIndex < 0) return [];

  const headers = (data[headerIndex] ?? []).map(squash);
  // First matching header wins, so a summary block further right (e.g. a second "State") is ignored.
  const col = (aliases: string[]) => {
    for (const alias of aliases) {
      const i = headers.indexOf(alias);
      if (i >= 0) return i;
    }
    return -1;
  };
  const at = (row: DenseCell[], aliases: string[]) => {
    const i = col(aliases);
    return i >= 0 ? row[i] : undefined;
  };

  const items: ScopeItem[] = [];
  for (let r = headerIndex + 1; r < data.length; r++) {
    const row = data[r] ?? [];
    const keyCell = at(row, SCOPE_COLUMNS.key);
    const key = keyCell && hasValue(keyCell) ? tidyText(String(keyCell.w ?? keyCell.v)) : "";
    if (!key) continue;
    items.push({
      sheet: name,
      opco,
      key,
      permitKey: permitKey(key),
      status: textOf(at(row, SCOPE_COLUMNS.status)),
      poles: numberOf(at(row, SCOPE_COLUMNS.poles)),
      goBackPoles: numberOf(at(row, SCOPE_COLUMNS.goBackPoles)),
      city: textOf(at(row, SCOPE_COLUMNS.city)),
      state: textOf(at(row, SCOPE_COLUMNS.state)),
      priority: textOf(at(row, SCOPE_COLUMNS.priority)),
      workOrder: textOf(at(row, SCOPE_COLUMNS.workOrder)),
      received: cellDate(at(row, SCOPE_COLUMNS.received)),
      due: cellDate(at(row, SCOPE_COLUMNS.due)),
      excelRow: origin + r + 1,
    });
  }
  return items;
}

function textOf(cell: DenseCell): string | null {
  if (!hasValue(cell)) return null;
  const text = tidyText(String(cell!.w ?? cell!.v));
  return text || null;
}

function numberOf(cell: DenseCell): number | null {
  if (!hasValue(cell)) return null;
  const n = typeof cell!.v === "number" ? cell!.v : Number(String(cell!.v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
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

/**
 * Reads the "Hitch Start Dates" / "Hitch End Dates" columns, wherever they are. Older trackers
 * (2025) only list start dates; their ends are filled in from the pattern later.
 */
function readHitchDates(sheet: DenseSheet): HitchDates[] {
  const data = sheet["!data"] ?? [];
  for (let r = 0; r < Math.min(data.length, 20); r++) {
    const headers = (data[r] ?? []).map(headerText);
    const startCol = headers.indexOf("hitch start dates");
    const endCol = headers.indexOf("hitch end dates");
    if (startCol < 0) continue;

    const hitches: HitchDates[] = [];
    for (let i = r + 1; i < data.length; i++) {
      const start = cellDate(data[i]?.[startCol]);
      const end = endCol >= 0 ? cellDate(data[i]?.[endCol]) : null;
      if (start) hitches.push({ start, end });
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
