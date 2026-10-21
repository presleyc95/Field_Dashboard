import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compact } from "@/lib/format";
import { CHART } from "@/theme/chart";
import { TooltipCard } from "./ChartTooltip";

export type Column = {
  key: string | number;
  label: string;
  value: number;
  /** Drawn in the accent; the rest are muted. With no highlights, every column is accent. */
  highlight?: boolean;
  /** Extra line in the tooltip. */
  note?: string;
};

type ColumnChartProps = {
  data: Column[];
  valueLabel: string;
  format?: (n: number) => string;
  height?: number;
  onSelect?: (column: Column) => void;
};

/** Single-series column chart: 24px max columns, 4px rounded tops, hairline grid, hover tooltip. */
export function ColumnChart({ data, valueLabel, format = compact, height = 220, onSelect }: ColumnChartProps) {
  const anyHighlight = data.some((d) => d.highlight);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barCategoryGap="25%">
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: CHART.axis }}
            tick={{ fill: CHART.tick, fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: CHART.tick, fontSize: 11 }}
            tickFormatter={compact}
            width={44}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as Column | undefined;
              if (!active || !d) return null;
              return (
                <TooltipCard
                  title={d.label}
                  rows={[{ color: d.highlight || !anyHighlight ? CHART.accent : CHART.muted, label: valueLabel, value: format(d.value) }]}
                  footer={d.note}
                />
              );
            }}
          />
          <Bar
            dataKey="value"
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            cursor={onSelect ? "pointer" : undefined}
            onClick={onSelect ? (entry) => onSelect(entry.payload as Column) : undefined}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={d.highlight || !anyHighlight ? CHART.accent : CHART.muted} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
