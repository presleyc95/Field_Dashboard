/**
 * Projects: an OPCO, or an umbrella of OPCOs (ARCHITECTURE.md §6). Production is still reported
 * per OPCO; an umbrella view lists its OPCOs side by side.
 *
 * The scope sheets are field queues (what's waiting now, no history), so instead of a burn-down
 * over time the page shows the queue against recent pace: poles waiting ÷ average poles per
 * hitch over the last four completed hitches.
 */
import { addDays, daysBetween } from "./dates";
import { totals, type Totals } from "./metrics";
import { permitOverall, type PermitOverall } from "./permitSummary";
import type { Dataset, Hitch, ISODate, Permit, ScopeItem, TrackerRecord } from "./types";
import { UMBRELLAS, opcoKey } from "./umbrellas";

export type Project = {
  /** OPCO or umbrella name. */
  name: string;
  isUmbrella: boolean;
  opcos: string[];
};

/**
 * Finds an OPCO, or an umbrella when `umbrella` is set (ignoring capitalization). They're looked
 * up separately because "Oncor" and "Entergy" are both an umbrella and an OPCO name.
 */
export function findProject(dataset: Dataset, name: string, umbrella = false): Project | null {
  const key = opcoKey(name);
  if (umbrella) {
    const match = Object.keys(UMBRELLAS).find((u) => opcoKey(u) === key);
    if (!match) return null;
    const opcos = dataset.opcos.filter((o) => o.umbrella === match).map((o) => o.name);
    return opcos.length ? { name: match, isUmbrella: true, opcos } : null;
  }
  const opco = dataset.opcos.find((o) => opcoKey(o.name) === key);
  return opco ? { name: opco.name, isUmbrella: false, opcos: [opco.name] } : null;
}

/** How many completed hitches set the pace. */
export const PACE_HITCHES = 4;

export type Pace = {
  /** Average poles per hitch over the last completed hitches (0 when idle). */
  polesPerHitch: number;
  hitchesCounted: number;
};

export type ScopeRow = ScopeItem & {
  /** Tracker rows for the same circuit/permit. */
  collected: number;
  lastWorked: ISODate | null;
  permit: Permit | null;
  /** Days until due (negative = overdue), when there's a due date. */
  daysUntilDue: number | null;
  risk: "overdue" | "due-soon" | null;
};

export type ProjectSummary = {
  project: Project;
  records: TrackerRecord[];
  totals: Totals;
  /** Poles in the focus (current) hitch. */
  currentPoles: number;
  pace: Pace;
  permitStatus: Record<PermitOverall, number>;
  lastWorked: ISODate | null;
  scope: ScopeRow[];
  /** Poles waiting in the field queue. */
  queuePoles: number;
  /** Hitches the queue would take at the current pace (null when there's no pace). */
  queueHitches: number | null;
  /** Projected end of the hitch in which the queue would be done. */
  projectedFinish: ISODate | null;
};

/** Due within this many days (and not overdue) counts as "due soon". */
export const DUE_SOON_DAYS = 30;

