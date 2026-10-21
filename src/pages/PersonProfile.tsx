import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { hitchPath, opcoPath, permitPath, personPath } from "@/app/paths";
import { BarList } from "@/components/charts/BarList";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { TaskMix } from "@/components/charts/TaskMix";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { KpiCard } from "@/components/KpiCard";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { type Column, Table } from "@/components/Table";
import { formatShort } from "@/data/dates";
import { buildProfile } from "@/data/people";
import { type PersonDay, personDays } from "@/data/reports";
import type { Dataset, TrackerRecord } from "@/data/types";
import { formatInt, formatNumber, formatRate, hitchRange } from "@/lib/format";
import { useTracker } from "@/state/tracker";

const RECENT = 25;

export function PersonProfile() {
  const { name = "" } = useParams();
  const navigate = useNavigate();
  const dataset = useTracker((s) => s.dataset);
  const person = useMemo(() => dataset?.people.find((p) => p.name.toLowerCase() === name.toLowerCase()), [dataset, name]);
  const profile = useMemo(() => (dataset && person ? buildProfile(dataset, person) : null), [dataset, person]);
  const [limit, setLimit] = useState(RECENT);

  if (!dataset) {
    return (
      <Panel title="Person">
        <ConnectionPrompt />
      </Panel>
    );
  }
  if (!profile) {
    return (
      <Panel title="Person not found">
        <p className="text-sm text-fg-muted">
          No one named "{name}" in the tracker.{" "}
          <Link to="/people" className="text-accent hover:underline">
            See everyone
          </Link>
        </p>
      </Panel>
    );
  }

  const p = profile;
  const recent = [...p.records].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.excelRow - a.excelRow);
  const recentHitches = p.byHitch.slice(-12);

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
            <div className="label-caps">Field tech</div>
            <h1 className="mt-1 text-2xl font-bold text-fg">{p.person.name}</h1>
            <div className="mt-1 text-xs text-fg-subtle">
              {p.person.firstDate && p.person.lastDate
                ? `Worked ${formatShort(p.person.firstDate, true)} – ${formatShort(p.person.lastDate, true)}`
                : "No dates"}
              {p.offHitchDays > 0 && ` · ${p.offHitchDays} off-hitch days`}
            </div>
          </div>
          <div className="text-right text-xs text-fg-muted">
            <div>
              {formatInt(p.person.rowsAsLogger)} rows logged · {formatInt(p.person.rowsAsPartner)} as partner
            </div>
            <div className="text-fg-subtle">{formatInt(p.person.rowsSolo)} of the logged rows were solo</div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Poles" value={formatInt(p.totals.poles)} footnote="Rows they were on" />
        <KpiCard label="Poles / tech-day" value={formatRate(p.totals.polesPerTechDay)} footnote={`${formatInt(p.totals.techDays)} tech-days`} />
        <KpiCard label="Hitches worked" value={formatInt(p.hitchesWorked)} />
        <KpiCard
          label="Most worked"
          value={p.mostWorkedOpco?.name ?? "—"}
          footnote={p.mostWorkedOpco ? `${formatInt(p.mostWorkedOpco.techDays)} tech-days` : undefined}
        />
        <KpiCard
          label="Best hitch"
          value={p.bestHitch ? formatInt(p.bestHitch.poles) : "—"}
          footnote={p.bestHitch ? hitchRange(p.bestHitch.hitch) : undefined}
        />
        <KpiCard
          label="Consistency"
          value={p.consistency.label}
          footnote={
            p.consistency.cv === null
              ? `${p.consistency.days} production days`
              : `Avg ${formatRate(p.consistency.mean)} poles/day · spread ${Math.round(p.consistency.cv * 100)}%`
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Poles per hitch" className="xl:col-span-2" actions={<span className="text-xs text-fg-subtle">Last {recentHitches.length} hitches worked</span>}>
          <ColumnChart
            valueLabel="Poles"
            data={recentHitches.map((h) => ({
              key: h.hitch.id,
              label: formatShort(h.hitch.start),
              value: h.poles,
              highlight: h.hitch.id === p.bestHitch?.hitch.id,
              note: `${formatRate(h.polesPerTechDay)} poles / tech-day · ${h.techDays} days`,
            }))}
            onSelect={(c) => navigate(hitchPath(Number(c.key)))}
          />
          <p className="mt-2 text-xs text-fg-subtle">Their best hitch is highlighted. Click a bar to open that hitch.</p>
        </Panel>
        <Panel title="Poles by task">
          <TaskMix groups={p.tasks} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="OPCOs" actions={<span className="text-xs text-fg-subtle">Poles</span>}>
          <BarList
            format={formatInt}
            showDetail
            items={p.opcos.slice(0, 10).map((o) => ({
              key: o.key,
              label: o.key,
              value: o.poles,
              detail: `${formatInt(o.techDays)} tech-days`,
              to: opcoPath(o.key),
            }))}
          />
        </Panel>
        <Panel title="Worked with" actions={<span className="text-xs text-fg-subtle">Days together</span>}>
          {p.partners.length === 0 ? (
            <p className="text-xs uppercase tracking-wider text-fg-subtle">Always solo</p>
          ) : (
            <BarList
              format={formatInt}
              showDetail
              color="var(--color-fg-muted)"
              items={p.partners.slice(0, 10).map((x) => ({
                key: x.name,
                label: x.name,
                value: x.days,
                detail: `${formatInt(x.poles)} poles`,
                to: personPath(x.name),
              }))}
            />
          )}
        </Panel>
      </div>

      <ByDay dataset={dataset} name={p.person.name} records={p.records} />

      <Panel title={`Rows · ${formatInt(recent.length)}`} actions={<span className="text-xs text-fg-subtle">Newest first</span>}>
        <Table columns={rowColumns(p.person.name)} rows={recent.slice(0, limit)} exportRows={recent} rowKey={(r) => r.id} exportName={`${p.person.name} rows`} />
        {recent.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((l) => l + 50)}
            className="mt-3 w-full rounded border border-line py-2 text-xs uppercase tracking-wider text-fg-muted hover:border-accent hover:text-accent"
          >
            Show {Math.min(50, recent.length - limit)} more
          </button>
        )}
      </Panel>
    </div>
  );
}

