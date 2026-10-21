/**
 * Clean-up rules for tracker values (ARCHITECTURE.md §5). Each function turns one raw cell into a
 * standard value and reports what it changed or found to an IssueLog, so the Data Quality page
 * can show every fix.
 */
import { excelSerialToISO, parseDateText } from "./dates";
import type { DataIssue, ISODate, IssueKind, Status } from "./types";

/** A cell as read from the workbook: its stored value and the text Excel displays. */
export type RawCell = { v: unknown; w?: string } | undefined;

export class IssueLog {
  readonly issues: DataIssue[] = [];
  /** Workbook the rows being cleaned come from; set before each workbook. */
  source = "";

  add(excelRow: number, field: string, kind: IssueKind, code: string, message: string, original: unknown, source = this.source) {
    this.issues.push({ source, excelRow, field, kind, code, message, original: displayText(original) });
  }
}

function displayText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Collapses whitespace, line breaks and Excel's `_x000D_` escapes into single spaces. */
export function tidyText(text: string): string {
  return text.replace(/_x000D_/gi, " ").replace(/\s+/g, " ").trim();
}

function rawText(cell: RawCell): string {
  if (!cell || cell.v === null || cell.v === undefined) return "";
  return typeof cell.v === "string" ? cell.v : (cell.w ?? String(cell.v));
}

// ---- Task --------------------------------------------------------------------------------

/** Standard task names, keyed by the normalized form of every spelling seen. */
const TASK_ALIASES: Record<string, string> = {
  KATAPULT: "KATAPULT",
  PCI: "PCI",
  "GO BACKS": "GO BACKS",
  "GO BACK": "GO BACKS",
  "PCI GO BACK": "GO BACKS",
  "PCI GO BACKS": "GO BACKS",
  "POWER PCI": "POWER PCI",
  STAKING: "STAKING",
  "FINAL STAKING": "STAKING",
  "QC / OTHER": "QA/QC",
  "QC/OTHER": "QA/QC",
  "DRIVE TIME (MOB/DEMOB)": "DRIVE TIME",
  "DRIVE TIME": "DRIVE TIME",
  DRIVE: "DRIVE TIME",
  COORDINATION: "COORDINATION",
  MISC: "MISC",
  "QA/QC": "QA/QC",
  POWER: "POWER",
  WALKOUT: "WALKOUT",
};

/** Spellings offered by the tracker's own dropdown; these aren't reported as fixes. */
const TASK_DROPDOWN = new Set([
  "KATAPULT",
  "PCI",
  "GO BACKS",
  "POWER PCI",
  "STAKING",
  "DRIVE TIME (MOB/DEMOB)",
  "Coordination",
  "MISC",
  "QA/QC",
  "POWER",
  "WALKOUT",
]);

export const PRODUCTION_TASKS = ["KATAPULT", "PCI", "GO BACKS", "POWER PCI", "STAKING"] as const;

/** Tasks whose photos the field admin uploads to Katapult (STAKING isn't uploaded). */
export const UPLOAD_TASKS: readonly string[] = ["KATAPULT", "PCI", "GO BACKS", "POWER PCI"];

export function cleanTask(cell: RawCell, row: number, log: IssueLog): string | null {
  const raw = tidyText(rawText(cell));
  if (!raw) {
    log.add(row, "Task", "flag", "missing-task", "No task", "");
    return null;
  }
  const key = raw
    .toUpperCase()
    .replace(/-/g, " ")
    .replace(/\s+0(\.0+)?$/, "")
    .replace(/\s+/g, " ");
  const task = TASK_ALIASES[key];
  if (!task) {
    log.add(row, "Task", "flag", "unknown-task", `Unrecognized task "${raw}"`, raw);
    return raw.toUpperCase();
  }
  if (!TASK_DROPDOWN.has(raw)) {
    log.add(row, "Task", "fixed", "task-spelling", `"${raw}" read as ${task}`, raw);
  }
  return task;
}

// ---- Status ------------------------------------------------------------------------------

/** `required` false: a blank status isn't flagged (Coordinator and Drive Time rows). */
export function cleanStatus(cell: RawCell, row: number, log: IssueLog, required = true): Status {
  const raw = tidyText(rawText(cell));
  const lower = raw.toLowerCase();
  if (lower === "complete" || lower === "completed") {
    if (raw !== "Complete") log.add(row, "Status", "fixed", "status-spelling", `"${raw}" read as Complete`, raw);
    return "Complete";
  }
  if (lower === "in progress") {
    if (raw !== "In Progress") log.add(row, "Status", "fixed", "status-spelling", `"${raw}" read as In Progress`, raw);
    return "In Progress";
  }
  if (!raw) {
    if (required) log.add(row, "Status", "flag", "missing-status", "No status", "");
  } else {
    log.add(row, "Status", "flag", "unknown-status", `Unrecognized status "${raw}"`, raw);
  }
  return "Unknown";
}

// ---- Numbers -----------------------------------------------------------------------------

