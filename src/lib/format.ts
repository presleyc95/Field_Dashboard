import { formatShort } from "@/data/dates";
import type { Hitch } from "@/data/types";

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatInt(n: number): string {
  return integer.format(n);
}

const compactFormat = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** 950 / 12.9K / 1.2M, for axis ticks and tight spaces. */
export function compact(n: number): string {
  return compactFormat.format(n);
}

const oneDecimal = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Rates like poles per tech-day: always one decimal. */
export function formatRate(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? "—" : oneDecimal.format(n);
}

const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** Up to two decimals, no trailing zeros (hours, miles). */
export function formatNumber(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : decimal.format(n);
}

/** `Oct 15 – Oct 22` (adds the year when the hitch crosses into a new one). */
export function hitchRange(hitch: Hitch): string {
  const crossesYear = hitch.start.slice(0, 4) !== hitch.end.slice(0, 4);
  return `${formatShort(hitch.start, crossesYear)} – ${formatShort(hitch.end, crossesYear)}`;
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
