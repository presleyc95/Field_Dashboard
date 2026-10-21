/**
 * Report data: a person's production day by day, the daily report (one date, usually yesterday,
 * since rows are entered the morning after) and the end-of-hitch report. Same definitions as
 * metrics.ts.
 */
import { addDays } from "./dates";
import { dailyPoles, type DailyPoint, type Group, groupRecords, isProduction, recordsInHitch, totals, type Totals } from "./metrics";
import type { Dataset, Hitch, ISODate, TrackerRecord } from "./types";

// ---- A person's days ----------------------------------------------------------------------

export type PersonDay = {
  date: ISODate;
  hitchId: number | null;
  hitchDay: number | null;
  /** At least one production row (not just drive time or coordination). */
  production: boolean;
  rows: number;
  poles: number;
  permitHours: number;
  driveHours: number;
  mileage: number;
  permits: string[];
  opcos: string[];
  tasks: string[];
  /** Who they worked with that day. */
  partners: string[];
  recordIds: number[];
};

/** One entry per date the person has rows, newest first. */
export function personDays(records: TrackerRecord[], name: string): PersonDay[] {
  const byDate = new Map<ISODate, TrackerRecord[]>();
  for (const r of records) {
    if (!r.date) continue;
    let list = byDate.get(r.date);
    if (!list) byDate.set(r.date, (list = []));
    list.push(r);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, rows]) => {
      const t = totals(rows);
      return {
        date,
        hitchId: rows[0]!.hitchId,
        hitchDay: rows[0]!.hitchDay,
        production: rows.some(isProduction),
        rows: rows.length,
        poles: t.poles,
        permitHours: t.permitHours,
        driveHours: t.driveHours,
        mileage: t.mileage,
        permits: distinct(rows.map((r) => r.permitKey && r.permitId)),
        opcos: distinct(rows.map((r) => r.opco)),
        tasks: distinct(rows.map((r) => r.task)),
        partners: distinct(rows.map((r) => (r.tech === name ? r.partner : r.tech))),
        recordIds: rows.map((r) => r.id),
      };
    });
}

// ---- Daily report -------------------------------------------------------------------------

export type TeamLine = Group & {
  opcos: string[];
  permitIds: string[];
  tasks: string[];
  /** Rows marked Complete (jobs finished that day / that hitch). */
  completed: number;
};

export type DailyReport = {
  date: ISODate;
  hitch: Hitch | null;
  hitchDay: number | null;
  records: TrackerRecord[];
  totals: Totals;
  teams: TeamLine[];
  opcos: Group[];
  tasks: Group[];
  /** Average poles per working day earlier in the same hitch, for comparison. */
  hitchAverage: number | null;
  /** Dates with rows just before and after this one, for paging. */
  previousDate: ISODate | null;
  nextDate: ISODate | null;
};

/** The day the report opens on: yesterday, or the latest day with data when yesterday has none. */
export function defaultReportDate(dataset: Dataset, today: ISODate): ISODate | null {
  const yesterday = addDays(today, -1);
  return dataset.records.some((r) => r.date === yesterday) ? yesterday : dataset.dataThrough;
}

export function dailyReport(dataset: Dataset, date: ISODate): DailyReport {
  const records = dataset.records.filter((r) => r.date === date);
  const hitchId = records.find((r) => r.hitchId !== null)?.hitchId ?? dataset.hitches.find((h) => h.start <= date && date <= h.end)?.id ?? null;
  const hitch = hitchId !== null ? dataset.hitches[hitchId]! : null;

  let hitchAverage: number | null = null;
  if (hitch) {
    const earlier = recordsInHitch(dataset, hitch.id).filter((r) => r.date && r.date < date);
    const days = new Set(earlier.filter(isProduction).map((r) => r.date)).size;
    hitchAverage = days ? totals(earlier).poles / days : null;
  }

  let previousDate: ISODate | null = null;
  let nextDate: ISODate | null = null;
  for (const r of dataset.records) {
    if (!r.date) continue;
    if (r.date < date && (!previousDate || r.date > previousDate)) previousDate = r.date;
    if (r.date > date && (!nextDate || r.date < nextDate)) nextDate = r.date;
  }

  return {
    date,
    hitch,
    hitchDay: hitch ? records.find((r) => r.hitchDay !== null)?.hitchDay ?? null : null,
    records,
    totals: totals(records),
    teams: teamLines(dataset, records),
    opcos: groupRecords(records, "opco"),
    tasks: groupRecords(records, "task"),
    hitchAverage,
    previousDate,
    nextDate,
  };
}

// ---- Hitch report -------------------------------------------------------------------------

export type ProjectLine = Group & {
  umbrella: string | null;
  /** Teams that worked the OPCO this hitch. */
  teamNames: string[];
  /** Jobs (permit + task) marked Complete during the hitch. */
  jobsCompleted: number;
};

export type HitchReport = {
  hitch: Hitch;
  records: TrackerRecord[];
  totals: Totals;
  projects: ProjectLine[];
  teams: TeamLine[];
  tasks: Group[];
  daily: DailyPoint[];
  /** Jobs (permit + task) whose Complete row falls in the hitch. */
  jobsCompleted: number;
};

export function hitchReport(dataset: Dataset, hitchId: number): HitchReport {
  const hitch = dataset.hitches[hitchId]!;
  const records = recordsInHitch(dataset, hitchId);
  const projects = groupRecords(records, "opco").map((g) => {
    const rows = g.recordIds.map((id) => dataset.records[id]!);
    return {
      ...g,
      umbrella: rows[0]?.umbrella ?? null,
      teamNames: groupRecords(rows, "team").map((t) => t.key),
      jobsCompleted: completedJobs(rows),
    };
  });
  return {
    hitch,
    records,
    totals: totals(records),
    projects,
    teams: teamLines(dataset, records),
    tasks: groupRecords(records, "task"),
    daily: dailyPoles(dataset, hitch),
    jobsCompleted: completedJobs(records),
  };
}

// ---- Shared -------------------------------------------------------------------------------

function teamLines(dataset: Dataset, records: TrackerRecord[]): TeamLine[] {
  return groupRecords(records, "team").map((g) => {
    const rows = g.recordIds.map((id) => dataset.records[id]!);
    return {
      ...g,
      opcos: distinct(rows.map((r) => r.opco)),
      permitIds: distinct(rows.map((r) => r.permitKey && r.permitId)),
      tasks: distinct(rows.map((r) => r.task)),
      completed: rows.filter((r) => r.status === "Complete").length,
    };
  });
}

function completedJobs(records: TrackerRecord[]): number {
  return new Set(records.filter((r) => r.status === "Complete" && r.permitKey).map((r) => `${r.permitKey}|${r.task}`)).size;
}

function distinct(values: (string | null | undefined | false)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
}
