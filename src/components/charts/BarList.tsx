import { Link } from "react-router";
import { cn } from "@/lib/cn";

export type BarListItem = {
  key: string;
  label: string;
  value: number;
  /** Shown right of the value, e.g. "79.9 / tech-day". */
  detail?: string;
  to?: string;
  onClick?: () => void;
  selected?: boolean;
};

type BarListProps = {
  items: BarListItem[];
  format: (n: number) => string;
  /** Bar color; one series, so one color. */
  color?: string;
  /** Show each item's detail as a column (for wide panels); otherwise it's in the hover text. */
  showDetail?: boolean;
};

/**
 * Tremor-style ranked bar list: a thin bar behind each label, value at the end. Bars share one
 * scale (the largest value fills the row).
 */
export function BarList({ items, format, color = "var(--color-accent)", showDetail = false }: BarListProps) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-1.5">
      {items.map((item) => {
        const body = (
          <>
            <div className="relative min-w-0 flex-1">
              <div
                className="absolute inset-y-0 left-0 rounded-r opacity-25 transition-opacity group-hover:opacity-40"
                style={{ width: `${(item.value / max) * 100}%`, background: color }}
                aria-hidden
              />
              <div
                className="relative truncate px-2 py-1 text-sm text-fg-soft"
                title={item.detail ? `${item.label} · ${item.detail}` : item.label}
              >
                {item.label}
              </div>
            </div>
            <div className="w-16 shrink-0 text-right text-sm font-medium tabular-nums text-fg">{format(item.value)}</div>
            {item.detail !== undefined && showDetail && (
              <div className="hidden w-36 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-fg-subtle sm:block">
                {item.detail}
              </div>
            )}
          </>
        );
        const className = cn(
          "group flex w-full items-center gap-3 rounded text-left",
          item.selected && "ring-1 ring-accent",
          (item.to || item.onClick) && "hover:bg-raised/50",
        );
        return (
          <li key={item.key}>
            {item.to ? (
              <Link to={item.to} className={className}>
                {body}
              </Link>
            ) : item.onClick ? (
              <button type="button" onClick={item.onClick} className={className}>
                {body}
              </button>
            ) : (
              <div className={className}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
