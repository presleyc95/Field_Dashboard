import { AlertTriangle, Download, Search as SearchIcon, Wrench, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { permitPath } from "@/app/paths";
import { Button } from "@/components/Button";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { KpiCard } from "@/components/KpiCard";
import { Panel } from "@/components/Panel";
import { type Column, Table } from "@/components/Table";
import { issueType } from "@/data/issueTypes";
import type { DataIssue, Dataset, IssueKind, TrackerRecord } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatInt } from "@/lib/format";
import { useTracker } from "@/state/tracker";

const PAGE = 100;

type Row = DataIssue & { record: TrackerRecord | undefined; year: string };

export function Quality() {
  const dataset = useTracker((s) => s.dataset);
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState("");
  const query = useDeferredValue(text.trim().toLowerCase());
  const [limit, setLimit] = useState(PAGE);

  const current = dataset?.sources.find((s) => s.current)?.name ?? "";
  const kind = (params.get("kind") ?? "flag") as IssueKind | "all";
  const source = params.get("src") ?? current;
  const code = params.get("code");

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
    setLimit(PAGE);
  };

  const rows = useMemo(() => (dataset ? issueRows(dataset) : []), [dataset]);
  // Everything except the problem filter, so the problem list shows what's available.
  const scoped = useMemo(
    () => rows.filter((r) => (kind === "all" || r.kind === kind) && (source === "all" || r.source === source)),
    [rows, kind, source],
  );
  const filtered = useMemo(
    () =>
      scoped.filter(
        (r) =>
          (!code || r.code === code) &&
          (!query ||
            r.message.toLowerCase().includes(query) ||
            r.original.toLowerCase().includes(query) ||
            r.field.toLowerCase().includes(query) ||
            r.record?.permitId?.toLowerCase().includes(query) ||
            r.record?.tech?.toLowerCase().includes(query) ||
            String(r.excelRow) === query),
      ),
    [scoped, code, query],
  );
  const byCode = useMemo(() => {
    const counts = new Map<string, { kind: IssueKind; count: number }>();
    for (const r of scoped) {
      const c = counts.get(r.code);
      if (c) c.count++;
      else counts.set(r.code, { kind: r.kind, count: 1 });
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [scoped]);

  if (!dataset) {
    return (
      <Panel title="Data quality">
        <ConnectionPrompt />
      </Panel>
    );
  }

  const inSource = (k: IssueKind) => rows.filter((r) => r.kind === k && (source === "all" || r.source === source));
  const flags = inSource("flag");
  const fixed = inSource("fixed");
  const flaggedRows = new Set(flags.map((r) => `${r.source}|${r.excelRow}`)).size;
  const sourceLabel = source === "all" ? "all workbooks" : yearLabel(source);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <span className="label-caps">Show</span>
            <Segmented
              value={kind}
              options={[
                { value: "flag", label: "Needs a look" },
                { value: "fixed", label: "Fixed by the dashboard" },
                { value: "all", label: "All" },
              ]}
              onChange={(v) => update({ kind: v, code: null })}
            />
          </div>
          <label className="flex flex-col gap-1">
            <span className="label-caps">Workbook</span>
            <select
              value={source}
              onChange={(e) => update({ src: e.target.value, code: null })}
              className="rounded border border-line bg-canvas px-3 py-2 text-sm text-fg focus:border-accent"
            >
              {[...dataset.sources].reverse().map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                  {s.current ? " (current)" : ""}
                </option>
              ))}
              <option value="all">All workbooks</option>
            </select>
          </label>
          <div className="flex items-center gap-2 rounded border border-line bg-canvas px-2 focus-within:border-accent">
            <SearchIcon size={14} className="text-fg-subtle" />
            <input
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Row, permit, name, value…"
              aria-label="Filter issues"
              className="h-9 w-56 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
              style={{ outline: "none" }}
            />
          </div>
          <div className="ml-auto">
            <Button onClick={() => downloadCsv(filtered, sourceLabel)} disabled={filtered.length === 0}>
              <Download size={16} /> Download list
            </Button>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="Needs a look" value={formatInt(flags.length)} footnote={`In ${sourceLabel}`} />
        <KpiCard label="Rows to check" value={formatInt(flaggedRows)} footnote="Rows with at least one flag" />
        <KpiCard label="Fixed by the dashboard" value={formatInt(fixed.length)} footnote="Read correctly; nothing to do" />
        <KpiCard
          label="Workbooks"
          value={formatInt(dataset.sources.length)}
          footnote={dataset.sources.map((s) => (s.year ? String(s.year) : s.name)).join(" · ")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="By problem" actions={<span className="text-xs text-fg-subtle">Click to filter</span>}>
          {byCode.length === 0 ? (
            <p className="text-xs uppercase tracking-wider text-fg-subtle">Nothing here</p>
          ) : (
            <ul className="space-y-1">
              {byCode.map(([c, { kind: k, count }]) => {
                const t = issueType(c);
                const active = code === c;
                return (
                  <li key={c}>
                    <button
                      type="button"
                      onClick={() => update({ code: active ? null : c })}
                      className={cn(
                        "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-raised/60",
                        active && "bg-accent/10 ring-1 ring-accent",
                      )}
                    >
                      {k === "flag" ? (
                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                      ) : (
                        <Wrench size={14} className="mt-0.5 shrink-0 text-fg-subtle" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-fg-soft">{t.title}</span>
                        <span className="block text-xs text-fg-subtle">{t.help}</span>
                      </span>
                      <span className="text-sm font-bold tabular-nums text-fg">{formatInt(count)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title={`${code ? issueType(code).title : "Issues"} · ${formatInt(filtered.length)}`}
          className="xl:col-span-2"
          actions={
            code && (
              <button type="button" onClick={() => update({ code: null })} className="inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-accent">
                <X size={14} /> Clear problem filter
              </button>
            )
          }
        >
          <Table columns={COLUMNS} rows={filtered.slice(0, limit)} exportRows={filtered} exportName="Data quality issues" rowKey={(r) => `${r.source}|${r.excelRow}|${r.code}|${r.field}|${r.message}`} empty="No issues match" />
          {filtered.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE)}
              className="mt-3 w-full rounded border border-line py-2 text-xs uppercase tracking-wider text-fg-muted hover:border-accent hover:text-accent"
            >
              Show {Math.min(PAGE, filtered.length - limit)} more
            </button>
          )}
        </Panel>
      </div>
    </div>
  );
}

function issueRows(dataset: Dataset): Row[] {
  const byRow = new Map(dataset.records.map((r) => [`${r.source}|${r.excelRow}`, r]));
  const order = new Map(dataset.sources.map((s, i) => [s.name, i]));
  return dataset.issues
    .map((i) => ({ ...i, record: byRow.get(`${i.source}|${i.excelRow}`), year: yearLabel(i.source) }))
    .sort((a, b) => (order.get(b.source) ?? 0) - (order.get(a.source) ?? 0) || a.excelRow - b.excelRow);
}

function yearLabel(source: string): string {
  return /(20\d\d)/.exec(source)?.[1] ?? source;
}

const COLUMNS: Column<Row>[] = [
  { header: "Tracker", cell: (r) => <span className="text-xs text-fg-subtle">{r.year}</span> },
  { header: "Row", cell: (r) => <span className="font-medium text-fg">{r.excelRow}</span>, numeric: true },
  {
    header: "Problem",
    cell: (r) => (
      <span className="flex items-start gap-1.5">
        {r.kind === "flag" ? (
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" />
        ) : (
          <Wrench size={13} className="mt-0.5 shrink-0 text-fg-subtle" />
        )}
        <span>
          <span className="text-fg-soft">{r.message}</span>
          <span className="block text-xs text-fg-subtle">{r.field}</span>
        </span>
      </span>
    ),
  },
  { header: "In the tracker", cell: (r) => <span className="break-all text-xs text-fg-muted">{r.original || "(blank)"}</span> },
  {
    header: "Row details",
    cell: (r) =>
      r.record ? (
        <span className="text-xs">
          {r.record.permitKey && r.record.permitId ? (
            <Link to={permitPath(r.record.permitId)} className="text-fg hover:text-accent">
              {r.record.permitId}
            </Link>
          ) : (
            <span className="text-fg-muted">{r.record.permitId ?? "—"}</span>
          )}
          <span className="block text-fg-subtle">
            {[r.record.date, r.record.tech, r.record.task].filter(Boolean).join(" · ")}
          </span>
        </span>
      ) : (
        <span className="text-xs text-fg-subtle">—</span>
      ),
  },
];

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded border border-line p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-3 py-1.5 text-xs font-medium uppercase tracking-wider",
            value === o.value ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Saves the shown issues as a CSV the admin can open in Excel next to the tracker. */
function downloadCsv(rows: Row[], label: string) {
  const header = ["Workbook", "Row", "Field", "Problem", "What to do", "Value in tracker", "Permit", "Date", "Tech", "Task"];
  const lines = rows.map((r) =>
    [
      r.source,
      r.excelRow,
      r.field,
      r.message,
      issueType(r.code).help,
      r.original,
      r.record?.permitId ?? "",
      r.record?.date ?? "",
      r.record?.tech ?? "",
      r.record?.task ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Tracker data issues - ${label} - ${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
