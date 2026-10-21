import { formatShort } from "@/data/dates";
import { cn } from "@/lib/cn";
import { formatInt, hitchRange } from "@/lib/format";
import { useHitchStatus } from "@/state/hooks";
import { useTracker } from "@/state/tracker";

/** Current hitch, day within it, and how fresh the data is. */
export function HitchBanner() {
  const status = useHitchStatus();
  const dataset = useTracker((s) => s.dataset);
  if (!status || !dataset) return null;

  const freshness = (
    <div className="text-right text-xs text-fg-subtle">
      <div className="label-caps">Data through</div>
      <div className="mt-1 text-lg font-bold text-fg">{dataset.dataThrough ? formatShort(dataset.dataThrough, true) : "—"}</div>
      <div>{formatInt(dataset.records.length)} rows</div>
    </div>
  );

  if (status.kind === "off") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="label-caps">Between hitches</div>
          <div className="mt-1 text-xl font-bold text-fg">
            {status.next ? `Next hitch starts ${formatShort(status.next.start)}` : "No upcoming hitch"}
          </div>
          {status.previous && (
            <div className="mt-1 text-xs text-fg-subtle">Last hitch: {hitchRange(status.previous)}</div>
          )}
        </div>
        {freshness}
      </div>
    );
  }

  const { hitch, day } = status;
  return (
    <div className="flex flex-wrap items-center justify-between gap-6">
      <div className="min-w-0 flex-1">
        <div className="label-caps">Current hitch</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-xl font-bold text-fg">{hitchRange(hitch)}</span>
          <span className="text-sm uppercase tracking-wider text-accent">
            Day {day} of {hitch.days}
          </span>
        </div>
        <div className="mt-3 flex max-w-md gap-1" aria-label={`Day ${day} of ${hitch.days}`}>
          {Array.from({ length: hitch.days }, (_, i) => (
            <div
              key={i}
              className={cn("h-1.5 flex-1 rounded-sm", i < day ? "bg-accent" : "bg-raised")}
            />
          ))}
        </div>
        <div className="mt-2 text-xs text-fg-subtle">
          Rows arrive the morning after the work, so today's numbers are a day behind.
        </div>
      </div>
      {freshness}
    </div>
  );
}
