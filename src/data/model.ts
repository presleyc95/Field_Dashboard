/**
 * Turns raw tracker rows into the dashboard's data model (ARCHITECTURE.md §5): cleaned records,
 * permits, people, teams per hitch and OPCOs. Pure function of the workbooks and today's date.
 *
 * A new master tracker starts every year, so several workbooks (oldest first) are merged into one
 * history. The years overlap around New Year: when a newer workbook has the same row (same date,
 * permit, tech and task), the newer copy wins and the older one is dropped.
 */
import {
  cleanDate,
  cleanName,
  cleanNotes,
  cleanNumber,
  cleanPermit,
  cleanStatus,
  cleanTask,
  cleanUploaded,
  IssueLog,
  SpellingPicker,
  tidyText,
} from "./clean";
import { addDays, dayNumber } from "./dates";
import { buildHitches, HitchIndex } from "./hitches";
import type { RawWorkbook } from "./parse";
import type { Dataset, ISODate, Opco, Permit, Person, SourceInfo, Team, TrackerRecord } from "./types";
import { umbrellaFor } from "./umbrellas";

/** How far past today (or the last data date) the hitch list is continued. */
const HITCH_LOOKAHEAD_DAYS = 120;

/** Workbooks are named "TSG Field Tracker - Master 2026.xlsx"; the year orders them. */
export function yearOf(name: string): number | null {
  const m = /(?:^|\D)(20\d\d)(?:\D|$)/.exec(name);
  return m ? Number(m[1]) : null;
}

/** Tasks that are logged time rather than field work; a blank Status is fine for these. */
const NO_STATUS_TASKS = new Set(["COORDINATION", "DRIVE TIME"]);

/** Rows dated more than this far outside their workbook's year are flagged. */
const YEAR_SLACK_DAYS = 14;

