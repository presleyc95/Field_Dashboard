/**
 * Search across permits, people, OPCOs, umbrellas and notes (ARCHITECTURE.md §6.1).
 *
 * Permit matches rank exact → starts with → contains → close spellings. Matching ignores
 * capitalization, spacing and punctuation, so `0735` finds `2025-031-0735`. Field filters
 * (`opco:aep tech:smith task:pci status:progress`) narrow the permits.
 */
import { permitKey } from "./clean";
import { permitOverall, type PermitOverall } from "./permitSummary";
import type { Dataset, Opco, Permit, Person, TrackerRecord } from "./types";
import { UMBRELLAS } from "./umbrellas";

export const FILTER_KEYS = ["opco", "tech", "task", "status"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

/** Other names people may type for a filter. */
const FILTER_ALIASES: Record<string, FilterKey> = {
  opco: "opco",
  umbrella: "opco",
  project: "opco",
  tech: "tech",
  person: "tech",
  name: "tech",
  task: "task",
  status: "status",
};

export type ParsedQuery = {
  text: string;
  filters: Partial<Record<FilterKey, string[]>>;
};

export function parseQuery(input: string): ParsedQuery {
  const filters: Partial<Record<FilterKey, string[]>> = {};
  const text = input
    .replace(/(\w+):(?:"([^"]*)"|(\S+))/g, (match, rawKey: string, quoted?: string, bare?: string) => {
      const key = FILTER_ALIASES[rawKey.toLowerCase()];
      const value = (quoted ?? bare ?? "").trim();
      if (!key || !value) return match;
      (filters[key] ??= []).push(value.toLowerCase());
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { text, filters };
}

/** How well a permit matched: 0 exact, 1 starts with, 2 contains, 3 close spelling, 4 filters only. */
export type MatchTier = 0 | 1 | 2 | 3 | 4;

export type PermitHit = { permit: Permit; tier: MatchTier; overall: PermitOverall };

export type UmbrellaHit = { name: string; opcos: string[] };

type PermitEntry = {
  permit: Permit;
  /** Letters and digits only, uppercase (variants included). */
  compact: string[];
  keys: string[];
  /** Letter/digit runs of every spelling, uppercase. */
  tokens: string[];
  overall: PermitOverall;
};

export class SearchIndex {
  private entries: PermitEntry[];

  constructor(private dataset: Dataset) {
    this.entries = dataset.permits.map((permit) => {
      const keys = [permit.key, ...permit.variants.map(permitKey)];
      return {
        permit,
        keys,
        compact: keys.map(compactOf),
        tokens: [...new Set(keys.flatMap(tokensOf))],
        overall: permitOverall(dataset, permit),
      };
    });
  }

  /** Permits matching the query, best first; ties go to the most recently worked. */
  permits(query: ParsedQuery, limit = 50): { hits: PermitHit[]; total: number } {
    const passes = (e: PermitEntry) => this.passesFilters(e, query.filters);
    const tiers = new Map<number, MatchTier>();

    if (query.text) {
      const key = permitKey(query.text);
      const compact = compactOf(query.text);
      this.entries.forEach((e, i) => {
        const tier = matchTier(e, key, compact);
        if (tier !== null && passes(e)) tiers.set(i, tier);
      });
      if (compact.length >= 4) {
        const tokens = tokensOf(query.text);
        this.entries.forEach((e, i) => {
          if (!tiers.has(i) && closeMatch(e, compact, tokens) && passes(e)) tiers.set(i, 3);
        });
      }
    } else if (Object.keys(query.filters).length) {
      this.entries.forEach((e, i) => {
        if (passes(e)) tiers.set(i, 4);
      });
    }

    const hits = [...tiers.entries()]
      .map(([i, tier]) => ({ permit: this.entries[i]!.permit, tier, overall: this.entries[i]!.overall }))
      .sort((a, b) => a.tier - b.tier || (b.permit.lastDate ?? "").localeCompare(a.permit.lastDate ?? ""));
    return { hits: hits.slice(0, limit), total: hits.length };
  }

  people(text: string, limit = 20): Person[] {
    const t = text.trim().toLowerCase();
    if (!t) return [];
    return this.dataset.people
      .filter((p) => p.name.toLowerCase().includes(t))
      .sort((a, b) => rank(a.name, t) - rank(b.name, t) || b.rowsAsLogger + b.rowsAsPartner - (a.rowsAsLogger + a.rowsAsPartner))
      .slice(0, limit);
  }

  opcos(text: string, limit = 20): Opco[] {
    const t = text.trim().toLowerCase();
    if (!t) return [];
    return this.dataset.opcos
      .filter((o) => o.name.toLowerCase().includes(t) || o.umbrella?.toLowerCase() === t)
      .sort((a, b) => rank(a.name, t) - rank(b.name, t) || b.recordCount - a.recordCount)
      .slice(0, limit);
  }

  umbrellas(text: string): UmbrellaHit[] {
    const t = text.trim().toLowerCase();
    if (!t) return [];
    const present = new Set(this.dataset.opcos.map((o) => o.name.toUpperCase()));
    return Object.entries(UMBRELLAS)
      .filter(([name]) => name.toLowerCase().startsWith(t))
      .map(([name, opcos]) => ({ name, opcos: opcos.filter((o) => present.has(o.toUpperCase())) }));
  }

  /** Rows whose notes contain the text, newest first. */
  notes(text: string, limit = 50): { records: TrackerRecord[]; total: number } {
    const t = text.trim().toLowerCase();
    if (t.length < 3) return { records: [], total: 0 };
    const records = this.dataset.records
      .filter((r) => r.notes?.toLowerCase().includes(t))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return { records: records.slice(0, limit), total: records.length };
  }

  private passesFilters(entry: PermitEntry, filters: ParsedQuery["filters"]): boolean {
    if (filters.status && !filters.status.some((s) => entry.overall.toLowerCase().includes(s))) return false;
    const { opco, tech, task } = filters;
    if (!opco && !tech && !task) return true;
    // At least one row must satisfy every row-level filter at once.
    return entry.permit.recordIds.some((id) => {
      const r = this.dataset.records[id]!;
      if (opco && !opco.some((o) => r.opco?.toLowerCase().includes(o) || r.umbrella?.toLowerCase() === o)) return false;
      if (tech && !tech.some((n) => r.tech?.toLowerCase().includes(n) || r.partner?.toLowerCase().includes(n))) return false;
      if (task && !task.some((k) => r.task?.toLowerCase().includes(k))) return false;
      return true;
    });
  }
}

function compactOf(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function tokensOf(text: string): string[] {
  return text.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
}

/**
 * A close spelling: the whole ID is within one or two typos, or every word typed matches a word
 * of the ID (exactly, as its start, or within one typo for words of 4+ characters).
 */
function closeMatch(entry: PermitEntry, compact: string, tokens: string[]): boolean {
  const allowed = compact.length >= 10 ? 2 : 1;
  if (entry.compact.some((c) => Math.abs(c.length - compact.length) <= allowed && editDistance(c, compact, allowed) <= allowed)) {
    return true;
  }
  if (tokens.length < 2 && compact.length < 6) return false;
  return tokens.every((t) =>
    entry.tokens.some((u) => u.startsWith(t) || (t.length >= 4 && Math.abs(u.length - t.length) <= 1 && editDistance(u, t, 1) <= 1)),
  );
}

/**
 * Typos between two strings (insert, delete, change, or swap two neighbors), giving up and
 * returning max + 1 once it's over `max`.
 */
export function editDistance(a: string, b: string, max: number): number {
  let before: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, before[j - 2]! + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    before = prev;
    prev = cur;
  }
  return prev[b.length]!;
}

function matchTier(entry: PermitEntry, key: string, compact: string): MatchTier | null {
  if (entry.keys.includes(key) || (compact && entry.compact.includes(compact))) return 0;
  if (entry.keys.some((k) => k.startsWith(key)) || (compact && entry.compact.some((c) => c.startsWith(compact)))) return 1;
  if (entry.keys.some((k) => k.includes(key))) return 2;
  if (compact.length >= 2 && entry.compact.some((c) => c.includes(compact))) return 2;
  return null;
}

/** 0 when the name starts with the text, 1 when a word does, 2 otherwise. */
function rank(name: string, text: string): number {
  const n = name.toLowerCase();
  if (n.startsWith(text)) return 0;
  return n.split(/\s+/).some((w) => w.startsWith(text)) ? 1 : 2;
}
