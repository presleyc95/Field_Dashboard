import { useMemo } from "react";
import { localToday } from "@/data/dates";
import { focusHitch, summarizeHitches, type HitchSummary } from "@/data/metrics";
import { summarizePermit } from "@/data/permitSummary";
import type { Dataset, Hitch } from "@/data/types";
import { useTracker } from "./tracker";

const hitchSummaries = new WeakMap<Dataset, HitchSummary[]>();
const stalled = new WeakMap<Dataset, number>();

/** Totals for every hitch, computed once per load. */
export function useHitchSummaries(): HitchSummary[] | null {
  const dataset = useTracker((s) => s.dataset);
  return useMemo(() => {
    if (!dataset) return null;
    let list = hitchSummaries.get(dataset);
    if (!list) hitchSummaries.set(dataset, (list = summarizeHitches(dataset, localToday())));
    return list;
  }, [dataset]);
}

/** The current hitch, or the last one that has started. */
export function useFocusHitch(): Hitch | null {
  const dataset = useTracker((s) => s.dataset);
  return useMemo(() => (dataset ? focusHitch(dataset, localToday()) : null), [dataset]);
}

/** Permits with a task In Progress and no field work for more than 14 days. */
export function useStalledPermitCount(): number | null {
  const dataset = useTracker((s) => s.dataset);
  return useMemo(() => {
    if (!dataset) return null;
    let n = stalled.get(dataset);
    if (n === undefined) {
      n = dataset.permits.filter((p) => summarizePermit(dataset, p).flags.some((f) => f.code === "stalled")).length;
      stalled.set(dataset, n);
    }
    return n;
  }, [dataset]);
}
