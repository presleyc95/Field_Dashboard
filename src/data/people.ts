/**
 * Tech profiles and the people directory (ARCHITECTURE.md §6). Uses the same definitions as
 * metrics.ts: a person is credited with the poles of every row they're on, as logger or partner.
 */
import { crewOf, groupRecords, type Group, isProduction, totals, type Totals } from "./metrics";
import type { Dataset, Hitch, ISODate, Person, TrackerRecord } from "./types";

export type PersonRow = {
  name: string;
  poles: number;
  techDays: number;
  polesPerTechDay: number | null;
  hitches: number;
  lastDate: ISODate | null;
  /** OPCO with the most tech-days. */
  topOpco: string | null;
  /** Never logs rows themselves; only appears as someone's partner. */
  partnerOnly: boolean;
};

export type PartnerStat = { name: string; rows: number; poles: number; days: number };

export type HitchPoint = { hitch: Hitch; poles: number; techDays: number; polesPerTechDay: number | null };

export type Consistency = {
  /** Production days counted. */
  days: number;
  mean: number;
  /** Coefficient of variation (spread ÷ average); lower is steadier. */
  cv: number | null;
  label: "Steady" | "Fairly steady" | "Variable" | "Too few days";
};

export type Profile = {
  person: Person;
  records: TrackerRecord[];
  totals: Totals;
  hitchesWorked: number;
  offHitchDays: number;
  opcos: Group[];
  /** OPCO with the most tech-days. */
  mostWorkedOpco: { name: string; techDays: number } | null;
  tasks: Group[];
  partners: PartnerStat[];
  byHitch: HitchPoint[];
  bestHitch: HitchPoint | null;
  consistency: Consistency;
};

export function personRecords(dataset: Dataset, name: string): TrackerRecord[] {
  return dataset.records.filter((r) => r.tech === name || r.partner === name);
}

export function buildProfile(dataset: Dataset, person: Person): Profile {
  const records = personRecords(dataset, person.name);
  const own = personalTotals(records, person.name);
  // Per-OPCO numbers use the person's own days, not their partners'.
  const opcos = groupRecords(records, "opco").map((g) => ({ ...g, ...personalTotals(recordsOf(dataset, g), person.name) }));
  const mostWorked = [...opcos].sort((a, b) => b.techDays - a.techDays || b.poles - a.poles)[0];

  const byHitchMap = new Map<number, TrackerRecord[]>();
  for (const r of records) {
    if (r.hitchId === null) continue;
    let list = byHitchMap.get(r.hitchId);
    if (!list) byHitchMap.set(r.hitchId, (list = []));
    list.push(r);
  }
  const byHitch: HitchPoint[] = [...byHitchMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, rows]) => {
      const t = personalTotals(rows, person.name);
      return { hitch: dataset.hitches[id]!, poles: t.poles, techDays: t.techDays, polesPerTechDay: t.polesPerTechDay };
    });
  const bestHitch = byHitch.reduce<HitchPoint | null>((best, h) => (!best || h.poles > best.poles ? h : best), null);

  const offHitchDays = new Set(records.filter((r) => r.hitchId === null && r.date).map((r) => r.date)).size;

  return {
    person,
    records,
    totals: own,
    hitchesWorked: byHitch.filter((h) => h.techDays > 0).length,
    offHitchDays,
    opcos: opcos.sort((a, b) => b.poles - a.poles),
    mostWorkedOpco: mostWorked ? { name: mostWorked.key, techDays: mostWorked.techDays } : null,
    tasks: groupRecords(records, "task"),
    partners: partnersOf(records, person.name),
    byHitch,
    bestHitch,
    consistency: consistencyOf(records),
  };
}

/** Totals for one person: poles of their rows, and their own production days. */
function personalTotals(records: TrackerRecord[], name: string): Totals {
  const t = totals(records);
  const days = new Set<ISODate>();
  for (const r of records) if (r.date && isProduction(r) && crewOf(r).includes(name)) days.add(r.date);
  return { ...t, creditedPoles: t.poles, techDays: days.size, polesPerTechDay: days.size ? t.poles / days.size : null };
}

function recordsOf(dataset: Dataset, group: Group): TrackerRecord[] {
  return group.recordIds.map((id) => dataset.records[id]!);
}

function partnersOf(records: TrackerRecord[], name: string): PartnerStat[] {
  const byPartner = new Map<string, { rows: number; poles: number; days: Set<ISODate> }>();
  for (const r of records) {
    const other = r.tech === name ? r.partner : r.tech;
    if (!other || other === name) continue;
    let p = byPartner.get(other);
    if (!p) byPartner.set(other, (p = { rows: 0, poles: 0, days: new Set() }));
    p.rows++;
    p.poles += r.poles ?? 0;
    if (r.date) p.days.add(r.date);
  }
  return [...byPartner.entries()]
    .map(([partner, p]) => ({ name: partner, rows: p.rows, poles: p.poles, days: p.days.size }))
    .sort((a, b) => b.days - a.days || b.poles - a.poles);
}

/** How much daily output varies across production days (days with at least one production row). */
export function consistencyOf(records: TrackerRecord[]): Consistency {
  const perDay = new Map<ISODate, number>();
  for (const r of records) {
    if (!r.date || !isProduction(r)) continue;
    perDay.set(r.date, (perDay.get(r.date) ?? 0) + (r.poles ?? 0));
  }
  const values = [...perDay.values()];
  const days = values.length;
  const mean = days ? values.reduce((a, b) => a + b, 0) / days : 0;
  if (days < 5 || mean === 0) return { days, mean, cv: null, label: "Too few days" };
  const sd = Math.sqrt(values.reduce((n, v) => n + (v - mean) ** 2, 0) / days);
  const cv = sd / mean;
  return { days, mean, cv, label: cv < 0.5 ? "Steady" : cv < 0.9 ? "Fairly steady" : "Variable" };
}

/** One row per person for the directory, computed in a single pass. */
export function peopleDirectory(dataset: Dataset): PersonRow[] {
  type Acc = { poles: number; days: Set<ISODate>; hitches: Set<number>; last: ISODate | null; opcoDays: Map<string, Set<ISODate>> };
  const acc = new Map<string, Acc>();
  for (const r of dataset.records) {
    for (const name of crewOf(r)) {
      let a = acc.get(name);
      if (!a) acc.set(name, (a = { poles: 0, days: new Set(), hitches: new Set(), last: null, opcoDays: new Map() }));
      a.poles += r.poles ?? 0;
      if (r.date && (!a.last || r.date > a.last)) a.last = r.date;
      if (r.date && isProduction(r)) {
        a.days.add(r.date);
        if (r.hitchId !== null) a.hitches.add(r.hitchId);
        if (r.opco) {
          let set = a.opcoDays.get(r.opco);
          if (!set) a.opcoDays.set(r.opco, (set = new Set()));
          set.add(r.date);
        }
      }
    }
  }
  return dataset.people
    .map((p) => {
      const a = acc.get(p.name);
      const top = a ? [...a.opcoDays.entries()].sort((x, y) => y[1].size - x[1].size)[0] : undefined;
      return {
        name: p.name,
        poles: a?.poles ?? 0,
        techDays: a?.days.size ?? 0,
        polesPerTechDay: a && a.days.size ? a.poles / a.days.size : null,
        hitches: a?.hitches.size ?? 0,
        lastDate: a?.last ?? p.lastDate,
        topOpco: top?.[0] ?? null,
        partnerOnly: p.rowsAsLogger === 0,
      };
    })
    .sort((a, b) => b.poles - a.poles);
}
