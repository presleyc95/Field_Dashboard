import { FolderOpen } from "lucide-react";
import { KpiCard } from "@/components/KpiCard";
import { Panel } from "@/components/Panel";

// Placeholder values until the workbook is wired up in build step 2.
const KPIS = [
  { label: "Poles this hitch", value: "—", deltaLabel: "vs. last hitch" },
  { label: "Poles / tech / day", value: "—", deltaLabel: "vs. last hitch" },
  { label: "Active teams", value: "—", deltaLabel: "this hitch" },
  { label: "Upload backlog", value: "—", deltaLabel: "awaiting Katapult" },
];

export function CommandCenter() {
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label-caps">Current hitch</div>
            <div className="mt-1 text-xl font-bold text-fg">No tracker connected</div>
            <div className="mt-1 text-xs text-fg-subtle">
              Connect the synced TSG Field Tracker folder to load data.
            </div>
          </div>
          <button
            type="button"
            disabled
            title="Arrives in build step 2"
            className="inline-flex items-center gap-2 rounded bg-accent px-4 py-2 text-sm font-medium uppercase tracking-wider text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FolderOpen size={16} />
            Connect tracker
          </button>
        </div>
      </Panel>

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
      Waiting for data
    </div>
  );
}
