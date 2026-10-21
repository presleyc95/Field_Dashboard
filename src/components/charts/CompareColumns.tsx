import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compact, formatInt } from "@/lib/format";
import { CHART } from "@/theme/chart";
import { TooltipCard } from "./ChartTooltip";

export type ComparePoint = { label: string; current: number | null; previous: number | null };

type CompareColumnsProps = {
  data: ComparePoint[];
  currentLabel: string;
  previousLabel: string;
  height?: number;
};

/** Two series side by side (this period in the accent, the last one muted), with a legend. */
export function CompareColumns({ data, currentLabel, previousLabel, height = 220 }: CompareColumnsProps) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-fg-muted">
        <LegendKey color={CHART.accent} label={currentLabel} />
        <LegendKey color={CHART.muted} label={previousLabel} />
      </div>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barGap={2} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: CHART.axis }} tick={{ fill: CHART.tick, fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: CHART.tick, fontSize: 11 }} tickFormatter={compact} width={44} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as ComparePoint | undefined;
                if (!active || !d) return null;
                return (
                  <TooltipCard
                    title={d.label}
                    rows={[
                      { color: CHART.accent, label: currentLabel, value: d.current === null ? "No data yet" : formatInt(d.current) },
                      { color: CHART.muted, label: previousLabel, value: d.previous === null ? "—" : formatInt(d.previous) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="previous" fill={CHART.muted} maxBarSize={20} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="current" fill={CHART.accent} maxBarSize={20} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}
