import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { HitchBanner } from "@/components/HitchBanner";
import { KpiCard } from "@/components/KpiCard";
import { Panel } from "@/components/Panel";
import { useTracker } from "@/state/tracker";

// Placeholder values until the metrics arrive in build step 4.
const KPIS = [
  { label: "Poles this hitch", value: "—", deltaLabel: "vs. last hitch" },
  { label: "Poles / tech / day", value: "—", deltaLabel: "vs. last hitch" },
  { label: "Active teams", value: "—", deltaLabel: "this hitch" },
  { label: "Upload backlog", value: "—", deltaLabel: "awaiting Katapult" },
];

export function CommandCenter() {
  const ready = useTracker((s) => s.phase === "ready");

  return (
    <div className="space-y-4">
      <Panel>{ready ? <HitchBanner /> : <ConnectionPrompt />}</Panel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Production trend" className="xl:col-span-2">
          <EmptyState />
        </Panel>
        <Panel title="Team leaderboard">
          <EmptyState />
        </Panel>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-48 items-center justify-center rounded border border-dashed border-line text-xs uppercase tracking-wider text-fg-subtle">
      Arrives in build step 4
    </div>
  );
}
