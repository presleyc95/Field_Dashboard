import { useMemo } from "react";
import { peopleDirectory, type PersonRow } from "@/data/people";
import type { Dataset } from "@/data/types";
import { useTracker } from "./tracker";

const directories = new WeakMap<Dataset, PersonRow[]>();

/** One row per person, computed once per load. */
export function usePeopleDirectory(): PersonRow[] | null {
  const dataset = useTracker((s) => s.dataset);
  return useMemo(() => {
    if (!dataset) return null;
    let rows = directories.get(dataset);
    if (!rows) directories.set(dataset, (rows = peopleDirectory(dataset)));
    return rows;
  }, [dataset]);
}
