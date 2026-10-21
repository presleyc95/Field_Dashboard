/**
 * Everything the permit detail page shows (ARCHITECTURE.md §6.1), worked out from a permit's
 * rows: overall status, totals, one summary per task, a timeline with gaps, and data-quality
 * flags.
 */
import { UPLOAD_TASKS } from "./clean";
import { daysBetween, formatShort } from "./dates";
import type { DataIssue, Dataset, ISODate, Permit, Status, TrackerRecord } from "./types";

export type PermitOverall = "In progress" | "Awaiting upload" | "Complete" | "Unknown";

export type TaskSummary = {
  task: string;
  /** Status of the task's most recent row with a known status. */
  latestStatus: Status;
  poles: number;
  permitHours: number;
  driveHours: number;
  /** Distinct work dates. */
  days: number;
  firstDate: ISODate | null;
  lastDate: ISODate | null;
  people: string[];
  /** Whether this task's photos go to Katapult. */
  uploadable: boolean;
  /** Completed rows marked uploaded / completed rows (uploadable tasks only). */
  uploadsDone: number;
  uploadsTotal: number;
  recordIds: number[];
};

export type TimelineEntry =
  | { kind: "row"; record: TrackerRecord }
  | { kind: "gap"; days: number; from: ISODate; to: ISODate };

export type PermitFlag = { code: string; message: string };

export type PermitSummary = {
  permit: Permit;
  /** Rows in date order (undated last). */
  records: TrackerRecord[];
  overall: PermitOverall;
  firstDate: ISODate | null;
  lastDate: ISODate | null;
  /** Calendar days from first to last field date, both included. */
  daysOpen: number | null;
  poles: number;
  permitHours: number;
  driveHours: number;
  mileage: number;
  people: string[];
  uploadsDone: number;
  uploadsTotal: number;
  tasks: TaskSummary[];
  timeline: TimelineEntry[];
  flags: PermitFlag[];
  /** Data-quality issues logged for this permit's rows. */
  issues: DataIssue[];
};

/** A gap between field dates longer than this (more than one hitch cycle) is marked as a stall. */
export const STALL_GAP_DAYS = 14;

export function summarizePermit(dataset: Dataset, permit: Permit): PermitSummary {
  const records = permit.recordIds.map((id) => dataset.records[id]!).sort(byDateThenRow);

  const tasks = summarizeTasks(records);
  const firstDate = permit.firstDate;
  const lastDate = permit.lastDate;
  const uploadsDone = tasks.reduce((n, t) => n + t.uploadsDone, 0);
  const uploadsTotal = tasks.reduce((n, t) => n + t.uploadsTotal, 0);
  const rows = new Set(records.map((r) => r.excelRow));

  return {
    permit,
    records,
    overall: overallStatus(tasks, uploadsDone, uploadsTotal),
    firstDate,
    lastDate,
    daysOpen: firstDate && lastDate ? daysBetween(firstDate, lastDate) + 1 : null,
    poles: sum(records, (r) => r.poles),
    permitHours: sum(records, (r) => r.hoursOnPermit),
    driveHours: sum(records, (r) => r.driveHours),
    mileage: sum(records, (r) => r.mileage),
    people: peopleOf(records),
    uploadsDone,
    uploadsTotal,
    tasks,
    timeline: buildTimeline(records),
    flags: permitFlags(permit, tasks, dataset.dataThrough),
    issues: dataset.issues.filter((i) => rows.has(i.excelRow)),
  };
}

/** Overall status only, for ranking and filtering many permits at once. */
export function permitOverall(dataset: Dataset, permit: Permit): PermitOverall {
  const records = permit.recordIds.map((id) => dataset.records[id]!).sort(byDateThenRow);
  const tasks = summarizeTasks(records);
  return overallStatus(
    tasks,
    tasks.reduce((n, t) => n + t.uploadsDone, 0),
    tasks.reduce((n, t) => n + t.uploadsTotal, 0),
  );
}

