/**
 * Turns raw tracker rows into the dashboard's data model (ARCHITECTURE.md §5): cleaned records,
 * permits, people, teams per hitch and OPCOs. Pure function of the workbook and today's date.
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
import type { Dataset, ISODate, Opco, Permit, Person, Team, TrackerRecord } from "./types";
import { umbrellaFor } from "./umbrellas";

/** How far past today (or the last data date) the hitch list is continued. */
const HITCH_LOOKAHEAD_DAYS = 120;

export function buildDataset(raw: RawWorkbook, today: ISODate): Dataset {
  const log = new IssueLog();

  // Pass 1: count spellings so each OPCO, person and permit gets one consistent spelling.
  const opcoSpelling = new SpellingPicker();
  const nameSpelling = new SpellingPicker();
  const permitSpelling = new SpellingPicker();
  const cleaned = raw.rows.map((row) => {
    const opcoText = row.opco ? tidyText(String(row.opco.v)) : "";
    const tech = cleanName(row.tech);
    const partner = cleanName(row.partner);
    const permit = cleanPermit(row.permitId, row.excelRow, log);
    if (opcoText) opcoSpelling.add(opcoText);
    if (tech) nameSpelling.add(tech);
    if (partner) nameSpelling.add(partner);
    if (permit.key && permit.text) permitSpelling.add(permit.text);
    return { row, opcoText, tech, partner, permit };
  });

  // Pass 2: build records.
  const records: TrackerRecord[] = cleaned.map(({ row, opcoText, tech, partner, permit }, id) => {
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
    if (techName && partnerName && techName === partnerName) {
      log.add(r, "Paired With", "flag", "paired-with-self", "Tech is paired with themself", partnerName);
    }

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
      task: cleanTask(row.task, r, log),
      status: cleanStatus(row.status, r, log),
      poles: cleanNumber(row.poles, "Poles Collected", r, log),
      hoursOnPermit: cleanNumber(row.hoursOnPermit, "Hours on Permit", r, log),
      driveHours: cleanNumber(row.driveHours, "Drive Time", r, log),
      totalHours: cleanNumber(row.totalHours, "Total", r, log),
      mileage: cleanNumber(row.mileage, "Mileage", r, log),
      notes: cleanNotes(row.notes),
      uploaded: cleanUploaded(row.uploaded),
    };
  });

  // Dates and hitches.
  let dataThrough: ISODate | null = null;
  for (const rec of records) {
    if (!rec.date) continue;
    if (dayNumber(rec.date) > dayNumber(today) + 1) {
      log.add(rec.excelRow, "Date", "flag", "future-date", `Date is in the future (${rec.date})`, rec.date);
      continue;
    }
    if (!dataThrough || rec.date > dataThrough) dataThrough = rec.date;
  }
  const coverUntil = addDays(dataThrough && dataThrough > today ? dataThrough : today, HITCH_LOOKAHEAD_DAYS);
  const hitches = buildHitches(raw.hitches, coverUntil);
  const hitchIndex = new HitchIndex(hitches);
  for (const rec of records) {
    const found = rec.date ? hitchIndex.find(rec.date) : null;
    if (found) {
      rec.hitchId = found.hitch.id;
      rec.hitchDay = found.day;
    }
  }

  flagDuplicates(records, log);

  return {
    records,
    issues: log.issues,
    hitches,
    permits: buildPermits(records, permitSpelling),
    people: buildPeople(records),
    teams: buildTeams(records),
    opcos: buildOpcos(records, opcoSpelling),
    dataThrough,
    today,
  };
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
    const [first, second] = rec.excelRow < mirror.excelRow ? [rec, mirror] : [mirror, rec];
    const pairKey = `${first.id}|${second.id}`;
    if (reported.has(pairKey)) continue;
    reported.add(pairKey);
    const message = `${rec.tech} and ${rec.partner} both logged this permit on ${rec.date} (rows ${first.excelRow} and ${second.excelRow}); poles may be counted twice`;
    log.add(first.excelRow, "Permit ID", "flag", "possible-duplicate", message, first.permitId);
    log.add(second.excelRow, "Permit ID", "flag", "possible-duplicate", message, second.permitId);
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
