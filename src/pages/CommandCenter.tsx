import { AlertTriangle, ChevronRight, ClipboardCheck, MapPinOff, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { hitchPath } from "@/app/paths";
import { BarList } from "@/components/charts/BarList";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { CompareColumns } from "@/components/charts/CompareColumns";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { HitchBanner } from "@/components/HitchBanner";
import { KpiCard } from "@/components/KpiCard";
import { Panel } from "@/components/Panel";
import { formatShort } from "@/data/dates";
import { change, commandCenter, dailyPoles, groupRecords, recordsInHitch } from "@/data/metrics";
import type { Dataset, Hitch } from "@/data/types";
import { formatInt, formatRate } from "@/lib/format";
import { useFocusHitch, useHitchSummaries, useStalledPermitCount } from "@/state/metrics";
import { useTracker } from "@/state/tracker";

export function CommandCenter() {
  const dataset = useTracker((s) => s.dataset);
  const ready = useTracker((s) => s.phase === "ready");
  const hitch = useFocusHitch();

  return (
    <div className="space-y-4">
      <Panel>{ready ? <HitchBanner /> : <ConnectionPrompt />}</Panel>
      {dataset && hitch ? <Overview dataset={dataset} hitch={hitch} /> : <EmptyOverview />}
    </div>
  );
}

function Overview({ dataset, hitch }: { dataset: Dataset; hitch: Hitch }) {
  const navigate = useNavigate();
  const summaries = useHitchSummaries();
  const stalled = useStalledPermitCount();
  const stats = useMemo(() => commandCenter(dataset, hitch.id), [dataset, hitch]);
  const teams = useMemo(() => groupRecords(recordsInHitch(dataset, hitch.id), "team").slice(0, 10), [dataset, hitch]);
  const daily = useMemo(() => {
    const now = dailyPoles(dataset, hitch);
    const prev = stats.previous ? dailyPoles(dataset, stats.previous) : [];
    return Array.from({ length: hitch.days }, (_, i) => ({
      label: `D${i + 1}`,
      current: now[i]?.poles ?? null,
      previous: prev[i]?.poles ?? null,
    }));
  }, [dataset, hitch, stats.previous]);

  const { now, then, daysCovered, previous, backlog } = stats;
  const sameDays = previous
    ? `vs. days 1–${daysCovered} of ${formatShort(previous.start)} hitch`
    : "no earlier hitch to compare";
  const current = dataset.sources.find((s) => s.current)?.name;
  const flagged = dataset.issues.filter((i) => i.kind === "flag" && i.source === current).length;

  const recentHitches = (summaries ?? []).filter((s) => s.hitch.id <= hitch.id && s.rows > 0).slice(-12);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Poles this hitch"
          value={formatInt(now.poles)}
          delta={change(now.poles, then?.poles ?? null).delta ?? undefined}
          footnote={sameDays}
        />
        <KpiCard
          label="Poles / tech-day"
          value={formatRate(now.polesPerTechDay)}
          delta={change(now.polesPerTechDay, then?.polesPerTechDay ?? null).delta ?? undefined}
          footnote={`${formatInt(now.techDays)} tech-days · pairs share credit`}
        />
        <KpiCard
          label="Active teams"
          value={formatInt(now.teams)}
          delta={change(now.teams, then?.teams ?? null).delta ?? undefined}
          footnote={`${formatInt(now.people)} people in the field`}
        />
        <KpiCard
          label="Upload backlog"
          value={formatInt(backlog.rows)}
          invert
          footnote={`${formatInt(backlog.poles)} poles · oldest ${backlog.oldest ? formatShort(backlog.oldest, true) : "—"}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          title="Poles per hitch"
          className="xl:col-span-2"
          actions={<span className="text-xs text-fg-subtle">Current hitch: {daysCovered} of {hitch.days} days so far</span>}
        >
          <ColumnChart
            valueLabel="Poles"
            data={recentHitches.map((s) => ({
              key: s.hitch.id,
              label: formatShort(s.hitch.start),
              value: s.poles,
              highlight: s.hitch.id === hitch.id,
              note: `${formatRate(s.polesPerTechDay)} poles / tech-day${s.daysCovered < s.hitch.days ? ` · ${s.daysCovered} of ${s.hitch.days} days` : ""}`,
            }))}
            onSelect={(c) => navigate(hitchPath(Number(c.key)))}
          />
        </Panel>

        <Panel title="Team leaderboard" actions={<span className="text-xs text-fg-subtle">Poles this hitch</span>}>
          <BarList
            format={formatInt}
            items={teams.map((t) => ({
              key: t.key,
              label: t.key,
              value: t.poles,
              detail: `${formatRate(t.workDays ? t.poles / t.workDays : null)} / day`,
            }))}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="This hitch by day" className="xl:col-span-2">
          <CompareColumns
            data={daily}
            currentLabel={`This hitch (${formatShort(hitch.start)})`}
            previousLabel={previous ? `Last hitch (${formatShort(previous.start)})` : "Last hitch"}
          />
        </Panel>

        <Panel title="Needs attention">
          <ul className="space-y-1">
            <Attention
              icon={<ClipboardCheck size={16} />}
              to="/queue"
              label="Awaiting upload"
              value={formatInt(backlog.rows)}
              detail={`${formatInt(backlog.thisHitch)} from this hitch`}
            />
            <Attention
              icon={<AlertTriangle size={16} />}
              to="/search?q=status%3Aprogress"
              label="Stalled permits"
              value={stalled === null ? "…" : formatInt(stalled)}
              detail="In Progress, no work in 14+ days"
            />
            <Attention
              icon={<ShieldAlert size={16} />}
              to="/quality"
              label="Data flags"
              value={formatInt(flagged)}
              detail="Rows to check in the tracker"
            />
            <Attention
              icon={<MapPinOff size={16} />}
              to={previous ? hitchPath(previous.id) : hitchPath(hitch.id)}
              label="Off-hitch rows"
              value={formatInt(stats.offHitchRows)}
              detail="Since the last hitch started"
            />
          </ul>
        </Panel>
      </div>
    </>
  );
}

function Attention({ icon, to, label, value, detail }: { icon: ReactNode; to: string; label: string; value: string; detail: string }) {
  return (
    <li>
      <Link to={to} className="group flex items-center gap-3 rounded px-2 py-2 hover:bg-raised/60">
        <span className="text-fg-subtle group-hover:text-accent">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-fg-soft">{label}</span>
          <span className="block truncate text-xs text-fg-subtle">{detail}</span>
        </span>
        <span className="text-lg font-bold tabular-nums text-fg">{value}</span>
        <ChevronRight size={14} className="text-fg-subtle group-hover:text-accent" />
      </Link>
    </li>
  );
}

function EmptyOverview() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {["Poles this hitch", "Poles / tech-day", "Active teams", "Upload backlog"].map((label) => (
        <KpiCard key={label} label={label} value="—" footnote="Waiting for the tracker" />
      ))}
    </div>
  );
}
