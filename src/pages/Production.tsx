import { X } from "lucide-react";
import { type MouseEvent, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { opcoPath, permitPath, personPath } from "@/app/paths";
import { BarList } from "@/components/charts/BarList";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { KpiCard } from "@/components/KpiCard";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { type Column, Table } from "@/components/Table";
import { formatShort } from "@/data/dates";
import { type Group, type GroupBy, groupRecords, recordsBetween, recordsInHitch, totals } from "@/data/metrics";
import type { Dataset, Hitch, TrackerRecord } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatInt, formatNumber, formatRate, hitchRange } from "@/lib/format";
import { useFocusHitch, useHitchSummaries } from "@/state/metrics";
import { useTracker } from "@/state/tracker";

const GROUPS: { by: GroupBy; label: string }[] = [
  { by: "opco", label: "OPCO" },
  { by: "umbrella", label: "Umbrella" },
  { by: "team", label: "Team" },
  { by: "person", label: "Person" },
  { by: "task", label: "Task" },
];

type Scope = { key: string; label: string; records: TrackerRecord[] };

const ROWS_PAGE = 100;

export function Production() {
  const dataset = useTracker((s) => s.dataset);
  const summaries = useHitchSummaries();
  const focus = useFocusHitch();
  const [params, setParams] = useSearchParams();

  const scopeKey = params.get("scope") ?? (focus ? `h:${focus.id}` : "ytd");
  const by = (GROUPS.find((g) => g.by === params.get("by"))?.by ?? "opco") as GroupBy;
  const selected = params.get("g");

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const scope = useMemo(() => (dataset && focus ? resolveScope(dataset, scopeKey, focus) : null), [dataset, scopeKey, focus]);
  const groups = useMemo(() => (scope ? groupRecords(scope.records, by) : []), [scope, by]);
  const scopeTotals = useMemo(() => (scope ? totals(scope.records) : null), [scope]);

  if (!dataset || !summaries || !scope || !scopeTotals) {
    return (
      <Panel title="Production">
        <ConnectionPrompt />
      </Panel>
    );
  }

  const selectedGroup = selected ? groups.find((g) => g.key === selected) : undefined;
  const pastHitches = summaries.filter((s) => s.rows > 0 && s.state !== "upcoming").reverse();
  const shareBase = by === "person" ? scopeTotals.creditedPoles : scopeTotals.poles;

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="label-caps">Period</span>
            <select
              value={scopeKey}
              onChange={(e) => update({ scope: e.target.value, g: null })}
              className="rounded border border-line bg-canvas px-3 py-2 text-sm text-fg focus:border-accent"
            >
              <optgroup label="Ranges">
                <option value="last4">Last 4 hitches</option>
                <option value="ytd">Year to date</option>
                <option value="all">All data</option>
              </optgroup>
              <optgroup label="Hitches">
                {pastHitches.map((s) => (
                  <option key={s.hitch.id} value={`h:${s.hitch.id}`}>
                    {hitchRange(s.hitch)}
                    {s.state === "current" ? " (current)" : ""}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <div className="flex flex-col gap-1">
            <span className="label-caps">Group by</span>
            <div className="flex rounded border border-line p-0.5" role="radiogroup" aria-label="Group by">
              {GROUPS.map((g) => (
                <button
                  key={g.by}
                  type="button"
                  role="radio"
                  aria-checked={by === g.by}
                  onClick={() => update({ by: g.by, g: null })}
                  className={cn(
                    "rounded px-3 py-1.5 text-xs font-medium uppercase tracking-wider",
                    by === g.by ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ml-auto text-right text-xs text-fg-subtle">{scope.label}</div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Poles" value={formatInt(scopeTotals.poles)} footnote={`${formatInt(scopeTotals.rows)} rows`} />
        <KpiCard label="Poles / tech-day" value={formatRate(scopeTotals.polesPerTechDay)} footnote={`${formatInt(scopeTotals.techDays)} tech-days`} />
        <KpiCard label="Poles / hour" value={formatRate(scopeTotals.polesPerHour)} footnote="Hours on permit" />
        <KpiCard label="Teams" value={formatInt(scopeTotals.teams)} footnote={`${formatInt(scopeTotals.people)} people`} />
        <KpiCard label="Permits" value={formatInt(scopeTotals.permits)} />
        <KpiCard
          label="Drive share"
          value={`${scopeTotals.permitHours + scopeTotals.driveHours ? Math.round((scopeTotals.driveHours / (scopeTotals.permitHours + scopeTotals.driveHours)) * 100) : 0}%`}
          footnote={`${formatInt(Math.round(scopeTotals.driveHours))} drive hours`}
        />
      </div>

      <Panel
        title={`Top ${Math.min(10, groups.length)} by poles`}
        actions={<span className="text-xs text-fg-subtle">Click one to see its rows</span>}
      >
        <BarList
          format={formatInt}
          showDetail
          items={groups.slice(0, 10).map((g) => ({
            key: g.key,
            label: g.key,
            value: g.poles,
            detail: `${formatRate(g.polesPerTechDay)} / tech-day`,
            selected: g.key === selected,
            onClick: () => update({ g: g.key === selected ? null : g.key }),
          }))}
        />
      </Panel>

      {selectedGroup && (
        <RowsPanel dataset={dataset} group={selectedGroup} onClose={() => update({ g: null })} />
      )}

      <Panel
        title={`${GROUPS.find((g) => g.by === by)!.label} · ${groups.length}`}
        actions={
          by === "person" && <span className="text-xs text-fg-subtle">Pairs both get credit, so shares add up to over 100%</span>
        }
      >
        <Table
          columns={groupColumns(by, shareBase)}
          rows={groups}
          rowKey={(g) => g.key}
          onRowClick={(g) => update({ g: g.key === selected ? null : g.key })}
          rowClassName={(g) => (g.key === selected ? "bg-accent/10" : undefined)}
        />
      </Panel>
    </div>
  );
}

function resolveScope(dataset: Dataset, key: string, focus: Hitch): Scope {
  if (key.startsWith("h:")) {
    const hitch = dataset.hitches[Number(key.slice(2))];
    if (hitch) return { key, label: `Hitch ${hitchRange(hitch)}`, records: recordsInHitch(dataset, hitch.id) };
  }
  if (key === "last4") {
    const first = dataset.hitches[Math.max(0, focus.id - 3)]!;
    return {
      key,
      label: `${hitchRange(first)} to ${formatShort(focus.end, true)} (4 hitches)`,
      records: dataset.records.filter((r) => r.hitchId !== null && r.hitchId >= first.id && r.hitchId <= focus.id),
    };
  }
  if (key === "all") return { key, label: "Every row in the tracker", records: dataset.records };
  const year = (dataset.dataThrough ?? dataset.today).slice(0, 4);
  return {
    key: "ytd",
    label: `Jan 1 – ${dataset.dataThrough ? formatShort(dataset.dataThrough, true) : "today"}`,
    records: recordsBetween(dataset, `${year}-01-01`, `${year}-12-31`),
  };
}

function groupColumns(by: GroupBy, shareBase: number): Column<Group>[] {
  return [
    { header: "Name", cell: (g) => <GroupLink by={by} name={g.key} /> },
    { header: "Poles", cell: (g) => formatInt(g.poles), numeric: true },
    {
      header: "Share",
      cell: (g) => (
        <span className="inline-flex items-center justify-end gap-2">
          <span className="hidden h-1.5 w-16 overflow-hidden rounded-sm bg-raised md:inline-block">
            <span className="block h-full bg-accent" style={{ width: `${shareBase ? Math.min(100, (g.poles / shareBase) * 100) : 0}%` }} />
          </span>
          {shareBase ? `${((g.poles / shareBase) * 100).toFixed(1)}%` : "—"}
        </span>
      ),
      numeric: true,
    },
    { header: "Tech-days", cell: (g) => formatInt(g.techDays), numeric: true },
    { header: "Poles / tech-day", cell: (g) => formatRate(g.polesPerTechDay), numeric: true },
    { header: "Hours", cell: (g) => formatInt(Math.round(g.permitHours)), numeric: true },
    { header: "Poles / hour", cell: (g) => formatRate(g.polesPerHour), numeric: true },
    { header: "Drive hrs", cell: (g) => formatInt(Math.round(g.driveHours)), numeric: true },
  ];
}

function GroupLink({ by, name }: { by: GroupBy; name: string }) {
  const stop = (e: MouseEvent) => e.stopPropagation();
  if (by === "person") {
    return (
      <Link to={personPath(name)} onClick={stop} className="whitespace-nowrap text-fg hover:text-accent">
        {name}
      </Link>
    );
  }
  if (by === "opco") {
    return (
      <Link to={opcoPath(name)} onClick={stop} className="whitespace-nowrap text-fg hover:text-accent">
        {name}
      </Link>
    );
  }
  return <span className="whitespace-nowrap text-fg">{name}</span>;
}

function RowsPanel({ dataset, group, onClose }: { dataset: Dataset; group: Group; onClose: () => void }) {
  const [limit, setLimit] = useState(ROWS_PAGE);
  const rows = useMemo(
    () =>
      group.recordIds
        .map((id) => dataset.records[id]!)
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.excelRow - a.excelRow),
    [dataset, group],
  );

  return (
    <Panel
      title={`Rows behind "${group.key}" · ${formatInt(rows.length)}`}
      actions={
        <button type="button" onClick={onClose} aria-label="Close rows" className="text-fg-subtle hover:text-accent">
          <X size={16} />
        </button>
      }
    >
      <Table columns={ROW_COLUMNS} rows={rows.slice(0, limit)} rowKey={(r) => r.id} />
      {rows.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + ROWS_PAGE)}
          className="mt-3 w-full rounded border border-line py-2 text-xs uppercase tracking-wider text-fg-muted hover:border-accent hover:text-accent"
        >
          Show {Math.min(ROWS_PAGE, rows.length - limit)} more
        </button>
      )}
    </Panel>
  );
}

const ROW_COLUMNS: Column<TrackerRecord>[] = [
  { header: "Date", cell: (r) => (r.date ? formatShort(r.date, true) : "—"), className: "whitespace-nowrap" },
  {
    header: "Permit",
    cell: (r) =>
      r.permitKey && r.permitId ? (
        <Link to={permitPath(r.permitId)} className="text-fg hover:text-accent">
          {r.permitId}
        </Link>
      ) : (
        <span className="text-fg-subtle">{r.permitId ?? "—"}</span>
      ),
  },
  { header: "OPCO", cell: (r) => r.opco ?? "—", className: "whitespace-nowrap" },
  { header: "Team", cell: (r) => (r.partner ? `${r.tech} + ${r.partner}` : (r.tech ?? "—")), className: "whitespace-nowrap" },
  { header: "Task", cell: (r) => r.task ?? "—", className: "whitespace-nowrap" },
  { header: "Status", cell: (r) => <StatusBadge status={r.status} short /> },
  { header: "Poles", cell: (r) => formatNumber(r.poles), numeric: true },
  { header: "Hours", cell: (r) => formatNumber(r.hoursOnPermit), numeric: true },
  { header: "Row", cell: (r) => <span className="text-fg-subtle">{r.excelRow}</span>, numeric: true },
];
