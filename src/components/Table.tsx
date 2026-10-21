import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  /** Right-aligns numbers. */
  numeric?: boolean;
  className?: string;
};

type TableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  empty?: string;
  rowClassName?: (row: T) => string | undefined;
};

/** Compact Tremor-style table: caps header, hairline rows, right-aligned tabular numbers. */
export function Table<T>({ columns, rows, rowKey, empty = "Nothing to show", rowClassName }: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th
                key={c.header}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-fg-muted",
                  c.numeric && "text-right",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-xs uppercase tracking-wider text-fg-subtle">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className={cn("border-b border-line-subtle hover:bg-raised/50", rowClassName?.(row))}>
                {columns.map((c) => (
                  <td
                    key={c.header}
                    className={cn("px-3 py-2 align-top text-fg-soft", c.numeric && "text-right tabular-nums", c.className)}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