export function summarizeProject(dataset: Dataset, project: Project, focus: Hitch, today: ISODate): ProjectSummary {
  const opcos = new Set(project.opcos);
  const records = dataset.records.filter((r) => r.opco && opcos.has(r.opco));
  const pace = paceOf(records, focus);

  const permits = dataset.permits.filter((p) => p.opcos.some((o) => opcos.has(o)));
  const permitStatus: Record<PermitOverall, number> = { "In progress": 0, "Awaiting upload": 0, Complete: 0, Unknown: 0 };
  for (const p of permits) permitStatus[permitOverall(dataset, p)]++;

  const permitByKey = new Map(dataset.permits.map((p) => [p.key, p]));
  const scope = dataset.scope
    .filter((s) => opcos.has(s.opco))
    .map((item): ScopeRow => {
      const permit = permitByKey.get(item.permitKey) ?? null;
      const rows = permit ? permit.recordIds.map((id) => dataset.records[id]!) : [];
      const daysUntilDue = item.due ? daysBetween(today, item.due) : null;
      return {
        ...item,
        permit,
        collected: rows.reduce((n, r) => n + (r.poles ?? 0), 0),
        lastWorked: permit?.lastDate ?? null,
        daysUntilDue,
        risk: daysUntilDue === null ? null : daysUntilDue < 0 ? "overdue" : daysUntilDue <= DUE_SOON_DAYS ? "due-soon" : null,
      };
    })
    .sort(byDueThenPriority);

  const queuePoles = scope.reduce((n, s) => n + (s.poles ?? 0) + (s.goBackPoles ?? 0), 0);
  const queueHitches = queuePoles && pace.polesPerHitch ? queuePoles / pace.polesPerHitch : null;
  const cycle = focus.id > 0 ? daysBetween(dataset.hitches[focus.id - 1]!.start, focus.start) : 14;

  return {
    project,
    records,
    totals: totals(records),
    currentPoles: records.filter((r) => r.hitchId === focus.id).reduce((n, r) => n + (r.poles ?? 0), 0),
    pace,
    permitStatus,
    lastWorked: records.reduce<ISODate | null>((m, r) => (r.date && (!m || r.date > m) ? r.date : m), null),
    scope,
    queuePoles,
    queueHitches,
    projectedFinish: queueHitches === null ? null : addDays(focus.end, Math.max(0, Math.ceil(queueHitches) - 1) * cycle),
  };
}

/** Average poles per hitch over the last PACE_HITCHES hitches before the focus one. */
function paceOf(records: TrackerRecord[], focus: Hitch): Pace {
  const ids = new Set<number>();
  for (let id = focus.id - 1; id >= 0 && ids.size < PACE_HITCHES; id--) ids.add(id);
  const poles = records.filter((r) => r.hitchId !== null && ids.has(r.hitchId)).reduce((n, r) => n + (r.poles ?? 0), 0);
  return { polesPerHitch: ids.size ? poles / ids.size : 0, hitchesCounted: ids.size };
}

function byDueThenPriority(a: ScopeRow, b: ScopeRow): number {
  if (a.due !== b.due) {
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due < b.due ? -1 : 1;
  }
  return (a.priority ?? "9").localeCompare(b.priority ?? "9");
}

export type ProjectListRow = {
  project: Project;
  umbrella: string | null;
  poles: number;
  currentPoles: number;
  pace: number;
  permits: number;
  lastWorked: ISODate | null;
  queuePoles: number;
};

/** One row per OPCO for the Projects list. */
export function projectList(dataset: Dataset, focus: Hitch): ProjectListRow[] {
  const paceIds = new Set<number>();
  for (let id = focus.id - 1; id >= 0 && paceIds.size < PACE_HITCHES; id--) paceIds.add(id);

  const acc = new Map<string, { poles: number; current: number; paced: number; last: ISODate | null; permits: Set<string> }>();
  for (const r of dataset.records) {
    if (!r.opco) continue;
    let a = acc.get(r.opco);
    if (!a) acc.set(r.opco, (a = { poles: 0, current: 0, paced: 0, last: null, permits: new Set() }));
    const p = r.poles ?? 0;
    a.poles += p;
    if (r.hitchId === focus.id) a.current += p;
    if (r.hitchId !== null && paceIds.has(r.hitchId)) a.paced += p;
    if (r.date && (!a.last || r.date > a.last)) a.last = r.date;
    if (r.permitKey) a.permits.add(r.permitKey);
  }

  return dataset.opcos.map((o) => {
    const a = acc.get(o.name)!;
    return {
      project: { name: o.name, isUmbrella: false, opcos: [o.name] },
      umbrella: o.umbrella,
      poles: a.poles,
      currentPoles: a.current,
      pace: paceIds.size ? a.paced / paceIds.size : 0,
      permits: a.permits.size,
      lastWorked: a.last,
      queuePoles: dataset.scope.filter((s) => s.opco === o.name).reduce((n, s) => n + (s.poles ?? 0) + (s.goBackPoles ?? 0), 0),
    };
  });
}
