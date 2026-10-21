/**
 * Hitch schedule (ARCHITECTURE.md §5). Hitches come from the Validations sheet; past the end of
 * that list the same pattern continues (same length, same gap between starts), so the app
 * doesn't break when the list runs out.
 */
import { addDays, dayNumber, daysBetween } from "./dates";
import type { Hitch, ISODate } from "./types";

/** The pattern used when the Validations list has fewer than two hitches. */
const DEFAULT_CYCLE_DAYS = 14;
const DEFAULT_LENGTH_DAYS = 8;

/** A listed hitch. Older trackers list only start dates (`end` null). */
export type HitchDates = { start: ISODate; end?: ISODate | null };

/**
 * Builds the hitch list from the Validations dates (from one or more years' workbooks),
 * continued until it covers `coverUntil`. A start listed twice is kept once, preferring the entry
 * with an end date; missing ends use the usual hitch length. Entries with an end before their
 * start, or overlapping the previous hitch, are dropped.
 */
export function buildHitches(listed: HitchDates[], coverUntil: ISODate): Hitch[] {
  const length = typicalLength(listed);
  const byStart = new Map<ISODate, ISODate>();
  for (const h of listed) {
    const end = h.end ?? addDays(h.start, length - 1);
    if (dayNumber(end) < dayNumber(h.start)) continue;
    if (!byStart.has(h.start) || h.end) byStart.set(h.start, end);
  }
  const sorted = [...byStart.entries()].sort(([a], [b]) => dayNumber(a) - dayNumber(b));

  const hitches: Hitch[] = [];
  for (const [start, end] of sorted) {
    const prev = hitches.at(-1);
    if (prev && dayNumber(start) <= dayNumber(prev.end)) continue;
    hitches.push(makeHitch(hitches.length, start, end, false));
  }

  const last = hitches.at(-1);
  const secondLast = hitches.at(-2);
  const cycle = last && secondLast ? daysBetween(secondLast.start, last.start) : DEFAULT_CYCLE_DAYS;
  if (!last) return hitches;

  let start = addDays(last.start, cycle);
  while (dayNumber(start) <= dayNumber(coverUntil)) {
    hitches.push(makeHitch(hitches.length, start, addDays(start, last.days - 1), true));
    start = addDays(start, cycle);
  }
  return hitches;
}

/** The most common listed hitch length (days, both ends included), or the default. */
function typicalLength(listed: HitchDates[]): number {
  const counts = new Map<number, number>();
  for (const h of listed) {
    if (!h.end) continue;
    const days = daysBetween(h.start, h.end) + 1;
    if (days > 0) counts.set(days, (counts.get(days) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? DEFAULT_LENGTH_DAYS;
}

function makeHitch(id: number, start: ISODate, end: ISODate, inferred: boolean): Hitch {
  return { id, start, end, days: daysBetween(start, end) + 1, inferred };
}

/** Finds the hitch containing a date, and the day within it. */
export class HitchIndex {
  private byDay = new Map<number, Hitch>();

  constructor(readonly hitches: Hitch[]) {
    for (const h of hitches) {
      for (let d = dayNumber(h.start); d <= dayNumber(h.end); d++) this.byDay.set(d, h);
    }
  }

  find(date: ISODate): { hitch: Hitch; day: number } | null {
    const hitch = this.byDay.get(dayNumber(date));
    return hitch ? { hitch, day: daysBetween(hitch.start, date) + 1 } : null;
  }

  /** The first hitch starting after `date`. */
  next(date: ISODate): Hitch | null {
    const day = dayNumber(date);
    return this.hitches.find((h) => dayNumber(h.start) > day) ?? null;
  }

  /** The last hitch that has started on or before `date`. */
  latestStarted(date: ISODate): Hitch | null {
    const day = dayNumber(date);
    return this.hitches.findLast((h) => dayNumber(h.start) <= day) ?? null;
  }
}

export type HitchStatus =
  | { kind: "on"; hitch: Hitch; day: number }
  | { kind: "off"; previous: Hitch | null; next: Hitch | null };

/** Where `today` falls: inside a hitch (and which day), or between hitches. */
export function hitchStatus(index: HitchIndex, today: ISODate): HitchStatus {
  const found = index.find(today);
  if (found) return { kind: "on", hitch: found.hitch, day: found.day };
  return { kind: "off", previous: index.latestStarted(today), next: index.next(today) };
}
