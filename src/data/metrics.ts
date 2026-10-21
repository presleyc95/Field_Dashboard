/**
 * Production metrics (ARCHITECTURE.md §6.3). Every number on the Command Center, Hitches and
 * Production pages comes from here, so the definitions live in one place:
 *
 * - **Poles** are counted once per row (one row is one team's work).
 * - **Credited poles** give each person on a row the row's poles (a pair both get credit).
 * - **Tech-days** are distinct person + date pairs with a production task (KATAPULT, PCI,
 *   GO BACKS, POWER PCI, STAKING); drive time and coordination days don't count.
 * - **Poles per tech-day** = credited poles ÷ tech-days. For a pair it's the team's daily
 *   output; for someone solo, their own.
 * - **Upload backlog** = Complete rows of KATAPULT, PCI, GO BACKS or POWER PCI not marked
 *   uploaded (the upload queue rule).
 */
import { PRODUCTION_TASKS, UPLOAD_TASKS } from "./clean";
import { addDays, dayNumber, daysBetween } from "./dates";
import type { Dataset, Hitch, ISODate, TrackerRecord } from "./types";

const PRODUCTION = new Set<string>(PRODUCTION_TASKS);

export function isProduction(r: TrackerRecord): boolean {
  return !!r.task && PRODUCTION.has(r.task);
}

export function awaitingUpload(r: TrackerRecord): boolean {
  return r.status === "Complete" && !!r.task && UPLOAD_TASKS.includes(r.task) && !r.uploaded;
}

/** Names on a row: the logger and their partner. */
export function crewOf(r: TrackerRecord): string[] {
  return r.partner && r.tech ? [r.tech, r.partner] : r.tech ? [r.tech] : [];
}

/** "Alex Reed + Sam Ortiz" (alphabetical), or the logger alone for solo rows. */
export function teamKey(r: TrackerRecord): string | null {
  if (!r.tech) return null;
  return r.partner ? [r.tech, r.partner].sort((a, b) => a.localeCompare(b)).join(" + ") : r.tech;
}

export type Totals = {
  rows: number;
  poles: number;
  creditedPoles: number;
  techDays: number;
  /** Distinct dates with a production row. */
  workDays: number;
  permitHours: number;
  driveHours: number;
  mileage: number;
  people: number;
  teams: number;
  permits: number;
  polesPerTechDay: number | null;
  polesPerHour: number | null;
};

export function totals(records: TrackerRecord[]): Totals {
  const techDays = new Set<string>();
  const workDays = new Set<ISODate>();
  const people = new Set<string>();
  const teams = new Set<string>();
  const permits = new Set<string>();
  let poles = 0;
  let creditedPoles = 0;
  let permitHours = 0;
  let driveHours = 0;
  let mileage = 0;

  for (const r of records) {
    const crew = crewOf(r);
    const p = r.poles ?? 0;
    poles += p;
    creditedPoles += p * crew.length;
    permitHours += r.hoursOnPermit ?? 0;
    driveHours += r.driveHours ?? 0;
    mileage += r.mileage ?? 0;
    for (const name of crew) people.add(name);
    const team = teamKey(r);
    if (team) teams.add(team);
    if (r.permitKey) permits.add(r.permitKey);
    if (isProduction(r) && r.date) {
      workDays.add(r.date);
      for (const name of crew) techDays.add(`${name}|${r.date}`);
    }
  }

  return {
    rows: records.length,
    poles,
    creditedPoles,
    techDays: techDays.size,
    workDays: workDays.size,
    permitHours,
    driveHours,
    mileage,
    people: people.size,
    teams: teams.size,
    permits: permits.size,
    polesPerTechDay: techDays.size ? creditedPoles / techDays.size : null,
    polesPerHour: permitHours ? poles / permitHours : null,
  };
}

export type Group = Totals & { key: string; recordIds: number[] };

export type GroupBy = "opco" | "umbrella" | "team" | "person" | "task";

/**
 * Totals per OPCO, umbrella, team, person or task. Grouping by person credits each person on
 * a row with its poles, so person groups add up to more than the row total.
 */
export function groupRecords(records: TrackerRecord[], by: GroupBy): Group[] {
  const groups = new Map<string, TrackerRecord[]>();
  for (const r of records) {
    for (const key of keysFor(r, by)) {
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(r);
    }
  }
  return [...groups.entries()]
    .map(([key, rows]) => {
      const t = totals(rows);
      // A person's credit is their own share, not the whole crew's.
      if (by === "person") {
        const days = personDays(rows, key);
        t.creditedPoles = t.poles;
        t.techDays = days;
        t.polesPerTechDay = days ? t.poles / days : null;
      }
      return { key, recordIds: rows.map((r) => r.id), ...t };
    })
    .sort((a, b) => b.poles - a.poles || a.key.localeCompare(b.key));
}

function keysFor(r: TrackerRecord, by: GroupBy): string[] {
  switch (by) {
    case "opco":
      return [r.opco ?? "No OPCO"];
    case "umbrella":
      return [r.umbrella ?? r.opco ?? "No OPCO"];
    case "team": {
      const k = teamKey(r);
      return k ? [k] : ["No tech"];
    }
    case "person":
      return crewOf(r);
    case "task":
      return [r.task ?? "No task"];
  }
}

