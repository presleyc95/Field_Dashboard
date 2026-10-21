import { Download } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";
import { downloadWorkbook, type ExportCell, nodeText, toNumber } from "@/lib/exportTable";

export type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  /** Right-aligns numbers. */
  numeric?: boolean;
  className?: string;
  /** Value for the Excel export; by default, the text the cell shows. */
  exportValue?: (row: T) => ExportCell;
  /** Leaves the column out of the export (checkboxes and the like). */
  noExport?: boolean;
};

type TableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  empty?: string;
  rowClassName?: (row: T) => string | undefined;
  /** Makes rows clickable (a link or button in the row stays the keyboard route). */
  onRowClick?: (row: T) => void;
  /** File and sheet name for the Export button. */
  exportName?: string;
  /** Every row to export when `rows` is only the page shown. Defaults to `rows`. */
  exportRows?: T[];
};

/** Compact Tremor-style table: caps header, hairline rows, right-aligned tabular numbers. */
export function Table<T>({ columns, rows, rowKey, empty = "Nothing to show", rowClassName, onRowClick, exportName = "Table", exportRows }: TableProps<T>) {
  const all = exportRows ?? rows;
  return (
    <div>
      {all.length > 0 && (
        <div className="mb-1 flex justify-end">
          <ExportButton name={exportName} columns={columns} rows={all} />
        </div>
      )}
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
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn("border-b border-line-subtle hover:bg-raised/50", onRowClick && "cursor-pointer", rowClassName?.(row))}
                >
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
    </div>
  );
}

/** Saves every row of a table (not just the page shown) as an Excel file. */
export function ExportButton<T>({ name, columns, rows }: { name: string; columns: Column<T>[]; rows: T[] }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const cols = columns.filter((c) => !c.noExport);
      await downloadWorkbook(name, [
        {
          name,
          headers: cols.map((c) => c.header),
          rows: rows.map((row) =>
            cols.map((c) => {
              if (c.exportValue) return c.exportValue(row);
              const text = nodeText(c.cell(row));
              return c.numeric ? toNumber(text) : text || null;
            }),
          ),
        },
      ]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={busy}
      title={`Save all ${rows.length} rows as an Excel file`}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wider text-fg-subtle hover:text-accent disabled:opacity-50"
    >
      <Download size={12} aria-hidden /> {busy ? "Exporting…" : "Export"}
    </button>
  );
}