export function cleanNumber(cell: RawCell, field: string, row: number, log: IssueLog): number | null {
  if (!cell || cell.v === null || cell.v === undefined) return null;
  if (typeof cell.v === "number") return Number.isFinite(cell.v) ? cell.v : null;
  const raw = tidyText(String(cell.v));
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  if (Number.isFinite(n)) {
    log.add(row, field, "fixed", "text-number", `Number stored as text ("${raw}")`, raw);
    return n;
  }
  log.add(row, field, "flag", "bad-number", `"${raw}" isn't a number`, raw);
  return null;
}

// ---- Date --------------------------------------------------------------------------------

export function cleanDate(cell: RawCell, row: number, log: IssueLog): ISODate | null {
  if (!cell || cell.v === null || cell.v === undefined || cell.v === "") {
    log.add(row, "Date", "flag", "missing-date", "No date", "");
    return null;
  }
  if (typeof cell.v === "number") {
    const iso = excelSerialToISO(cell.v);
    if (!iso) log.add(row, "Date", "flag", "bad-date", "Date can't be read", cell.w ?? cell.v);
    return iso;
  }
  const raw = tidyText(String(cell.v));
  const iso = parseDateText(raw);
  if (iso) log.add(row, "Date", "fixed", "text-date", `Date stored as text ("${raw}")`, raw);
  else log.add(row, "Date", "flag", "bad-date", `"${raw}" isn't a date`, raw);
  return iso;
}

// ---- Uploaded to Katapult -----------------------------------------------------------------

/** `Yes` means uploaded; blank, `0`, `Na` and `n/a` all mean not yet. */
export function cleanUploaded(cell: RawCell): boolean {
  return tidyText(rawText(cell)).toLowerCase() === "yes";
}

// ---- People and free text -----------------------------------------------------------------

const NO_PARTNER = new Set(["", "N/A", "NA", "NONE", "0", "-"]);

/** A person's name with whitespace tidied, or null for blanks and "N/A". */
export function cleanName(cell: RawCell): string | null {
  const raw = tidyText(rawText(cell));
  return NO_PARTNER.has(raw.toUpperCase()) ? null : raw;
}

const EMPTY_NOTES = new Set(["", "0", "NA", "N/A"]);

export function cleanNotes(cell: RawCell): string | null {
  const raw = rawText(cell).trim();
  return EMPTY_NOTES.has(raw.toUpperCase()) ? null : raw;
}

// ---- Permit ID ---------------------------------------------------------------------------

const PLACEHOLDER_KEYS = new Set(["COORDINATOR", "DRIVE TIME"]);

export type CleanPermit = {
  /** Display text, or null when blank. */
  text: string | null;
  /** Comparison key, or null for placeholders and blanks. */
  key: string | null;
  isPlaceholder: boolean;
};

export function permitKey(text: string): string {
  return tidyText(text).toUpperCase();
}

/**
 * Permit IDs are read from the text Excel displays, so a value Excel stored as a number or
 * date still matches what people see in the sheet.
 */
export function cleanPermit(cell: RawCell, row: number, log: IssueLog): CleanPermit {
  if (!cell || cell.v === null || cell.v === undefined || cell.v === "") {
    log.add(row, "Permit ID", "flag", "missing-permit", "No Permit ID", "");
    return { text: null, key: null, isPlaceholder: false };
  }
  const shown = typeof cell.v === "string" ? cell.v : (cell.w ?? String(cell.v));
  const text = tidyText(shown);
  // A number Excel shows as something other than a number (e.g. "Mar-41") has a date format.
  if (typeof cell.v === "number" && !/^-?[\d,]*\.?\d+$/.test(text)) {
    log.add(row, "Permit ID", "flag", "permit-as-date", `Excel turned this Permit ID into a date (${text})`, text);
  } else if (typeof cell.v === "string" && text !== cell.v) {
    log.add(row, "Permit ID", "fixed", "permit-whitespace", "Extra spaces or line breaks removed", cell.v);
  }
  const key = permitKey(text);
  const isPlaceholder = PLACEHOLDER_KEYS.has(key);
  return { text, key: isPlaceholder ? null : key, isPlaceholder };
}

// ---- Spelling variants ---------------------------------------------------------------------

/**
 * Picks one spelling for values that differ only by capitalization and spacing (OPCOs,
 * names, permit IDs): the most common one wins, ties go to the first seen.
 */
export class SpellingPicker {
  private counts = new Map<string, Map<string, number>>();

  constructor(private keyOf: (text: string) => string = (t) => tidyText(t).toUpperCase()) {}

  add(text: string) {
    const key = this.keyOf(text);
    let spellings = this.counts.get(key);
    if (!spellings) this.counts.set(key, (spellings = new Map()));
    spellings.set(text, (spellings.get(text) ?? 0) + 1);
  }

  /** The chosen spelling for `text`'s group. */
  pick(text: string): string {
    const spellings = this.counts.get(this.keyOf(text));
    if (!spellings) return text;
    let best = text;
    let bestCount = -1;
    for (const [spelling, count] of spellings) {
      if (count > bestCount) {
        best = spelling;
        bestCount = count;
      }
    }
    return best;
  }

  /** Every spelling in `text`'s group other than the chosen one. */
  variants(text: string): string[] {
    const chosen = this.pick(text);
    return [...(this.counts.get(this.keyOf(text))?.keys() ?? [])].filter((s) => s !== chosen);
  }
}