const DAYS_PAGE = 30;

/** Their production day by day, for one hitch or every day they worked. */
function ByDay({ dataset, name, records }: { dataset: Dataset; name: string; records: TrackerRecord[] }) {
  const days = useMemo(() => personDays(records, name), [records, name]);
  const hitchIds = useMemo(() => [...new Set(days.map((d) => d.hitchId).filter((id): id is number => id !== null))], [days]);
  const [hitch, setHitch] = useState("all");
  const [limit, setLimit] = useState(DAYS_PAGE);
  const shown = hitch === "all" ? days : days.filter((d) => String(d.hitchId) === hitch);
  const chart = shown.slice(0, 30).reverse();

  return (
    <Panel
      title={`Production by day · ${formatInt(shown.length)} days`}
      actions={
        <select
          value={hitch}
          onChange={(e) => {
            setHitch(e.target.value);
            setLimit(DAYS_PAGE);
          }}
          aria-label="Hitch"
          className="h-8 rounded border border-line bg-canvas px-2 text-xs text-fg focus:border-accent"
        >
          <option value="all">All days</option>
          {hitchIds.map((id) => (
            <option key={id} value={id}>
              Hitch {hitchRange(dataset.hitches[id]!)}
            </option>
          ))}
        </select>
      }
    >
      <ColumnChart
        valueLabel="Poles"
        height={160}
        data={chart.map((d) => ({
          key: d.date,
          label: formatShort(d.date),
          value: d.poles,
          note: [d.partners.length ? `with ${d.partners.join(", ")}` : "solo", d.opcos.join(", ")].filter(Boolean).join(" · "),
        }))}
      />
      {hitch === "all" && shown.length > 30 && <p className="mt-2 text-xs text-fg-subtle">Chart shows the last 30 days worked.</p>}
      <div className="mt-4">
        <Table columns={DAY_COLUMNS} rows={shown.slice(0, limit)} exportRows={shown} rowKey={(d) => d.date} exportName={`${name} by day`} />
      </div>
      {shown.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + DAYS_PAGE)}
          className="mt-3 w-full rounded border border-line py-2 text-xs uppercase tracking-wider text-fg-muted hover:border-accent hover:text-accent"
        >
          Show {Math.min(DAYS_PAGE, shown.length - limit)} more
        </button>
      )}
    </Panel>
  );
}

