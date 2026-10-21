import { useMemo } from "react";
import { create } from "zustand";
import { SearchIndex } from "@/data/search";
import type { Dataset, Permit } from "@/data/types";
import { useTracker } from "./tracker";

const indexes = new WeakMap<Dataset, SearchIndex>();
const permitMaps = new WeakMap<Dataset, Map<string, Permit>>();

/** The search index for the loaded data, built once per load. */
export function useSearchIndex(): SearchIndex | null {
  const dataset = useTracker((s) => s.dataset);
  return useMemo(() => {
    if (!dataset) return null;
    let index = indexes.get(dataset);
    if (!index) indexes.set(dataset, (index = new SearchIndex(dataset)));
    return index;
  }, [dataset]);
}

/** Permits by comparison key, for opening a permit from its link. */
export function usePermitsByKey(): Map<string, Permit> | null {
  const dataset = useTracker((s) => s.dataset);
  return useMemo(() => {
    if (!dataset) return null;
    let map = permitMaps.get(dataset);
    if (!map) permitMaps.set(dataset, (map = new Map(dataset.permits.map((p) => [p.key, p]))));
    return map;
  }, [dataset]);
}

/** Whether the Ctrl+K search palette is open. */
export const usePalette = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
