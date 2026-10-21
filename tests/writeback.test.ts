/**
 * Write-back safety (ARCHITECTURE.md §8): marking rows uploaded must change only those cells.
 * Runs against a copy of the real tracker in memory; the file on disk is never touched.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";
import { beforeAll, describe, expect, it } from "vitest";
import { awaitingUpload } from "@/data/metrics";
import { buildDataset } from "@/data/model";
import { readWorkbook } from "@/data/parse";
import type { Dataset, TrackerRecord } from "@/data/types";
import { columnLetter, markUploaded, recalcOnOpen, setCells, type UploadTarget } from "@/file/xlsxPatch";

describe("setCells", () => {
  const sheet =
    '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
    '<row r="2" spans="1:3"><c r="A2"><v>1</v></c><c r="B2" s="4"><v>0</v></c><c r="C2"><v>5</v></c></row>' +
    '<row r="3"><c r="A3"><v>1</v></c><c r="B3" s="7"/></row>' +
    '<row r="4"><c r="A4"><v>1</v></c><c r="C4"><v>2</v></c></row>' +
    '<row r="40"><c r="A40"><v>1</v></c></row></sheetData>';

  it("replaces a value cell, keeping its style", () => {
    expect(setCells(sheet, "B", [2], 9)).toContain('<c r="B2" s="4" t="s"><v>9</v></c><c r="C2">');
  });

  it("fills an empty cell", () => {
    expect(setCells(sheet, "B", [3], 9)).toContain('<c r="B3" s="7" t="s"><v>9</v></c></row>');
  });

  it("inserts a missing cell in column order", () => {
    expect(setCells(sheet, "B", [4], 9)).toContain('<c r="A4"><v>1</v></c><c r="B4" t="s"><v>9</v></c><c r="C4">');
    expect(setCells(sheet, "B", [40], 9)).toContain('<c r="A40"><v>1</v></c><c r="B40" t="s"><v>9</v></c></row>');
  });

  it("does several rows at once and leaves everything else alone", () => {
    const out = setCells(sheet, "B", [4, 2], 9);
    expect(out.replace('<c r="B2" s="4" t="s"><v>9</v></c>', '<c r="B2" s="4"><v>0</v></c>').replace('<c r="B4" t="s"><v>9</v></c>', "")).toBe(sheet);
  });

  it("doesn't confuse row 4 with row 40", () => {
    const out = setCells(sheet, "B", [4], 9);
    expect(out).toContain('<row r="40"><c r="A40"><v>1</v></c></row>');
  });

  it("writes an inline string when the workbook has no shared Yes", () => {
    expect(setCells(sheet, "B", [3], null)).toContain('<c r="B3" s="7" t="inlineStr"><is><t>Yes</t></is></c>');
  });
});

describe("recalcOnOpen", () => {
  it("adds or sets fullCalcOnLoad", () => {
    expect(recalcOnOpen('<workbook><calcPr calcId="191028" calcCompleted="0"/></workbook>')).toBe(
      '<workbook><calcPr calcId="191028" calcCompleted="0" fullCalcOnLoad="1"/></workbook>',
    );
    expect(recalcOnOpen('<workbook><calcPr fullCalcOnLoad="0"/></workbook>')).toBe('<workbook><calcPr fullCalcOnLoad="1"/></workbook>');
    expect(recalcOnOpen("<workbook><sheets/><extLst/></workbook>")).toBe('<workbook><sheets/><calcPr fullCalcOnLoad="1"/><extLst/></workbook>');
  });

  it("names columns", () => {
    expect([0, 13, 25, 26, 27].map(columnLetter)).toEqual(["A", "N", "Z", "AA", "AB"]);
  });
});

const WORKBOOK = process.env.FIELD_TRACKER ?? resolve(__dirname, "..", "TSG Field Tracker - Master 2026.xlsx");

describe.skipIf(!existsSync(WORKBOOK))("marking uploads in a copy of the real tracker", () => {
  let original: Uint8Array;
  let before: Dataset;
  let picks: TrackerRecord[];
  let sheetXml: string;

  const target = (r: TrackerRecord): UploadTarget => ({ excelRow: r.excelRow, expect: { date: r.date, tech: r.tech, permitId: r.permitId } });

  beforeAll(async () => {
    original = new Uint8Array(readFileSync(WORKBOOK));
    before = buildDataset(readWorkbook(original), "2026-10-21");
    sheetXml = await (await JSZip.loadAsync(original)).file("xl/worksheets/sheet1.xml")!.async("string");
    // One row of each kind: N holds 0, N is an empty cell, N is missing.
    const kind = (row: number) => {
      const i = sheetXml.indexOf(`<row r="${row}" `);
      const rowXml = sheetXml.slice(i, sheetXml.indexOf("</row>", i));
      const cell = /<c r="N\d+"[^>]*?(\/>|>.*?<\/c>)/.exec(rowXml)?.[0];
      return !cell ? "missing" : cell.endsWith("/>") ? "empty" : "value";
    };
    // Stop once one of each kind is found (each lookup scans the 45 MB sheet).
    const found = new Map<string, TrackerRecord>();
    for (const r of before.records.filter(awaitingUpload).slice(0, 400)) {
      const k = kind(r.excelRow);
      if (!found.has(k)) found.set(k, r);
      if (found.size === 3) break;
    }
    picks = [...found.values()];
  }, 60_000);

  it("finds rows of each kind to test with", () => {
    expect(picks.length).toBeGreaterThanOrEqual(2);
  });

  it("marks the rows Yes and changes nothing else", async () => {
    const result = await markUploaded(original, picks.map(target));
    expect(result.applied).toEqual(picks.map((p) => p.excelRow).sort((a, b) => a - b));
    expect(result.skipped).toEqual([]);

    const after = buildDataset(readWorkbook(result.bytes!), "2026-10-21");
    const changed = new Set(picks.map((p) => p.excelRow));
    expect(after.records).toHaveLength(before.records.length);
    after.records.forEach((r, i) => {
      const b = before.records[i]!;
      if (changed.has(r.excelRow)) {
        expect(r.uploaded).toBe(true);
        expect({ ...r, uploaded: false }).toEqual(b);
      } else {
        expect(r).toEqual(b);
      }
    });
    expect(after.hitches).toEqual(before.hitches);
  }, 60_000);

  it("leaves every other part of the file identical", async () => {
    const result = await markUploaded(original, picks.map(target));
    const a = await JSZip.loadAsync(original);
    const b = await JSZip.loadAsync(result.bytes!);
    const names = Object.keys(a.files);
    expect(Object.keys(b.files)).toEqual(names);
    const differing: string[] = [];
    for (const name of names) {
      if (a.files[name]!.dir) continue;
      const x = await a.file(name)!.async("uint8array");
      const y = await b.file(name)!.async("uint8array");
      if (x.length !== y.length || x.some((v, i) => v !== y[i])) differing.push(name);
    }
    expect(differing.sort()).toEqual(["xl/workbook.xml", "xl/worksheets/sheet1.xml"]);

    const wa = await a.file("xl/workbook.xml")!.async("string");
    const wb = await b.file("xl/workbook.xml")!.async("string");
    expect(wb.replace(' fullCalcOnLoad="1"', "")).toBe(wa);
  }, 60_000);

  it("skips rows that changed, and rows already marked", async () => {
    const [first] = picks;
    const uploaded = before.records.find((r) => r.uploaded && r.editable)!;
    const result = await markUploaded(original, [
      { excelRow: first!.excelRow, expect: { ...target(first!).expect, tech: "Someone Else" } },
      target(uploaded),
      { excelRow: 999_999, expect: { date: null, tech: null, permitId: null } },
    ]);
    expect(result.bytes).toBeNull();
    expect(result.applied).toEqual([]);
    expect(result.skipped.map((s) => s.reason).sort()).toEqual(["already-uploaded", "changed", "not-found"]);
  }, 60_000);
});
