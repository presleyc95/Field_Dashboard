import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

type KpiCardProps = {
  label: string;
  value: string;
  /** Change vs. the comparison period, as a fraction (0.12 = +12%). Omit when unknown. */
  delta?: number;
  /** What the delta compares against, e.g. "vs. last hitch". */
  deltaLabel?: string;
  /** Set when a rise is bad (e.g. upload backlog), so the colors flip. */
  invert?: boolean;
  footnote?: string;
};

/** Tremor-style KPI card in the cyberpunk theme: caps label, big mono value, delta badge. */
export function KpiCard({ label, value, delta, deltaLabel, invert, footnote }: KpiCardProps) {
  const direction = delta === undefined ? null : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const good = direction === "flat" ? null : (direction === "up") !== Boolean(invert);
  const DeltaIcon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : ArrowRight;

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="label-caps">{label}</div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="text-2xl font-bold text-fg">{value}</span>
        {direction && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium",
              good === null && "bg-raised text-fg-muted",
              good === true && "bg-positive/15 text-positive",
              good === false && "bg-negative/15 text-negative",
            )}
          >
            <DeltaIcon size={12} aria-hidden />
            {formatPercent(delta!)}
          </span>
        )}
      </div>
      {(deltaLabel || footnote) && (
        <div className="mt-1 text-xs text-fg-subtle">{footnote ?? deltaLabel}</div>
      )}
    </div>
  );
}

function formatPercent(fraction: number) {
  const sign = fraction > 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(1)}%`;
}
