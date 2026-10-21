import { AlertTriangle, ArrowLeft, Check, Clock, Wrench } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { hitchPath, opcoPath, personPath } from "@/app/paths";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { type Column, Table } from "@/components/Table";
import { permitKey } from "@/data/clean";
import { formatShort } from "@/data/dates";
import { awaitingUpload } from "@/data/metrics";
import { summarizePermit, type TaskSummary, type TimelineEntry } from "@/data/permitSummary";
import type { Dataset, Hitch, TrackerRecord } from "@/data/types";
import { cn } from "@/lib/cn";
import { formatInt, formatNumber, hitchRange, rowLabel } from "@/lib/format";
import { usePermitsByKey } from "@/state/search";
import { useTracker } from "@/state/tracker";
import { markKey, type PendingMark, useUploads } from "@/state/uploads";

export function Permit() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const dataset = useTracker((s) => s.dataset);
  const permits = usePermitsByKey();
  const permit = permits?.get(permitKey(id));
  const summary = useMemo(() => (dataset && permit ? summarizePermit(dataset, permit) : null), [dataset, permit]);
  const { editMode, pending, toggle } = useUploads();

  if (!dataset) {
    return (
      <Panel title="Permit">
        <ConnectionPrompt />
      </Panel>
    );
  }
  if (!summary) {
    return (
      <Panel title="Permit not found">
        <p className="text-sm text-fg-muted">
          No permit "{id}" in the tracker.{" "}
          <Link to={`/search?q=${encodeURIComponent(id)}`} className="text-accent hover:underline">
            Search for it
          </Link>
        </p>
      </Panel>
    );
  }

  const s = summary;
  const umbrellas = [...new Set(s.records.map((r) => r.umbrella).filter(Boolean))];

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-fg-subtle hover:text-accent"
      >
        <ArrowLeft size={14} /> Back
      </button>

      {/* 1. Summary */}
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="label-caps">Permit</div>
            <h1 className="mt-1 break-all text-2xl font-bold text-fg">{s.permit.id}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {s.permit.opcos.map((o) => (
                <Link key={o} to={opcoPath(o)} className="text-fg-soft hover:text-accent">
                  {o}
                </Link>
              ))}
              {umbrellas.length > 0 && <span className="text-xs text-fg-subtle">{umbrellas.join(", ")} umbrella</span>}
            </div>
          </div>
          <StatusBadge status={s.overall} />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line-subtle pt-4 sm:grid-cols-4">
          <Stat label="First worked" value={s.firstDate ? formatShort(s.firstDate, true) : "—"} />
          <Stat label="Last worked" value={s.lastDate ? formatShort(s.lastDate, true) : "—"} />
          <Stat label="Days open" value={s.daysOpen !== null ? formatInt(s.daysOpen) : "—"} />
          <Stat label="Poles" value={formatInt(s.poles)} accent />
          <Stat label="Hours on permit" value={formatNumber(s.permitHours)} />
          <Stat label="Drive hours" value={formatNumber(s.driveHours)} />
          <Stat label="Mileage" value={formatNumber(s.mileage)} />
          <Stat label="Uploaded" value={s.uploadsTotal ? `${s.uploadsDone} of ${s.uploadsTotal}` : "—"} />
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="label-caps mr-1">People</span>
          {s.people.map((name) => (
            <Link
              key={name}
              to={personPath(name)}
              className="rounded border border-line px-2 py-0.5 text-fg-soft hover:border-accent hover:text-accent"
            >
              {name}
            </Link>
          ))}
        </div>
      </Panel>

      {/* 6. Data-quality flags */}
      {(s.flags.length > 0 || s.issues.length > 0) && (
        <Panel title="Needs a look">
          <ul className="space-y-2 text-sm">
            {s.flags.map((f) => (
              <li key={f.code + f.message} className="flex gap-2 text-warning">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{f.message}</span>
              </li>
            ))}
            {s.issues.map((i, n) => (
              <li key={n} className={cn("flex gap-2", i.kind === "flag" ? "text-warning" : "text-fg-muted")}>
                {i.kind === "flag" ? (
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                ) : (
                  <Wrench size={16} className="mt-0.5 shrink-0" />
                )}
                <span>
                  <span className="text-fg-subtle">Row {rowLabel(i)} · {i.field}:</span> {i.message}
                  {i.kind === "fixed" && <span className="text-fg-subtle"> (fixed in the dashboard)</span>}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* 2. Task cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {s.tasks.map((t) => (
          <TaskCard key={t.task} task={t} />
        ))}
      </div>

      {/* 3. Timeline */}
      <Panel title="Timeline">
        <ol className="relative space-y-0">
          {s.timeline.map((entry, i) => (
            <TimelineItem key={i} entry={entry} hitches={dataset.hitches} />
          ))}
        </ol>
      </Panel>

      {/* 4. All rows */}
      <Panel title={`All rows · ${s.records.length}`}>
        <Table
          columns={editMode ? [markColumn(pending, toggle), ...rowColumns(dataset)] : rowColumns(dataset)}
          rows={s.records}
          rowKey={(r) => r.id}
          rowClassName={(r) => (pending[markKey(r)] ? "bg-accent/10" : undefined)}
        />
      </Panel>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="label-caps truncate">{label}</dt>
      <dd className={cn("mt-1 truncate text-lg font-bold", accent ? "text-accent" : "text-fg")}>{value}</dd>
    </div>
  );
}

function TaskCard({ task: t }: { task: TaskSummary }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-fg">{t.task}</h3>
        <StatusBadge status={t.latestStatus} short />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <Mini label="Poles" value={formatInt(t.poles)} />
        <Mini label="Hours" value={formatNumber(t.permitHours + t.driveHours)} />
        <Mini label="Days" value={formatInt(t.days)} />
      </dl>
      <div className="mt-3 text-xs text-fg-subtle">
        {t.firstDate && t.lastDate
          ? t.firstDate === t.lastDate
            ? formatShort(t.firstDate, true)
            : `${formatShort(t.firstDate, true)} – ${formatShort(t.lastDate, true)}`
          : "No dates"}
      </div>
      <div className="mt-1 truncate text-xs text-fg-muted" title={t.people.join(", ")}>
        {t.people.join(", ") || "—"}
      </div>
      {t.uploadable && (
        <div
          className={cn(
            "mt-3 flex items-center gap-1.5 text-xs",
            t.uploadsTotal === 0 ? "text-fg-subtle" : t.uploadsDone === t.uploadsTotal ? "text-positive" : "text-warning",
          )}
        >
          {t.uploadsTotal > 0 && t.uploadsDone === t.uploadsTotal ? <Check size={14} /> : <Clock size={14} />}
          {t.uploadsTotal === 0
            ? "Nothing complete to upload yet"
            : `${t.uploadsDone} of ${t.uploadsTotal} completed rows uploaded to Katapult`}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-fg-subtle">{label}</dt>
      <dd className="font-bold text-fg">{value}</dd>
    </div>
  );
}

function TimelineItem({ entry, hitches }: { entry: TimelineEntry; hitches: Hitch[] }) {
  if (entry.kind === "gap") {
    return (
      <li className="my-2 flex items-center gap-3 pl-1 text-xs uppercase tracking-wider text-warning">
        <span className="h-px flex-1 border-t border-dashed border-warning/50" />
        {entry.days} days with no field work
        <span className="h-px flex-1 border-t border-dashed border-warning/50" />
      </li>
    );
  }
  const r = entry.record;
  const hitch = r.hitchId !== null ? hitches[r.hitchId] : undefined;
  return (
    <li className="grid grid-cols-[10rem_1fr] gap-4 border-l border-line py-2 pl-4 sm:grid-cols-[11rem_14rem_1fr]">
      <div>
        <div className="text-sm font-bold text-fg">{r.date ? formatShort(r.date, true) : "No date"}</div>
        <div className="text-[11px] uppercase tracking-wider text-fg-subtle">
          {hitch ? (
            <Link to={hitchPath(hitch.id)} className="hover:text-accent">
              {hitchRange(hitch)} · D{r.hitchDay}
            </Link>
          ) : (
            "Off hitch"
          )}
        </div>
      </div>
      <div className="hidden text-sm sm:block">
        <Person name={r.tech} />
        {r.partner && (
          <>
            <span className="text-fg-subtle"> + </span>
            <Person name={r.partner} />
          </>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-fg">{r.task ?? "No task"}</span>
          <StatusBadge status={r.status} short />
          <span className="text-fg-muted">{formatInt(r.poles ?? 0)} poles</span>
          {r.uploaded && <span className="text-xs text-positive">Uploaded</span>}
        </div>
        <div className="text-xs text-fg-subtle sm:hidden">
          {r.tech}
          {r.partner && ` + ${r.partner}`}
        </div>
        {r.notes && <div className="mt-0.5 text-xs text-fg-muted">"{r.notes}"</div>}
      </div>
    </li>
  );
}

function Person({ name }: { name: string | null }) {
  if (!name) return <span className="text-fg-subtle">—</span>;
  return (
    <Link to={personPath(name)} className="text-fg-soft hover:text-accent">
      {name}
    </Link>
  );
}

function rowColumns(dataset: Dataset): Column<TrackerRecord>[] {
  return [
    { header: "Row", cell: (r) => <span className="whitespace-nowrap text-fg-subtle">{rowLabel(r)}</span>, numeric: true },
    { header: "Date", cell: (r) => (r.date ? formatShort(r.date, true) : "—"), className: "whitespace-nowrap" },
    {
      header: "Hitch",
      cell: (r) => {
        const h = r.hitchId !== null ? dataset.hitches[r.hitchId] : undefined;
        return h ? `${formatShort(h.start)} · D${r.hitchDay}` : <span className="text-fg-subtle">Off</span>;
      },
      className: "whitespace-nowrap",
    },
    { header: "OPCO", cell: (r) => r.opco ?? "—", className: "whitespace-nowrap" },
    { header: "Tech", cell: (r) => <Person name={r.tech} />, className: "whitespace-nowrap" },
    { header: "Paired with", cell: (r) => (r.partner ? <Person name={r.partner} /> : <span className="text-fg-subtle">Solo</span>), className: "whitespace-nowrap" },
    { header: "Task", cell: (r) => r.task ?? "—", className: "whitespace-nowrap" },
    { header: "Status", cell: (r) => <StatusBadge status={r.status} short /> },
    { header: "Poles", cell: (r) => formatNumber(r.poles), numeric: true },
    { header: "Hours", cell: (r) => formatNumber(r.hoursOnPermit), numeric: true },
    { header: "Drive", cell: (r) => formatNumber(r.driveHours), numeric: true },
    { header: "Total", cell: (r) => formatNumber(r.totalHours), numeric: true },
    { header: "Miles", cell: (r) => formatNumber(r.mileage), numeric: true },
    {
      header: "Katapult",
      cell: (r) => (r.uploaded ? <span className="text-positive">Yes</span> : <span className="text-fg-subtle">—</span>),
    },
    { header: "Notes", cell: (r) => <span className="text-xs text-fg-muted">{r.notes ?? ""}</span>, className: "min-w-48" },
  ];
}

/** Edit mode: a checkbox on rows waiting for upload, feeding the same tray as the queue. */
function markColumn(pending: Record<string, PendingMark>, toggle: (r: TrackerRecord) => void): Column<TrackerRecord> {
  return {
    header: "Mark",
    cell: (r) =>
      awaitingUpload(r) ? (
        <input
          type="checkbox"
          checked={!!pending[markKey(r)]}
          onChange={() => toggle(r)}
          aria-label={`Mark row ${r.excelRow} uploaded`}
          className="size-4 cursor-pointer accent-[var(--color-accent)]"
        />
      ) : null,
  };
}
