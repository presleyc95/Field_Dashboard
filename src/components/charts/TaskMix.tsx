import { useState } from "react";
import type { Group } from "@/data/metrics";
import { formatInt } from "@/lib/format";
import { CATEGORICAL, OTHER_COLOR } from "@/theme/chart";

/** Each production task keeps the same color everywhere; everything else is "Other". */
const TASK_ORDER = ["KATAPULT", "PCI", "GO BACKS", "POWER PCI", "STAKING"] as const;
const TASK_COLOR: Record<string, string> = Object.fromEntries(TASK_ORDER.map((t, i) => [t, CATEGORICAL[i]!]));

type Segment = { label: string; poles: number; color: string };

/** One stacked bar of poles by task, 2px gaps between segments, legend with values below. */
export function TaskMix({ groups }: { groups: Group[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const segments: Segment[] = TASK_ORDER.map((task) => ({
    label: task,
    poles: groups.find((g) => g.key === task)?.poles ?? 0,
    color: TASK_COLOR[task]!,
  }));
  const other = groups.filter((g) => !TASK_COLOR[g.key]).reduce((n, g) => n + g.poles, 0);
  if (other > 0) segments.push({ label: "Other", poles: other, color: OTHER_COLOR });
  const shown = segments.filter((s) => s.poles > 0);
  const total = shown.reduce((n, s) => n + s.poles, 0);

  if (total === 0) return <p className="text-xs uppercase tracking-wider text-fg-subtle">No poles</p>;

  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded" role="img" aria-label="Poles by task">
        {shown.map((s) => (
          <div
            key={s.label}
            className="h-full transition-opacity"
            style={{ width: `${(s.poles / total) * 100}%`, background: s.color, opacity: hover && hover !== s.label ? 0.35 : 1 }}
            title={`${s.label}: ${formatInt(s.poles)} poles (${Math.round((s.poles / total) * 100)}%)`}
            onMouseEnter={() => setHover(s.label)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-xs">
        {shown.map((s) => (
          <li
            key={s.label}
            className="flex items-center gap-2"
            onMouseEnter={() => setHover(s.label)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
            <span className="flex-1 truncate text-fg-muted">{s.label}</span>
            <span className="tabular-nums text-fg">{formatInt(s.poles)}</span>
            <span className="w-9 text-right tabular-nums text-fg-subtle">{Math.round((s.poles / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
