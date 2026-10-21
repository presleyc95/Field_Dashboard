import { ChevronLeft, ChevronRight, FileDown } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { personPath } from "@/app/paths";
import { Button } from "@/components/Button";
import { BarList } from "@/components/charts/BarList";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { TaskMix } from "@/components/charts/TaskMix";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { HitchCalendar } from "@/components/HitchCalendar";
import { KpiCard } from "@/components/KpiCard";
import { Panel } from "@/components/Panel";
import { type Column, Table } from "@/components/Table";
import { formatShort } from "@/data/dates";
import { dailyPoles, groupRecords, type Group, type HitchSummary, recordsInHitch } from "@/data/metrics";
import type { Dataset } from "@/data/types";
import { cn } from "@/lib/cn";
import { hitchReport } from "@/data/reports";
import { formatInt, formatNumber, formatRate, hitchRange } from "@/lib/format";
import { downloadHitchReport } from "@/lib/reportPdfs";
import { useFocusHitch, useHitchSummaries } from "@/state/metrics";
import { useTracker } from "@/state/tracker";

export function Hitches() {
  const dataset = useTracker((s) => s.dataset);
  const summaries = useHitchSummaries();
  const focus = useFocusHitch();
  const [params, setParams] = useSearchParams();

  if (!dataset || !summaries) {
    return (
      <Panel title="Hitches">
        <ConnectionPrompt />
      </Panel>
    );
  }

  const requested = Number(params.get("h"));
  const selectedId = Number.isInteger(requested) && params.has("h") && summaries[requested] ? requested : (focus?.id ?? 0);
  const select = (id: number) => setParams({ h: String(id) }, { replace: true });

  // The schedule shows this year's hitches plus what's coming; earlier ones have no data.
  const year = (focus?.start ?? dataset.today).slice(0, 4);
  const schedule = summaries.filter((s) => s.hitch.end >= `${year}-01-01` || s.rows > 0);

  return (
    <div className="space-y-4">
      <HitchDetail dataset={dataset} summary={summaries[selectedId]!} count={summaries.length} onSelect={select} />

      <Panel title="Hitch calendar" actions={<span className="text-xs text-fg-subtle">Click a hitch day to open that hitch</span>}>
        <HitchCalendar dataset={dataset} selectedId={selectedId} onSelect={select} />
      </Panel>

      <Panel title="Hitch schedule" actions={<span className="text-xs text-fg-subtle">Click a hitch to open it</span>}>
        <ColumnChart
          valueLabel="Poles"
          height={160}
          data={schedule
            .filter((s) => s.state !== "upcoming")
            .map((s) => ({
              key: s.hitch.id,
              label: formatShort(s.hitch.start),
              value: s.poles,
              highlight: s.hitch.id === selectedId,
              note: s.daysCovered < s.hitch.days ? `${s.daysCovered} of ${s.hitch.days} days so far` : undefined,
            }))}
          onSelect={(c) => select(Number(c.key))}
        />
        <div className="mt-4">
          <Table
            columns={scheduleColumns(selectedId, select)}
            rows={[...schedule].reverse()}
            rowKey={(s) => s.hitch.id}
            onRowClick={(s) => select(s.hitch.id)}
            rowClassName={(s) => cn(s.hitch.id === selectedId && "bg-accent/10")}
            exportName="Hitch schedule"
          />
        </div>
      </Panel>
    </div>
  );
}

