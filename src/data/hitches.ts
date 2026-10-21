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

export type HitchDates = { start: ISODate; end: ISODate };

/**
 * Builds the hitch list from the Validations dates, continued until it covers `coverUntil`.
 * Entries with an end before their start, or overlapping the previous hitch, are dropped.
 */
export function buildHitches(listed: HitchDates[], coverUntil: ISODate): Hitch[] {
  const sorted = [...listed]
    .filter((h) => dayNumber(h.end) >= dayNumber(h.start))
    .sort((a, b) => dayNumber(a.start) - dayNumber(b.start));

  const hitches: Hitch[] = [];
  for (const h of sorted) {
    const prev = hitches.at(-1);
    if (prev && dayNumber(h.start) <= dayNumber(prev.end)) continue;
    hitches.push(makeHitch(hitches.length, h.start, h.end, false));
  }

  const last = hitches.at(-1);
  const secondLast = hitches.at(-2);
  const cycle = last && secondLast ? daysBetween(secondLast.start, last.start) : DEFAULT_CYCLE_DAYS;
  const length = last ? last.days : DEFAULT_LENGTH_DAYS;
  if (!last) return hitches;

  let start = addDays(last.start, cycle);
  while (dayNumber(start) <= dayNumber(coverUntil)) {
    hitches.push(makeHitch(hitches.length, start, addDays(start, length - 1), true));
    start = addDays(start, cycle);
  }
  return hitches;
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