function personDays(rows: TrackerRecord[], person: string): number {
  const days = new Set<ISODate>();
  for (const r of rows) if (r.date && isProduction(r) && crewOf(r).includes(person)) days.add(r.date);
  return days.size;
}

// ---- Hitches -------------------------------------------------------------------------------

export function recordsInHitch(dataset: Dataset, hitchId: number, throughDay = Infinity): TrackerRecord[] {
  return dataset.records.filter((r) => r.hitchId === hitchId && (r.hitchDay ?? 0) <= throughDay);
}

export function recordsBetween(dataset: Dataset, from: ISODate, to: ISODate): TrackerRecord[] {
  return dataset.records.filter((r) => r.date && r.date >= from && r.date <= to);
}

/**
 * How many days of a hitch the data covers. Rows arrive the morning after, so for the
 * current hitch this is usually yesterday's hitch day.
 */
export function daysCovered(hitch: Hitch, dataThrough: ISODate | null): number {
  if (!dataThrough || dataThrough < hitch.start) return 0;
  return Math.min(hitch.days, daysBetween(hitch.start, dataThrough) + 1);
}

export type HitchSummary = Totals & {
  hitch: Hitch;
  /** Days of the hitch with data (less than `hitch.days` for the current one). */
  daysCovered: number;
  state: "past" | "current" | "upcoming";
};

export function summarizeHitches(dataset: Dataset, today: ISODate): HitchSummary[] {
  const byHitch = new Map<number, TrackerRecord[]>();
  for (const r of dataset.records) {
    if (r.hitchId === null) continue;
    let list = byHitch.get(r.hitchId);
    if (!list) byHitch.set(r.hitchId, (list = []));
    list.push(r);
  }
  return dataset.hitches.map((hitch) => ({
    hitch,
    daysCovered: daysCovered(hitch, dataset.dataThrough),
    state: today > hitch.end ? "past" : today >= hitch.start ? "current" : "upcoming",
    ...totals(byHitch.get(hitch.id) ?? []),
  }));
}

export type DailyPoint = { day: number; date: ISODate; poles: number; techDays: number };

/** Poles for each day of a hitch (days without rows count as 0 up to the data date). */
export function dailyPoles(dataset: Dataset, hitch: Hitch): DailyPoint[] {
  const rows = recordsInHitch(dataset, hitch.id);
  const covered = daysCovered(hitch, dataset.dataThrough);
  return Array.from({ length: covered }, (_, i) => {
    const date = addDays(hitch.start, i);
    const t = totals(rows.filter((r) => r.date === date));
    return { day: i + 1, date, poles: t.poles, techDays: t.techDays };
  });
}

export type Change = { current: number; previous: number; delta: number | null };

/** Fractional change, or null when there's nothing to compare against. */
export function change(current: number | null, previous: number | null): Change {
  const c = current ?? 0;
  const p = previous ?? 0;
  return { current: c, previous: p, delta: previous ? (c - p) / p : null };
}

// ---- Command Center ------------------------------------------------------------------------

export type CommandCenterStats = {
  current: Hitch;
  previous: Hitch | null;
  /** Days of the current hitch with data; the previous hitch is compared over the same days. */
  daysCovered: number;
  now: Totals;
  then: Totals | null;
  backlog: { rows: number; poles: number; oldest: ISODate | null; thisHitch: number };
  offHitchRows: number;
};

/**
 * The current (or most recent) hitch compared with the previous one at the same point, so a
 * hitch on day 6 is compared with the first 6 days of the last one.
 */
export function commandCenter(dataset: Dataset, hitchId: number): CommandCenterStats {
  const current = dataset.hitches[hitchId]!;
  const previous = hitchId > 0 ? dataset.hitches[hitchId - 1]! : null;
  const covered = daysCovered(current, dataset.dataThrough);
  const now = totals(recordsInHitch(dataset, current.id));
  const then = previous ? totals(recordsInHitch(dataset, previous.id, covered)) : null;

  const backlogRows = dataset.records.filter(awaitingUpload);
  const oldest = backlogRows.reduce<ISODate | null>((min, r) => (r.date && (!min || r.date < min) ? r.date : min), null);

  // Off-hitch rows since the start of the previous hitch (recent, not all year).
  const since = previous?.start ?? current.start;
  const offHitchRows = dataset.records.filter((r) => r.date && r.date >= since && r.hitchId === null).length;

  return {
    current,
    previous,
    daysCovered: covered,
    now,
    then,
    backlog: {
      rows: backlogRows.length,
      poles: backlogRows.reduce((n, r) => n + (r.poles ?? 0), 0),
      oldest,
      thisHitch: backlogRows.filter((r) => r.hitchId === current.id).length,
    },
    offHitchRows,
  };
}

/** The hitch the Command Center shows: the current one, or the last that has started. */
export function focusHitch(dataset: Dataset, today: ISODate): Hitch | null {
  const day = dayNumber(today);
  return dataset.hitches.findLast((h) => dayNumber(h.start) <= day) ?? null;
}