function HitchDetail({
  dataset,
  summary: s,
  count,
  onSelect,
}: {
  dataset: Dataset;
  summary: HitchSummary;
  count: number;
  onSelect: (id: number) => void;
}) {
  const records = useMemo(() => recordsInHitch(dataset, s.hitch.id), [dataset, s.hitch.id]);
  const teams = useMemo(() => groupRecords(records, "team"), [records]);
  const tasks = useMemo(() => groupRecords(records, "task"), [records]);
  const opcos = useMemo(() => groupRecords(records, "opco"), [records]);
  const daily = useMemo(() => dailyPoles(dataset, s.hitch), [dataset, s.hitch]);

  const stateLabel = s.state === "current" ? "Current hitch" : s.state === "upcoming" ? "Upcoming hitch" : "Past hitch";
  const [busy, setBusy] = useState(false);
  const downloadReport = async () => {
    setBusy(true);
    try {
      const state = s.state === "current" ? `in progress, ${s.daysCovered} of ${s.hitch.days} days in` : s.state === "past" ? "complete" : "upcoming";
      await downloadHitchReport(hitchReport(dataset, s.hitch.id), state);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label-caps">
              {stateLabel}
              {s.hitch.inferred && " · continued from the Validations pattern"}
            </div>
            <div className="mt-1 text-2xl font-bold text-fg">{hitchRange(s.hitch)}</div>
            <div className="mt-1 text-xs text-fg-subtle">
              {s.hitch.days} days
              {s.state === "current" && ` · data for ${s.daysCovered} so far`}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {s.rows > 0 && (
              <Button variant="primary" onClick={() => void downloadReport()} disabled={busy} title="Projects, poles and teams for this hitch as a PDF">
                <FileDown size={16} /> {busy ? "Building…" : "Hitch report"}
              </Button>
            )}
            <NavButton disabled={s.hitch.id === 0} onClick={() => onSelect(s.hitch.id - 1)} label="Previous hitch">
              <ChevronLeft size={16} /> Prev
            </NavButton>
            <NavButton disabled={s.hitch.id >= count - 1} onClick={() => onSelect(s.hitch.id + 1)} label="Next hitch">
              Next <ChevronRight size={16} />
            </NavButton>
          </div>
        </div>
      </Panel>

      {s.rows === 0 ? (
        <Panel>
          <p className="text-sm text-fg-muted">
            {s.state === "upcoming" ? "This hitch hasn't started yet." : "No rows were logged in this hitch."}
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Poles" value={formatInt(s.poles)} />
            <KpiCard label="Poles / tech-day" value={formatRate(s.polesPerTechDay)} footnote={`${formatInt(s.techDays)} tech-days`} />
            <KpiCard label="Teams" value={formatInt(s.teams)} footnote={`${formatInt(s.people)} people`} />
            <KpiCard label="Permits worked" value={formatInt(s.permits)} />
            <KpiCard label="Hours on permit" value={formatInt(Math.round(s.permitHours))} footnote={`${formatRate(s.polesPerHour)} poles / hour`} />
            <KpiCard label="Drive hours" value={formatInt(Math.round(s.driveHours))} footnote={`${formatInt(Math.round(s.mileage))} miles`} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel title="Poles by hitch day" className="xl:col-span-2">
              <ColumnChart
                valueLabel="Poles"
                data={daily.map((d) => ({
                  key: d.day,
                  label: `D${d.day} · ${formatShort(d.date)}`,
                  value: d.poles,
                  note: `${formatInt(d.techDays)} tech-days`,
                }))}
              />
            </Panel>
            <Panel title="Poles by task">
              <TaskMix groups={tasks} />
              <div className="mt-6 label-caps">Top OPCOs</div>
              <div className="mt-2">
                <BarList
                  format={formatInt}
                  items={opcos.slice(0, 6).map((o) => ({ key: o.key, label: o.key, value: o.poles }))}
                />
              </div>
            </Panel>
          </div>

          <Panel title={`Teams · ${teams.length}`} actions={<span className="text-xs text-fg-subtle">Who was paired with whom</span>}>
            <Table columns={TEAM_COLUMNS} rows={teams} rowKey={(t) => t.key} exportName={`Teams ${s.hitch.start}`} />
          </Panel>
        </>
      )}
    </>
  );
}

function NavButton({ disabled, onClick, label, children }: { disabled: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded border border-line px-3 py-1.5 text-xs uppercase tracking-wider text-fg-muted hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-line disabled:hover:text-fg-muted"
    >
      {children}
    </button>
  );
}

const TEAM_COLUMNS: Column<Group>[] = [
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
        {!t.key.includes(" + ") && <span className="ml-2 text-xs text-fg-subtle">solo</span>}
      </span>
    ),
  },
  { header: "Poles", cell: (t) => formatInt(t.poles), numeric: true },
  { header: "Days", cell: (t) => formatInt(t.workDays), numeric: true },
  { header: "Poles / day", cell: (t) => formatRate(t.workDays ? t.poles / t.workDays : null), numeric: true },
  { header: "Permits", cell: (t) => formatInt(t.permits), numeric: true },
  { header: "Hours", cell: (t) => formatNumber(Math.round(t.permitHours * 10) / 10), numeric: true },
  { header: "Drive", cell: (t) => formatNumber(Math.round(t.driveHours * 10) / 10), numeric: true },
];

function scheduleColumns(selectedId: number, select: (id: number) => void): Column<HitchSummary>[] {
  return [
    {
      header: "Hitch",
      cell: (s) => (
        <button
          type="button"
          onClick={() => select(s.hitch.id)}
          className={cn("whitespace-nowrap text-left hover:text-accent", s.hitch.id === selectedId ? "text-accent" : "text-fg")}
        >
          {hitchRange(s.hitch)}
        </button>
      ),
    },
    {
      header: "State",
      cell: (s) => (
        <span
          className={cn(
            "text-xs uppercase tracking-wider",
            s.state === "current" ? "text-accent" : s.state === "upcoming" ? "text-fg-subtle" : "text-fg-muted",
          )}
        >
          {s.state === "current" ? `Current · ${s.daysCovered} of ${s.hitch.days} days in` : s.state}
          {s.hitch.inferred && " · pattern"}
        </span>
      ),
    },
    { header: "Poles", cell: (s) => (s.rows ? formatInt(s.poles) : "—"), numeric: true },
    { header: "Tech-days", cell: (s) => (s.rows ? formatInt(s.techDays) : "—"), numeric: true },
    { header: "Poles / tech-day", cell: (s) => formatRate(s.polesPerTechDay), numeric: true },
    { header: "Teams", cell: (s) => (s.rows ? formatInt(s.teams) : "—"), numeric: true },
    { header: "People", cell: (s) => (s.rows ? formatInt(s.people) : "—"), numeric: true },
  ];
}
