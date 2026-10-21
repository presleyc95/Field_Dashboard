import { ChevronLeft, ChevronRight, FileDown } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { hitchPath, opcoPath, permitPath, personPath } from "@/app/paths";
import { Button } from "@/components/Button";
import { BarList } from "@/components/charts/BarList";
import { TaskMix } from "@/components/charts/TaskMix";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { KpiCard } from "@/components/KpiCard";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { type Column, Table } from "@/components/Table";
import { addDays, localToday } from "@/data/dates";
import { dailyReport, defaultReportDate, type TeamLine } from "@/data/reports";
import type { TrackerRecord } from "@/data/types";
import { formatInt, formatNumber, formatRate, hitchRange, rowLabel } from "@/lib/format";
import { downloadDailyReport, longDate } from "@/lib/reportPdfs";
import { useTracker } from "@/state/tracker";

/** One day's production, by default yesterday's (rows are entered the morning after). */
export function DailyReport() {
  const dataset = useTracker((s) => s.dataset);
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const today = localToday();

  const requested = params.get("d");
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : dataset ? defaultReportDate(dataset, today) : null;
  const report = useMemo(() => (dataset && date ? dailyReport(dataset, date) : null), [dataset, date]);
  const go = (d: string | null) => d && setParams({ d }, { replace: true });

  if (!dataset || !report) {
    return (
      <Panel title="Daily report">
        <ConnectionPrompt />
      </Panel>
    );
  }

  const r = report;
  const t = r.totals;
  const yesterday = addDays(today, -1);
  const vsAvg = r.hitchAverage ? (t.poles - r.hitchAverage) / r.hitchAverage : undefined;
  const records = [...r.records].sort((a, b) => (a.tech ?? "").localeCompare(b.tech ?? "") || a.excelRow - b.excelRow);

  const download = async () => {
    setBusy(true);
    try {
      await downloadDailyReport(r);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label-caps">
              Daily report{r.date === yesterday ? " · yesterday" : ""}
            </div>
            <div className="mt-1 text-2xl font-bold text-fg">{longDate(r.date)}</div>
            <div className="mt-1 text-xs text-fg-subtle">
              {r.hitch ? (
                <>
                  <Link to={hitchPath(r.hitch.id)} className="hover:text-accent">
                    Hitch {hitchRange(r.hitch)}
                  </Link>
                  {r.hitchDay && ` · day ${r.hitchDay} of ${r.hitch.days}`}
                </>
              ) : (
                "Off hitch"
              )}
              {!requested && r.date !== yesterday && " · no rows for yesterday yet, showing the latest day with data"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DayButton disabled={!r.previousDate} onClick={() => go(r.previousDate)} label="Previous day with data">
              <ChevronLeft size={16} /> Prev
            </DayButton>
            <input
              type="date"
              value={r.date}
              max={today}
              onChange={(e) => go(e.target.value)}
              aria-label="Report date"
              className="h-8 rounded border border-line bg-canvas px-2 text-sm text-fg [color-scheme:dark] focus:border-accent"
            />
            <DayButton disabled={!r.nextDate} onClick={() => go(r.nextDate)} label="Next day with data">
              Next <ChevronRight size={16} />
            </DayButton>
            <Button variant="primary" onClick={() => void download()} disabled={busy || t.rows === 0}>
              <FileDown size={16} /> {busy ? "Building…" : "PDF"}
            </Button>
          </div>
        </div>
      </Panel>

      {t.rows === 0 ? (
        <Panel>
          <p className="text-sm text-fg-muted">No rows were logged for this day.</p>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="Poles"
              value={formatInt(t.poles)}
              delta={vsAvg}
              footnote={r.hitchAverage ? `vs. ${formatRate(r.hitchAverage)} / day earlier this hitch` : undefined}
            />
            <KpiCard label="Teams" value={formatInt(t.teams)} footnote={`${formatInt(t.people)} people`} />
            <KpiCard label="Poles / tech-day" value={formatRate(t.polesPerTechDay)} footnote={`${formatInt(t.techDays)} tech-days`} />
            <KpiCard label="Permits worked" value={formatInt(t.permits)} />
            <KpiCard
              label="Rows complete"
              value={formatInt(r.records.filter((x) => x.status === "Complete").length)}
              footnote={`of ${formatInt(t.rows)} rows`}
            />
            <KpiCard label="Hours on permit" value={formatNumber(Math.round(t.permitHours * 10) / 10)} footnote={`${formatNumber(Math.round(t.driveHours * 10) / 10)} drive h · ${formatInt(Math.round(t.mileage))} mi`} />
          </div>

          <Panel title={`Teams · ${r.teams.length}`}>
            <Table columns={TEAM_COLUMNS} rows={r.teams} rowKey={(g) => g.key} exportName={`Daily teams ${r.date}`} />
          </Panel>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="By project" actions={<span className="text-xs text-fg-subtle">Poles</span>}>
              <BarList
                format={formatInt}
                showDetail
                items={r.opcos.map((o) => ({ key: o.key, label: o.key, value: o.poles, detail: `${formatInt(o.permits)} permits`, to: opcoPath(o.key) }))}
              />
            </Panel>
            <Panel title="Poles by task">
              <TaskMix groups={r.tasks} />
            </Panel>
          </div>

          <Panel title={`Rows · ${formatInt(records.length)}`}>
            <Table columns={ROW_COLUMNS} rows={records} rowKey={(x) => x.id} exportName={`Daily rows ${r.date}`} />
          </Panel>
        </>
      )}
    </div>
  );
}

function DayButton({ disabled, onClick, label, children }: { disabled: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1 rounded border border-line px-3 text-xs uppercase tracking-wider text-fg-muted hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-line disabled:hover:text-fg-muted"
    >
      {children}
    </button>
  );
}

const TEAM_COLUMNS: Column<TeamLine>[] = [
  {
    header: "Team",
    cell: (t) => (
      <span className="whitespace-nowrap">
        {t.key.split(" + ").map((name, i) => (
          <span key={name}>
            {i > 0 && <span className="text-fg-subtle"> + </span>}
            <Link to={personPath(name)} className="text-fg hover:text-accent">
              {name}
            </Link>
          </span>
        ))}
      </span>
    ),
  },
  { header: "Projects", cell: (t) => t.opcos.join(", ") || "—" },
  {
    header: "Permits",
    cell: (t) => (
      <span title={t.permitIds.join(", ")}>
        {t.permitIds.slice(0, 2).join(", ") || "—"}
        {t.permitIds.length > 2 && <span className="text-fg-subtle"> +{t.permitIds.length - 2} more</span>}
      </span>
    ),
    exportValue: (t) => t.permitIds.join(", "),
    className: "max-w-xs",
  },
  { header: "Tasks", cell: (t) => t.tasks.join(", ") || "—" },
  { header: "Poles", cell: (t) => formatInt(t.poles), numeric: true },
  { header: "Hours", cell: (t) => formatNumber(Math.round(t.permitHours * 10) / 10), numeric: true },
  { header: "Drive", cell: (t) => formatNumber(Math.round(t.driveHours * 10) / 10), numeric: true },
  { header: "Complete rows", cell: (t) => `${formatInt(t.completed)} / ${formatInt(t.rows)}`, numeric: true },
];

const ROW_COLUMNS: Column<TrackerRecord>[] = [
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
  { header: "Drive", cell: (r) => formatNumber(r.driveHours), numeric: true },
  { header: "Notes", cell: (r) => <span className="text-xs text-fg-muted">{r.notes ?? ""}</span>, className: "max-w-sm" },
  { header: "Row", cell: (r) => <span className="whitespace-nowrap text-fg-subtle">{rowLabel(r)}</span>, numeric: true },
];