export function buildDataset(input: RawWorkbook | RawWorkbook[], today: ISODate): Dataset {
  const raws = Array.isArray(input) ? input : [input];
  const log = new IssueLog();
  const sourceName = (raw: RawWorkbook, i: number) => raw.source ?? (raws.length > 1 ? `Workbook ${i + 1}` : "Tracker");
  const currentIndex = raws.length - 1;

  // Pass 1: count spellings so each OPCO, person and permit gets one consistent spelling across
  // every year.
  const opcoSpelling = new SpellingPicker();
  const nameSpelling = new SpellingPicker();
  const permitSpelling = new SpellingPicker();
  const cleaned = raws.flatMap((raw, fileIndex) => {
    log.source = sourceName(raw, fileIndex);
    return raw.rows.map((row) => {
      const opcoText = row.opco ? tidyText(String(row.opco.v)) : "";
      const tech = cleanName(row.tech);
      const partner = cleanName(row.partner);
      const permit = cleanPermit(row.permitId, row.excelRow, log);
      if (opcoText) opcoSpelling.add(opcoText);
      if (tech) nameSpelling.add(tech);
      if (partner) nameSpelling.add(partner);
      if (permit.key && permit.text) permitSpelling.add(permit.text);
      return { row, opcoText, tech, partner, permit, fileIndex, source: log.source };
    });
  });

  // Pass 2: build records.
  const built: TrackerRecord[] = cleaned.map(({ row, opcoText, tech, partner, permit, fileIndex, source }, id) => {
    log.source = source;
    const r = row.excelRow;
    let opco: string | null = null;
    if (opcoText) {
      opco = opcoSpelling.pick(opcoText);
      if (opco !== opcoText) log.add(r, "OPCO", "fixed", "opco-spelling", `"${opcoText}" read as ${opco}`, opcoText);
    } else {
      log.add(r, "OPCO", "flag", "missing-opco", "No OPCO", "");
    }

    const techName = tech ? nameSpelling.pick(tech) : null;
    const partnerName = partner ? nameSpelling.pick(partner) : null;
    if (tech && techName !== tech) log.add(r, "Tech Name", "fixed", "name-spelling", `"${tech}" read as ${techName}`, tech);
    if (partner && partnerName !== partner) log.add(r, "Paired With", "fixed", "name-spelling", `"${partner}" read as ${partnerName}`, partner);
    if (!techName) log.add(r, "Tech Name", "flag", "missing-tech", "No tech name", "");
    // A tech listed as their own partner is read as solo (not flagged, by request).

    const task = cleanTask(row.task, r, log);
    // Coordinator and Drive Time rows are logged time, not field work: no status needed.
    const statusRequired = !permit.isPlaceholder && !(task && NO_STATUS_TASKS.has(task));

    let permitId = permit.text;
    if (permit.key && permit.text) {
      permitId = permitSpelling.pick(permit.text);
      if (permitId !== permit.text) {
        log.add(r, "Permit ID", "fixed", "permit-spelling", `"${permit.text}" matched to ${permitId}`, permit.text);
      }
    }

    return {
      id,
      excelRow: r,
      source,
      editable: fileIndex === currentIndex,
      opco,
      umbrella: opco ? umbrellaFor(opco) : null,
      permitId,
      permitKey: permit.key,
      isPlaceholder: permit.isPlaceholder,
      tech: techName,
      partner: partnerName === techName ? null : partnerName,
      date: cleanDate(row.date, r, log),
      hitchId: null,
      hitchDay: null,
      task,
      status: cleanStatus(row.status, r, log, statusRequired),
      poles: cleanNumber(row.poles, "Poles Collected", r, log),
      hoursOnPermit: cleanNumber(row.hoursOnPermit, "Hours on Permit", r, log),
      driveHours: cleanNumber(row.driveHours, "Drive Time", r, log),
      totalHours: cleanNumber(row.totalHours, "Total", r, log),
      mileage: cleanNumber(row.mileage, "Mileage", r, log),
      notes: cleanNotes(row.notes),
      uploaded: cleanUploaded(row.uploaded),
    };
  });

  const fileOf = cleaned.map((c) => c.fileIndex);
  const { records, replaced } = mergeYears(built, fileOf, raws.length, log);

  // Dates and hitches.
  let dataThrough: ISODate | null = null;
  for (const rec of records) {
    if (!rec.date) continue;
    if (dayNumber(rec.date) > dayNumber(today) + 1) {
      log.add(rec.excelRow, "Date", "flag", "future-date", `Date is in the future (${rec.date})`, rec.date, rec.source);
      continue;
    }
    const year = yearOf(rec.source);
    if (
      raws.length > 1 &&
      year &&
      (dayNumber(rec.date) < dayNumber(`${year}-01-01`) - YEAR_SLACK_DAYS ||
        dayNumber(rec.date) > dayNumber(`${year}-12-31`) + YEAR_SLACK_DAYS)
    ) {
      log.add(rec.excelRow, "Date", "flag", "outside-tracker-year", `Dated ${rec.date}, outside this ${year} tracker's year`, rec.date, rec.source);
    }
    if (!dataThrough || rec.date > dataThrough) dataThrough = rec.date;
  }
  const coverUntil = addDays(dataThrough && dataThrough > today ? dataThrough : today, HITCH_LOOKAHEAD_DAYS);
  const hitches = buildHitches(
    raws.flatMap((r) => r.hitches),
    coverUntil,
  );
  const hitchIndex = new HitchIndex(hitches);
  for (const rec of records) {
    const found = rec.date ? hitchIndex.find(rec.date) : null;
    if (found) {
      rec.hitchId = found.hitch.id;
      rec.hitchDay = found.day;
    }
  }

  flagDuplicates(records, log);

  const sources: SourceInfo[] = raws.map((raw, i) => {
    const name = sourceName(raw, i);
    const dates = records.filter((r) => r.source === name && r.date).map((r) => r.date!);
    return {
      name,
      year: yearOf(name),
      current: i === currentIndex,
      rows: raw.rows.length,
      replaced: replaced[i] ?? 0,
      firstDate: dates.length ? dates.reduce((a, b) => (b < a ? b : a)) : null,
      lastDate: dates.length ? dates.reduce((a, b) => (b > a ? b : a)) : null,
    };
  });

  return {
    sources,
    records,
    issues: log.issues,
    hitches,
    permits: buildPermits(records, permitSpelling),
    people: buildPeople(records),
    teams: buildTeams(records),
    opcos: buildOpcos(records, opcoSpelling),
    // Scope sheets name the OPCO their own way; use the tracker's spelling when it has one.
    scope: raws.flatMap((raw) => raw.scope ?? []).map((item) => ({ ...item, opco: opcoSpelling.pick(item.opco) })),
    dataThrough,
    today,
  };
}

/**
 * Drops rows from an older workbook that a newer workbook also has (same date, permit, tech and
 * task), then renumbers record ids. Rows only in the older workbook are kept.
 */
function mergeYears(built: TrackerRecord[], fileOf: number[], files: number, log: IssueLog) {
  const replaced = new Array<number>(files).fill(0);
  if (files < 2) return { records: built, replaced };

  const key = (r: TrackerRecord) =>
    r.date && r.tech ? [r.date, r.permitKey ?? r.permitId?.toUpperCase() ?? "", r.tech, r.task ?? ""].join("|") : null;
  // Newest file that has each key.
  const newest = new Map<string, number>();
  built.forEach((r, i) => {
    const k = key(r);
    if (k && (newest.get(k) ?? -1) < fileOf[i]!) newest.set(k, fileOf[i]!);
  });

  const records: TrackerRecord[] = [];
  built.forEach((r, i) => {
    const k = key(r);
    const owner = k ? newest.get(k)! : fileOf[i]!;
    if (owner > fileOf[i]!) {
      replaced[fileOf[i]!]!++;
      const newer = built.find((b, j) => fileOf[j] === owner && key(b) === k);
      log.add(r.excelRow, "Date", "fixed", "replaced-by-newer", `Also in ${newer?.source ?? "a newer tracker"} (row ${newer?.excelRow ?? "?"}); using that copy`, r.date, r.source);
      return;
    }
    records.push({ ...r, id: records.length });
  });
  return { records, replaced };
}

