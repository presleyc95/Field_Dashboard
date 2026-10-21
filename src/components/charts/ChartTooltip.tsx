import type { ReactNode } from "react";

export type TooltipRow = { color: string; label: string; value: string };

/** Dark tooltip card shared by every chart: a title line, then swatch · label · value rows. */
export function TooltipCard({ title, rows, footer }: { title: ReactNode; rows: TooltipRow[]; footer?: ReactNode }) {
  return (
    <div className="min-w-40 rounded border border-line bg-canvas/95 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-medium uppercase tracking-wider text-fg">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 py-0.5">
          <span className="size-2 shrink-0 rounded-sm" style={{ background: r.color }} aria-hidden />
          <span className="flex-1 text-fg-muted">{r.label}</span>
          <span className="font-medium tabular-nums text-fg">{r.value}</span>
        </div>
      ))}
      {footer && <div className="mt-1 text-fg-subtle">{footer}</div>}
    </div>
  );
}
