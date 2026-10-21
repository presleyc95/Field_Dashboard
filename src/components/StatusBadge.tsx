import type { PermitOverall } from "@/data/permitSummary";
import type { Status } from "@/data/types";
import { cn } from "@/lib/cn";

const TONES: Record<PermitOverall | Status, string> = {
  Complete: "border-positive/40 bg-positive/10 text-positive",
  "In Progress": "border-accent/40 bg-accent/10 text-accent",
  "In progress": "border-accent/40 bg-accent/10 text-accent",
  "Awaiting upload": "border-warning/40 bg-warning/10 text-warning",
  Unknown: "border-line bg-raised text-fg-muted",
};

const LABELS: Partial<Record<PermitOverall | Status, string>> = {
  "Awaiting upload": "Field complete – awaiting upload",
};

/** Status chip for a row status or a permit's overall status. */
export function StatusBadge({ status, short }: { status: PermitOverall | Status; short?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider",
        TONES[status],
      )}
    >
      {short ? status : (LABELS[status] ?? status)}
    </span>
  );
}
