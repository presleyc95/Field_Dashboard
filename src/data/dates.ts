import type { ISODate } from "./types";

const MS_PER_DAY = 86_400_000;
/** Excel's day 0 (serial 1 = 1900-01-01, counting Excel's fake 1900-02-29). */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Days since 1970-01-01 for an ISO date. */
export function dayNumber(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

export function fromDayNumber(day: number): ISODate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(dayNumber(date) + days);
}

/** Days from `start` to `end` (0 when they're the same day). */
export function daysBetween(start: ISODate, end: ISODate): number {
  return dayNumber(end) - dayNumber(start);
}

export function excelSerialToISO(serial: number): ISODate | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  return new Date(EXCEL_EPOCH + Math.floor(serial) * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Parses `M/D/YYYY`, `M/D/YY` or `YYYY-MM-DD` text. */
export function parseDateText(text: string): ISODate | null {
  const t = text.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDate(year, Number(m[1]), Number(m[2]));
  }
  return null;
}

function validDate(y: number, m: number, d: number): ISODate | null {
  const ms = Date.UTC(y, m - 1, d);
  const iso = new Date(ms).toISOString().slice(0, 10);
  return iso === `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` ? iso : null;
}

/** Today's date in the viewer's own time zone. */
export function localToday(now = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `Oct 15` (or `Oct 15, 2026` with `withYear`). */
export function formatShort(date: ISODate, withYear = false): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ""}`;
}
