/**
 * Marks rows "Uploaded to Katapult" = Yes by editing only those cells in the workbook's XML
 * (ARCHITECTURE.md §8). Every other part of the file (Power Query, pivots, charts, formulas,
 * SharePoint metadata) is copied through unchanged; Excel is told to recalculate on next open so
 * the formula columns that read column N update.
 *
 * Pure: bytes in, bytes out. Runs in the data worker in the app and in Node for tests.
 */
import JSZip from "jszip";
import { permitKey, tidyText } from "@/data/clean";
import { buildDataset } from "@/data/model";
import { readWorkbook, TRACKER_SHEET } from "@/data/parse";
import type { ISODate } from "@/data/types";

/** A row to mark, with what it should still contain so a moved or edited row isn't touched. */
export type UploadTarget = {
  excelRow: number;
  expect: { date: ISODate | null; tech: string | null; permitId: string | null };
};

export type SkipReason = "not-found" | "changed" | "already-uploaded";

export type PatchResult = {
  /** The new workbook, or null when there was nothing to change. */
  bytes: Uint8Array | null;
  applied: number[];
  skipped: { excelRow: number; reason: SkipReason; detail: string }[];
};

export class PatchError extends Error {}

export async function markUploaded(data: Uint8Array, targets: UploadTarget[]): Promise<PatchResult> {
  // 1. Check every target against the file as it is now.
  const raw = readWorkbook(data);
  const column = raw.columns.uploaded;
  if (column === undefined) throw new PatchError('The tracker has no "Uploaded to Katapult" column.');
  const current = buildDataset(raw, "2100-01-01");
  const byRow = new Map(current.records.map((r) => [r.excelRow, r]));

  const applied: number[] = [];
  const skipped: PatchResult["skipped"] = [];
  for (const t of [...targets].sort((a, b) => a.excelRow - b.excelRow)) {
    const rec = byRow.get(t.excelRow);
    if (!rec) {
      skipped.push({ excelRow: t.excelRow, reason: "not-found", detail: "That row is now empty or gone." });
      continue;
    }
    const mismatch = differences(rec, t.expect);
    if (mismatch) {
      skipped.push({ excelRow: t.excelRow, reason: "changed", detail: `The row now has ${mismatch}; it may have moved.` });
      continue;
    }
    if (rec.uploaded) {
      skipped.push({ excelRow: t.excelRow, reason: "already-uploaded", detail: "Already marked Yes." });
      continue;
    }
    applied.push(t.excelRow);
  }
  if (applied.length === 0) return { bytes: null, applied, skipped };

  // 2. Edit only those cells.
  const zip = await JSZip.loadAsync(data);
  const workbookXml = await readEntry(zip, "xl/workbook.xml");
  const sheetPath = await sheetPathFor(zip, workbookXml, TRACKER_SHEET);
  const sheetXml = await readEntry(zip, sheetPath);
  const yesIndex = await sharedStringIndex(zip, "Yes");

  // createFolders: false, or JSZip adds folder entries the original file doesn't have.
  zip.file(sheetPath, setCells(sheetXml, columnLetter(column), applied, yesIndex), { createFolders: false });
  zip.file("xl/workbook.xml", recalcOnOpen(workbookXml), { createFolders: false });

  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { bytes, applied, skipped };
}

function differences(rec: { date: ISODate | null; tech: string | null; permitKey: string | null; permitId: string | null }, expect: UploadTarget["expect"]): string | null {
  const same = (a: string | null, b: string | null) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
  if (rec.date !== expect.date) return `date ${rec.date ?? "(blank)"}`;
  if (!same(rec.tech ? tidyText(rec.tech) : null, expect.tech ? tidyText(expect.tech) : null)) return `tech ${rec.tech ?? "(blank)"}`;
  const key = rec.permitKey ?? (rec.permitId ? permitKey(rec.permitId) : null);
  const want = expect.permitId ? permitKey(expect.permitId) : null;
  if (key !== want) return `permit ${rec.permitId ?? "(blank)"}`;
  return null;
}

async function readEntry(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) throw new PatchError(`The workbook is missing ${path}.`);
  return file.async("string");
}