function summarizeTasks(records: TrackerRecord[]): TaskSummary[] {
  const byTask = new Map<string, TrackerRecord[]>();
  for (const rec of records) {
    const task = rec.task ?? "UNKNOWN";
    let list = byTask.get(task);
    if (!list) byTask.set(task, (list = []));
    list.push(rec);
  }

  return [...byTask.entries()].map(([task, rows]) => {
    const known = rows.filter((r) => r.status !== "Unknown");
    const uploadable = UPLOAD_TASKS.includes(task);
    const completed = rows.filter((r) => r.status === "Complete");
    const dates = rows.map((r) => r.date).filter((d): d is ISODate => !!d);
    return {
      task,
      latestStatus: known.at(-1)?.status ?? "Unknown",
      poles: sum(rows, (r) => r.poles),
      permitHours: sum(rows, (r) => r.hoursOnPermit),
      driveHours: sum(rows, (r) => r.driveHours),
      days: new Set(dates).size,
      firstDate: dates[0] ?? null,
      lastDate: dates.at(-1) ?? null,
      people: peopleOf(rows),
      uploadable,
      uploadsDone: uploadable ? completed.filter((r) => r.uploaded).length : 0,
      uploadsTotal: uploadable ? completed.length : 0,
      recordIds: rows.map((r) => r.id),
    };
  });
}

/** Drive time and coordination don't decide whether the permit's field work is finished. */
const NON_WORK_TASKS = new Set(["DRIVE TIME", "COORDINATION", "UNKNOWN"]);

function overallStatus(tasks: TaskSummary[], uploadsDone: number, uploadsTotal: number): PermitOverall {
  const work = tasks.filter((t) => !NON_WORK_TASKS.has(t.task));
  const considered = work.length ? work : tasks;
  if (considered.some((t) => t.latestStatus === "In Progress")) return "In progress";
  if (considered.every((t) => t.latestStatus === "Unknown")) return "Unknown";
  if (uploadsDone < uploadsTotal) return "Awaiting upload";
  return "Complete";
}

function buildTimeline(records: TrackerRecord[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let prevDate: ISODate | null = null;
  for (const record of records) {
    if (prevDate && record.date && record.date !== prevDate) {
      const days = daysBetween(prevDate, record.date);
      if (days > STALL_GAP_DAYS) entries.push({ kind: "gap", days, from: prevDate, to: record.date });
    }
    entries.push({ kind: "row", record });
    if (record.date) prevDate = record.date;
  }
  return entries;
}

function permitFlags(permit: Permit, tasks: TaskSummary[], dataThrough: ISODate | null): PermitFlag[] {
  const flags: PermitFlag[] = [];
  if (permit.variants.length) {
    flags.push({
      code: "spelling-variants",
      message: `Also spelled ${permit.variants.map((v) => `"${v}"`).join(", ")} in the tracker`,
    });
  }
  if (permit.opcos.length > 1) {
    flags.push({ code: "multiple-opcos", message: `Logged under more than one OPCO: ${permit.opcos.join(", ")}` });
  }
  for (const t of tasks) {
    if (t.latestStatus !== "In Progress" || !t.lastDate || !dataThrough) continue;
    const idle = daysBetween(t.lastDate, dataThrough);
    if (idle > STALL_GAP_DAYS) {
      flags.push({
        code: "stalled",
        message: `${t.task} has been In Progress since ${formatShort(t.lastDate, true)} (${idle} days) with no completion`,
      });
    }
  }
  return flags;
}

function byDateThenRow(a: TrackerRecord, b: TrackerRecord): number {
  if (a.date !== b.date) {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? -1 : 1;
  }
  return a.excelRow - b.excelRow;
}

function sum(records: TrackerRecord[], value: (r: TrackerRecord) => number | null): number {
  return records.reduce((n, r) => n + (value(r) ?? 0), 0);
}

/** Loggers and partners, in order of first appearance. */
function peopleOf(records: TrackerRecord[]): string[] {
  const people: string[] = [];
  for (const r of records) {
    for (const name of [r.tech, r.partner]) if (name && !people.includes(name)) people.push(name);
  }
  return people;
}