const DAY_COLUMNS: Column<PersonDay>[] = [
  { header: "Date", cell: (d) => formatShort(d.date, true), exportValue: (d) => d.date, className: "whitespace-nowrap" },
  { header: "Hitch day", cell: (d) => (d.hitchDay ? `D${d.hitchDay}` : <span className="text-fg-subtle">Off</span>), exportValue: (d) => d.hitchDay },
  {
    header: "With",
    cell: (d) =>
      d.partners.length ? (
        <span className="whitespace-nowrap">
          {d.partners.map((x, i) => (
            <span key={x}>
              {i > 0 && ", "}
              <Link to={personPath(x)} className="text-fg-soft hover:text-accent">
                {x}
              </Link>
            </span>
          ))}
        </span>
      ) : (
        <span className="text-fg-subtle">Solo</span>
      ),
  },
  { header: "OPCO", cell: (d) => d.opcos.join(", ") || "—" },
  {
    header: "Permits",
    cell: (d) =>
      d.permits.length ? (
        <span title={d.permits.join(", ")}>
          {d.permits.slice(0, 2).map((id, i) => (
            <span key={id}>
              {i > 0 && ", "}
              <Link to={permitPath(id)} className="text-fg hover:text-accent">
                {id}
              </Link>
            </span>
          ))}
          {d.permits.length > 2 && <span className="text-fg-subtle"> +{d.permits.length - 2} more</span>}
        </span>
      ) : (
        "—"
      ),
    exportValue: (d) => d.permits.join(", "),
    className: "max-w-xs",
  },
  { header: "Tasks", cell: (d) => d.tasks.join(", ") || "—" },
  { header: "Poles", cell: (d) => (d.production ? formatInt(d.poles) : <span className="text-fg-subtle">—</span>), exportValue: (d) => d.poles, numeric: true },
  { header: "Hours", cell: (d) => formatNumber(Math.round(d.permitHours * 10) / 10), numeric: true },
  { header: "Drive", cell: (d) => formatNumber(Math.round(d.driveHours * 10) / 10), numeric: true },
  { header: "Miles", cell: (d) => formatInt(Math.round(d.mileage)), numeric: true },
];

function rowColumns(name: string): Column<TrackerRecord>[] {
  return [
    { header: "Date", cell: (r) => (r.date ? formatShort(r.date, true) : "—"), exportValue: (r) => r.date, className: "whitespace-nowrap" },
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
    {
      header: "With",
      cell: (r) => {
        const other = r.tech === name ? r.partner : r.tech;
        return other ? (
          <Link to={personPath(other)} className="whitespace-nowrap text-fg-soft hover:text-accent">
            {other}
          </Link>
        ) : (
          <span className="text-fg-subtle">Solo</span>
        );
      },
    },
    { header: "Task", cell: (r) => r.task ?? "—", className: "whitespace-nowrap" },
    { header: "Status", cell: (r) => <StatusBadge status={r.status} short /> },
    { header: "Poles", cell: (r) => formatNumber(r.poles), numeric: true },
    { header: "Hours", cell: (r) => formatNumber(r.hoursOnPermit), numeric: true },
  ];
}