/** Finds the worksheet file for a sheet name through workbook.xml and its relationships. */
async function sheetPathFor(zip: JSZip, workbookXml: string, name: string): Promise<string> {
  const sheetTag = [...workbookXml.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((tag) => attr(tag, "name") === escapeXml(name));
  const rid = sheetTag && attr(sheetTag, "r:id");
  if (!rid) throw new PatchError(`The workbook has no "${name}" sheet.`);
  const rels = await readEntry(zip, "xl/_rels/workbook.xml.rels");
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((tag) => attr(tag, "Id") === rid);
  const target = rel && attr(rel, "Target");
  if (!target) throw new PatchError(`Couldn't find the file for the "${name}" sheet.`);
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

/** Index of a plain shared string, or null if the workbook doesn't have it. */
async function sharedStringIndex(zip: JSZip, text: string): Promise<number | null> {
  const file = zip.file("xl/sharedStrings.xml");
  if (!file) return null;
  const xml = await file.async("string");
  let index = 0;
  let pos = xml.indexOf("<si>");
  const wanted = new RegExp(`^<si><t(?: [^>]*)?>${escapeXml(text)}</t></si>`);
  while (pos >= 0) {
    if (wanted.test(xml.slice(pos, pos + text.length + 40))) return index;
    index++;
    pos = xml.indexOf("<si>", pos + 4);
  }
  return null;
}

/**
 * Sets the given rows' cell in `col` to Yes. Rows are visited in order and the output is built
 * once from slices, so a 45 MB sheet isn't copied for every edit.
 */
export function setCells(xml: string, col: string, rows: number[], yesIndex: number | null): string {
  const out: string[] = [];
  let copied = 0;
  let search = 0;
  for (const n of [...rows].sort((a, b) => a - b)) {
    const rowStart = findRow(xml, n, search);
    if (rowStart < 0) throw new PatchError(`Row ${n} isn't in the sheet.`);
    const rowTagEnd = xml.indexOf(">", rowStart);
    if (xml[rowTagEnd - 1] === "/") throw new PatchError(`Row ${n} is empty in the sheet.`);
    const rowEnd = xml.indexOf("</row>", rowTagEnd);
    const ref = `${col}${n}`;

    const cellStart = xml.indexOf(`<c r="${ref}"`, rowTagEnd);
    let start: number;
    let end: number;
    let style = "";
    if (cellStart >= 0 && cellStart < rowEnd) {
      const tagEnd = xml.indexOf(">", cellStart);
      const openTag = xml.slice(cellStart, tagEnd + 1);
      const s = attr(openTag, "s");
      if (s) style = ` s="${s}"`;
      start = cellStart;
      end = xml[tagEnd - 1] === "/" ? tagEnd + 1 : xml.indexOf("</c>", tagEnd) + 4;
    } else {
      // No cell yet: insert it before the first cell to its right, or at the end of the row.
      start = end = insertionPoint(xml, rowTagEnd + 1, rowEnd, columnNumber(col));
    }
    const value = yesIndex !== null ? ` t="s"><v>${yesIndex}</v></c>` : ` t="inlineStr"><is><t>Yes</t></is></c>`;
    out.push(xml.slice(copied, start), `<c r="${ref}"${style}${value}`);
    copied = end;
    search = rowEnd;
  }
  out.push(xml.slice(copied));
  return out.join("");
}

function findRow(xml: string, n: number, from: number): number {
  const needle = `<row r="${n}"`;
  let i = xml.indexOf(needle, from);
  while (i >= 0) {
    const next = xml[i + needle.length];
    if (next === " " || next === ">" || next === "/") return i;
    i = xml.indexOf(needle, i + needle.length);
  }
  return -1;
}

function insertionPoint(xml: string, from: number, rowEnd: number, colNumber: number): number {
  const re = /<c r="([A-Z]+)\d+"/g;
  re.lastIndex = from;
  for (let m = re.exec(xml); m && m.index < rowEnd; m = re.exec(xml)) {
    if (columnNumber(m[1]!) > colNumber) return m.index;
  }
  return rowEnd;
}

/** Tells Excel to recalculate everything when the file is next opened. */
export function recalcOnOpen(workbookXml: string): string {
  const calcPr = /<calcPr\b[^>]*?\/?>/.exec(workbookXml);
  if (calcPr) {
    const tag = calcPr[0];
    const updated = /fullCalcOnLoad="[^"]*"/.test(tag)
      ? tag.replace(/fullCalcOnLoad="[^"]*"/, 'fullCalcOnLoad="1"')
      : tag.replace(/\s*(\/?>)$/, ' fullCalcOnLoad="1"$1');
    return workbookXml.slice(0, calcPr.index) + updated + workbookXml.slice(calcPr.index + tag.length);
  }
  // calcPr must come after sheets/definedNames and before these elements.
  const before = ["<oleSize", "<customWorkbookViews", "<pivotCaches", "<smartTagPr", "<smartTagTypes", "<webPublishing", "<fileRecoveryPr", "<webPublishObjects", "<extLst", "</workbook>"];
  const at = Math.min(...before.map((t) => workbookXml.indexOf(t)).filter((i) => i >= 0));
  return workbookXml.slice(0, at) + '<calcPr fullCalcOnLoad="1"/>' + workbookXml.slice(at);
}

/** 0-based column index → letters (13 → "N"). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function columnNumber(letters: string): number {
  return [...letters].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name.replace(":", "\\:")}="([^"]*)"`).exec(tag);
  return m ? m[1]! : null;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
