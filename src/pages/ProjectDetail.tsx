import { AlertTriangle, ArrowLeft, Clock } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { hitchPath, opcoPath, permitPath, searchPath, umbrellaPath } from "@/app/paths";
import { BarList } from "@/components/charts/BarList";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { TaskMix } from "@/components/charts/TaskMix";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { KpiCard } from "@/components/KpiCard";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { type Column, Table } from "@/components/Table";
import { formatShort, localToday } from "@/data/dates";
import { awaitingUpload, groupRecords } from "@/data/metrics";
import type { PermitOverall } from "@/data/permitSummary";
import { DUE_SOON_DAYS, findProject, PACE_HITCHES, type ScopeRow, summarizeProject } from "@/data/projects";
import { cn } from "@/lib/cn";
import { formatInt, formatRate, hitchRange } from "@/lib/format";
import { useFocusHitch } from "@/state/metrics";
import { useTracker } from "@/state/tracker";

const STATUSES: { status: PermitOverall; filter: string }[] = [
  { status: "In progress", filter: "progress" },
  { status: "Awaiting upload", filter: "awaiting" },
  { status: "Complete", filter: "complete" },
  { status: "Unknown", filter: "unknown" },
];

export function ProjectDetail({ umbrella = false }: { umbrella?: boolean }) {
  const { opco = "" } = useParams();
  const navigate = useNavigate();
  const dataset = useTracker((s) => s.dataset);
  const focus = useFocusHitch();
  const project = useMemo(() => (dataset ? findProject(dataset, opco, umbrella) : null), [dataset, opco, umbrella]);
  const s = useMemo(
    () => (dataset && project && focus ? summarizeProject(dataset, project, focus, localToday()) : null),
    [dataset, project, focus],
  );

  const perHitch = useMemo(() => {
    if (!dataset || !s || !focus) return [];
    const poles = new Map<number, number>();
    for (const r of s.records) if (r.hitchId !== null) poles.set(r.hitchId, (poles.get(r.hitchId) ?? 0) + (r.poles ?? 0));
    return dataset.hitches.filter((h) => h.id <= focus.id).slice(-12).map((h) => ({
      key: h.id,
      label: formatShort(h.start),
      value: poles.get(h.id) ?? 0,
      highlight: h.id === focus.id,
    }));
  }, [dataset, s, focus]);
  const tasks = useMemo(() => (s ? groupRecords(s.records, "task") : []), [s]);
  const recentTeams = useMemo(() => {
    if (!s || !focus) return [];
    const from = focus.id - PACE_HITCHES;
    return groupRecords(s.records.filter((r) => r.hitchId !== null && r.hitchId >= from), "team").slice(0, 10);
  }, [s, focus]);
  const opcoBreakdown = useMemo(() => (s && project?.isUmbrella ? groupRecords(s.records, "opco") : []), [s, project]);
  const awaiting = useMemo(() => {
    const rows = s ? s.records.filter(awaitingUpload) : [];
    return { rows: rows.length, poles: rows.reduce((n, r) => n + (r.poles ?? 0), 0) };
  }, [s]);

  if (!dataset || !focus) {
    return (
      <Panel title="Project">
        <ConnectionPrompt />
      </Panel>
    );
  }
  if (!project || !s) {
    return (
      <Panel title="Project not found">
        <p className="text-sm text-fg-muted">
          No OPCO or umbrella named "{opco}".{" "}
          <Link to="/projects" className="text-accent hover:underline">
            See all projects
          </Link>
        </p>
      </Panel>
    );
  }

  const filterName = project.name.toLowerCase();
  const overdue = s.scope.filter((r) => r.risk === "overdue").length;
  const dueSoon = s.scope.filter((r) => r.risk === "due-soon").length;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-fg-subtle hover:text-accent"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="label-caps">{project.isUmbrella ? "Umbrella" : "OPCO"}</div>
            <h1 className="mt-1 text-2xl font-bold text-fg">{project.name}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {project.isUmbrella
                ? project.opcos.map((o) => (
                    <Link key={o} to={opcoPath(o)} className="rounded border border-line px-1.5 py-0.5 text-fg-muted hover:border-accent hover:text-accent">
                      {o}
                    </Link>
                  ))
                : (() => {
                    const umbrella = dataset.opcos.find((o) => o.name === project.name)?.umbrella;
                    return umbrella ? (
                      <Link to={umbrellaPath(umbrella)} className="text-fg-subtle hover:text-accent">
                        Part of the {umbrella} umbrella
                      </Link>
                    ) : null;
                  })()}
            </div>
          </div>
          <div className="text-right text-xs text-fg-subtle">Last worked {s.lastWorked ? formatShort(s.lastWorked, true) : "—"}</div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="This hitch" value={formatInt(s.currentPoles)} footnote={hitchRange(focus)} />
        <KpiCard label="Pace / hitch" value={formatInt(s.pace.polesPerHitch)} footnote={`Avg of last ${s.pace.hitchesCounted} hitches`} />
        <KpiCard label="All poles" value={formatInt(s.totals.poles)} footnote={`${formatInt(s.totals.rows)} rows`} />
        <KpiCard label="Poles / tech-day" value={formatRate(s.totals.polesPerTechDay)} />
        <KpiCard label="Permits" value={formatInt(s.totals.permits)} footnote={`${formatInt(s.permitStatus["In progress"])} in progress`} />
        {s.scope.length > 0 ? (
          <KpiCard
            label="Field queue"
            value={formatInt(s.queuePoles)}
            footnote={
              s.projectedFinish
                ? `≈ ${formatRate(s.queueHitches)} hitches · done by ${formatShort(s.projectedFinish, true)}`
                : "No recent pace to project from"
            }
          />
        ) : (
          <KpiCard
            label="Awaiting upload"
            value={formatInt(awaiting.rows)}
            invert
            footnote={`${formatInt(awaiting.poles)} poles not yet in Katapult`}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Poles per hitch" className="xl:col-span-2" actions={<span className="text-xs text-fg-subtle">Current hitch highlighted</span>}>
          <ColumnChart valueLabel="Poles" data={perHitch} onSelect={(c) => navigate(hitchPath(Number(c.key)))} />
        </Panel>
        <Panel title="Permits by status">
          <ul className="space-y-2">
            {STATUSES.map(({ status, filter }) => (
              <li key={status}>
                <Link
                  to={searchPath(`opco:"${filterName}" status:${filter}`)}
                  className="flex items-center justify-between gap-3 rounded px-2 py-1.5 hover:bg-raised/60"
                >
                  <StatusBadge status={status} />
                  <span className="text-lg font-bold tabular-nums text-fg">{formatInt(s.permitStatus[status])}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-5 label-caps">Poles by task</div>
          <div className="mt-2">
            <TaskMix groups={tasks} />
          </div>
        </Panel>
      </div>

      {s.scope.length > 0 && (
        <Panel
          title={`Field queue · ${s.scope.length} items`}
          actions={
            <span className="flex items-center gap-3 text-xs">
              {overdue > 0 && (
                <span className="inline-flex items-center gap-1 text-negative">
                  <AlertTriangle size={14} /> {overdue} overdue
                </span>
              )}
              {dueSoon > 0 && (
                <span className="inline-flex items-center gap-1 text-warning">
                  <Clock size={14} /> {dueSoon} due in {DUE_SOON_DAYS} days
                </span>
              )}
            </span>
          }
        >
          <p className="mb-3 text-xs text-fg-muted">
            {formatInt(s.queuePoles)} poles waiting on {[...new Set(s.scope.map((r) => r.sheet))].join(", ")}.
            {s.queueHitches !== null && s.projectedFinish
              ? ` At ${formatInt(s.pace.polesPerHitch)} poles per hitch that's about ${formatRate(s.queueHitches)} hitches, done by ${formatShort(s.projectedFinish, true)}, if the whole pace went to this queue.`
              : ""}{" "}
            "In tracker" shows poles already logged under the same circuit or work order.
          </p>
          <Table columns={SCOPE_COLUMNS} rows={s.scope} rowKey={(r) => `${r.sheet}:${r.excelRow}`} exportName="Field queue" />
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Top teams" actions={<span className="text-xs text-fg-subtle">Last {PACE_HITCHES + 1} hitches</span>}>
          <BarList
            format={formatInt}
            items={recentTeams.map((t) => ({
              key: t.key,
              label: t.key,
              value: t.poles,
              detail: `${formatRate(t.workDays ? t.poles / t.workDays : null)} / day`,
            }))}
          />
        </Panel>
        {project.isUmbrella && (
          <Panel title="OPCOs in this umbrella" actions={<span className="text-xs text-fg-subtle">Production stays per OPCO</span>}>
            <BarList
              format={formatInt}
              showDetail
              items={opcoBreakdown.map((o) => ({
                key: o.key,
                label: o.key,
                value: o.poles,
                detail: `${formatRate(o.polesPerTechDay)} / tech-day`,
                to: opcoPath(o.key),
              }))}
            />
          </Panel>
        )}
      </div>
    </div>
  );
}

const SCOPE_COLUMNS: Column<ScopeRow>[] = [
  {
    header: "Circuit / work order",
    cell: (r) =>
      r.permit ? (
        <Link to={permitPath(r.permit.id)} className="font-medium text-fg hover:text-accent">
          {r.key}
        </Link>
      ) : (
        <span className="text-fg">{r.key}</span>
      ),
  },
  { header: "Sheet", cell: (r) => <span className="whitespace-nowrap text-xs text-fg-subtle">{r.sheet}</span> },
  { header: "Status", cell: (r) => <span className="whitespace-nowrap text-xs">{r.status ?? "—"}</span> },
  {
    header: "Poles",
    cell: (r) => (
      <>
        {r.poles !== null ? formatInt(r.poles) : "—"}
        {r.goBackPoles ? <span className="text-fg-subtle"> +{formatInt(r.goBackPoles)} GB</span> : null}
      </>
    ),
    numeric: true,
  },
  { header: "Priority", cell: (r) => r.priority ?? "—", numeric: true },
  { header: "Received", cell: (r) => (r.received ? formatShort(r.received, true) : "—"), className: "whitespace-nowrap" },
  {
    header: "Due",
    cell: (r) =>
      r.due ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap",
            r.risk === "overdue" && "text-negative",
            r.risk === "due-soon" && "text-warning",
          )}
        >
          {r.risk === "overdue" && <AlertTriangle size={12} />}
          {r.risk === "due-soon" && <Clock size={12} />}
          {formatShort(r.due, true)}
          <span className="text-xs text-fg-subtle">
            {r.daysUntilDue! < 0 ? `${-r.daysUntilDue!}d late` : `in ${r.daysUntilDue}d`}
          </span>
        </span>
      ) : (
        <span className="text-fg-subtle">—</span>
      ),
  },
  {
    header: "In tracker",
    cell: (r) =>
      r.permit ? (
        <span className="whitespace-nowrap">
          {formatInt(r.collected)} poles
          <span className="text-xs text-fg-subtle"> · {r.lastWorked ? formatShort(r.lastWorked) : "—"}</span>
          {r.poles !== null && r.poles > 0 && r.collected >= r.poles && (
            <span className="ml-2 rounded border border-positive/40 bg-positive/10 px-1 text-[10px] uppercase tracking-wider text-positive" title="The tracker already has at least as many poles as the queue lists; it may only need clearing from the sheet.">
              Looks fielded
            </span>
          )}
        </span>
      ) : (
        <span className="text-fg-subtle">Not worked</span>
      ),
  },
];