/**
 * One row normally covers the whole team. When both partners logged the same permit on the same
 * day, the poles may be counted twice, so both rows are flagged.
 */
function flagDuplicates(records: TrackerRecord[], log: IssueLog) {
  const byLogger = new Map<string, TrackerRecord>();
  for (const rec of records) {
    if (rec.tech && rec.date && rec.permitKey) byLogger.set(`${rec.date}|${rec.permitKey}|${rec.tech}`, rec);
  }
  const reported = new Set<string>();
  for (const rec of records) {
    if (!rec.partner || !rec.date || !rec.permitKey) continue;
    const mirror = byLogger.get(`${rec.date}|${rec.permitKey}|${rec.partner}`);
    if (!mirror || mirror.id === rec.id) continue;
    // Both rows may name each other; report each pair once.
    const [first, second] = rec.id < mirror.id ? [rec, mirror] : [mirror, rec];
    const pairKey = `${first.id}|${second.id}`;
    if (reported.has(pairKey)) continue;
    reported.add(pairKey);
    const message = `${rec.tech} and ${rec.partner} both logged this permit on ${rec.date} (rows ${first.excelRow} and ${second.excelRow}); poles may be counted twice`;
    log.add(first.excelRow, "Permit ID", "flag", "possible-duplicate", message, first.permitId, first.source);
    log.add(second.excelRow, "Permit ID", "flag", "possible-duplicate", message, second.permitId, second.source);
  }
}

function buildPermits(records: TrackerRecord[], spelling: SpellingPicker): Permit[] {
  const byKey = new Map<string, Permit>();
  for (const rec of records) {
    if (!rec.permitKey || !rec.permitId) continue;
    let permit = byKey.get(rec.permitKey);
    if (!permit) {
      permit = {
        key: rec.permitKey,
        id: rec.permitId,
        variants: spelling.variants(rec.permitId),
        opcos: [],
        recordIds: [],
        tasks: [],
        firstDate: null,
        lastDate: null,
      };
      byKey.set(rec.permitKey, permit);
    }
    permit.recordIds.push(rec.id);
    if (rec.opco && !permit.opcos.includes(rec.opco)) permit.opcos.push(rec.opco);
    if (rec.task && !permit.tasks.includes(rec.task)) permit.tasks.push(rec.task);
    if (rec.date) {
      if (!permit.firstDate || rec.date < permit.firstDate) permit.firstDate = rec.date;
      if (!permit.lastDate || rec.date > permit.lastDate) permit.lastDate = rec.date;
    }
  }
  return [...byKey.values()];
}

function buildPeople(records: TrackerRecord[]): Person[] {
  const byName = new Map<string, Person>();
  const get = (name: string) => {
    let p = byName.get(name);
    if (!p) byName.set(name, (p = { name, rowsAsLogger: 0, rowsAsPartner: 0, rowsSolo: 0, firstDate: null, lastDate: null }));
    return p;
  };
  const seen = (p: Person, date: ISODate | null) => {
    if (!date) return;
    if (!p.firstDate || date < p.firstDate) p.firstDate = date;
    if (!p.lastDate || date > p.lastDate) p.lastDate = date;
  };
  for (const rec of records) {
    if (rec.tech) {
      const p = get(rec.tech);
      p.rowsAsLogger++;
      if (!rec.partner) p.rowsSolo++;
      seen(p, rec.date);
    }
    if (rec.partner) {
      const p = get(rec.partner);
      p.rowsAsPartner++;
      seen(p, rec.date);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** A team is the logger plus their partners within one hitch (pairs change between hitches). */
function buildTeams(records: TrackerRecord[]): Team[] {
  const byKey = new Map<string, Team & { soloDates: Set<ISODate> }>();
  for (const rec of records) {
    if (rec.hitchId === null || !rec.tech) continue;
    const key = `${rec.hitchId}|${rec.tech}`;
    let team = byKey.get(key);
    if (!team) {
      team = { hitchId: rec.hitchId, logger: rec.tech, partners: [], recordIds: [], soloDays: 0, soloDates: new Set() };
      byKey.set(key, team);
    }
    team.recordIds.push(rec.id);
    if (rec.partner) {
      if (!team.partners.includes(rec.partner)) team.partners.push(rec.partner);
    } else if (rec.date) {
      team.soloDates.add(rec.date);
    }
  }
  return [...byKey.values()].map(({ soloDates, ...team }) => ({ ...team, soloDays: soloDates.size }));
}

function buildOpcos(records: TrackerRecord[], spelling: SpellingPicker): Opco[] {
  const byName = new Map<string, Opco>();
  for (const rec of records) {
    if (!rec.opco) continue;
    let opco = byName.get(rec.opco);
    if (!opco) {
      opco = { name: rec.opco, umbrella: rec.umbrella, variants: spelling.variants(rec.opco), recordCount: 0 };
      byName.set(rec.opco, opco);
    }
    opco.recordCount++;
  }
  return [...byName.values()].sort((a, b) => b.recordCount - a.recordCount);
}
