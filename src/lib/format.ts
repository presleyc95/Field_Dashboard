import { formatShort } from "@/data/dates";
import type { Hitch } from "@/data/types";

const integer = new Intl.NumberFormat("en-US");

export function formatInt(n: number): string {
  return integer.format(n);
}

/** `Oct 15 – Oct 22` (adds the year when the hitch crosses into a new one). */
export function hitchRange(hitch: Hitch): string {
  const crossesYear = hitch.start.slice(0, 4) !== hitch.end.slice(0, 4);
  return `${formatShort(hitch.start, crossesYear)} – ${formatShort(hitch.end, crossesYear)}`;
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
