import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildHitches } from "@/data/hitches";
import { loadWorkbooks } from "@/data/load";
import { awaitingUpload, focusHitch } from "@/data/metrics";
import { buildDataset, yearOf } from "@/data/model";
import type { RawTrackerRow, RawWorkbook } from "@/data/parse";
import { summarizePermit } from "@/data/permitSummary";
import type { Dataset } from "@/data/types";

function workbook(source: string, rows: Partial<Record<keyof RawTrackerRow, unknown>>[], hitches: RawWorkbook["hitches"] = []): RawWorkbook {
  return {
    source,
    headerRow: 1,
    columns: {},
    hitches,
    rows: rows.map((r, i) => {
      const row = { excelRow: i + 2 } as RawTrackerRow;
      const values = { opco: "ONCOR", permitId: `P${i}`, tech: "Alex", task: "PCI", status: "Complete", poles: 10, ...r };
      for (const [k, v] of Object.entries(values)) (row as Record<string, unknown>)[k] = { v };
      return row;
    }),
  };
}

// Excel serials: 46022 = 2025-12-31, 46023 = 2026-01-01, 46027 = 2026-01-05, 45667 = 2025-01-10.
describe("merging yearly trackers", () => {
  const y2025 = workbook("TSG Field Tracker - Master 2025.xlsx", [
    { date: 45667, permitId: "A", poles: 5 },
    { date: 46022, permitId: "B", poles: 7 },
    { date: 46023, permitId: "C", poles: 9 }, // only in 2025's file
    { date: 46027, permitId: "D", poles: 3, status: "In Progress" }, // also in 2026's file
  ]);
  const y2026 = workbook("TSG Field Tracker - Master 2026.xlsx", [
    { date: 46027, permitId: "D", poles: 4 }, // newer copy of D wins
    { date: 46027, permitId: "E", poles: 2, uploaded: "" },
  ]);
  const ds = buildDataset([y2025, y2026], "2026-01-10");

  it("keeps every year's rows and drops the older copy of a shared row", () => {
    expect(ds.records.map((r) => [r.permitId, r.poles, r.source.slice(-9, -5)])).toEqual([
      ["A", 5, "2025"],
      ["B", 7, "2025"],
      ["C", 9, "2025"],
      ["D", 4, "2026"],
      ["E", 2, "2026"],
    ]);
    expect(ds.records.every((r, i) => r.id === i)).toBe(true);
    expect(ds.issues.filter((i) => i.code === "replaced-by-newer")).toHaveLength(1);
  });

  it("marks only the newest workbook as current and editable", () => {
    expect(ds.sources.map((s) => [s.year, s.current, s.rows, s.replaced])).toEqual([
      [2025, false, 4, 1],
      [2026, true, 2, 0],
    ]);
    expect(ds.records.filter((r) => r.editable).map((r) => r.permitId)).toEqual(["D", "E"]);
  });

  it("only puts the current year's rows in the upload queue", () => {
    expect(ds.records.filter(awaitingUpload).map((r) => r.permitId)).toEqual(["D", "E"]);
  });

  it("merges a permit worked in both years", () => {
    const both = buildDataset(
      [workbook("Master 2025", [{ date: 46022, permitId: "X", task: "KATAPULT" }]), workbook("Master 2026", [{ date: 46027, permitId: "X" }])],
      "2026-01-10",
    );
    expect(both.permits).toHaveLength(1);
    expect(both.permits[0]).toMatchObject({ firstDate: "2025-12-31", lastDate: "2026-01-05" });
  });

  it("doesn't hold old permits at awaiting upload for last year's unmarked rows", () => {
    const old = buildDataset(
      [workbook("Master 2025", [{ date: 46022, permitId: "X", task: "KATAPULT" }]), workbook("Master 2026", [{ date: 46027, permitId: "Y", uploaded: "" }])],
      "2026-01-10",
    );
    const overall = (key: string) => summarizePermit(old, old.permits.find((p) => p.key === key)!).overall;
    expect(overall("X")).toBe("Complete");
    expect(overall("Y")).toBe("Awaiting upload");
  });

  it("flags rows dated well outside their workbook's year", () => {
    const odd = buildDataset([workbook("Master 2025", [{ date: 46053 }]), workbook("Master 2026", [])], "2026-03-01"); // 2026-01-31
    expect(odd.issues.some((i) => i.code === "outside-tracker-year")).toBe(true);
  });

  it("reads the year from the file name", () => {
    expect(yearOf("TSG Field Tracker - Master 2026.xlsx")).toBe(2026);
    expect(yearOf("tracker.xlsx")).toBeNull();
  });
});

describe("hitch lists from several years", () => {
  it("fills in missing end dates and keeps each start once", () => {
    const hitches = buildHitches(
      [
        { start: "2025-12-25", end: null }, // 2025's list: starts only
        { start: "2026-01-08", end: null },
        { start: "2026-01-08", end: "2026-01-15" }, // 2026's list
        { start: "2026-01-22", end: "2026-01-29" },
      ],
      "2026-01-29",
    );
    expect(hitches.map((h) => [h.start, h.end])).toEqual([
      ["2025-12-25", "2026-01-01"],
      ["2026-01-08", "2026-01-15"],
      ["2026-01-22", "2026-01-29"],
    ]);
  });
});

const DIR = resolve(__dirname, "..");
const Y2025 = resolve(DIR, "TSG Field Tracker - Master 2025.xlsx");
const Y2026 = resolve(DIR, "TSG Field Tracker - Master 2026.xlsx");

describe.skipIf(!existsSync(Y2025) || !existsSync(Y2026))("the real 2025 and 2026 trackers together", () => {
  let ds: Dataset;
  let raws: RawWorkbook[];
  beforeAll(() => {
    ({ dataset: ds, raws } = loadWorkbooks(
      [
        { name: "TSG Field Tracker - Master 2025.xlsx", data: readFileSync(Y2025) },
        { name: "TSG Field Tracker - Master 2026.xlsx", data: readFileSync(Y2026) },
      ],
      "2026-10-21",
    ));
  }, 30_000);

  it("combines both years into one history", () => {
    expect(ds.sources.map((s) => [s.year, s.current])).toEqual([
      [2025, false],
      [2026, true],
    ]);
    const total = raws.reduce((n, r) => n + r.rows.length, 0);
    const replaced = ds.sources.reduce((n, s) => n + s.replaced, 0);
    expect(ds.records.length).toBe(total - replaced);
    expect(replaced).toBeGreaterThan(10);
    expect(replaced).toBeLessThan(60);
    expect(ds.records.some((r) => r.date?.startsWith("2025-03"))).toBe(true);
  });

  it("has hitches for all of 2025 even though its list has only start dates", () => {
    const h = ds.hitches.find((x) => x.start === "2025-04-17");
    expect(h).toMatchObject({ end: "2025-04-24", days: 8, inferred: false });
    expect(ds.records.filter((r) => r.date?.startsWith("2025") && r.hitchId !== null).length).toBeGreaterThan(20_000);
  });

  it("still treats Oct 15–22, 2026 as the current hitch", () => {
    expect(focusHitch(ds, "2026-10-21")!.start).toBe("2026-10-15");
  });

  it("keeps 2025 rows out of the upload queue", () => {
    expect(ds.records.filter(awaitingUpload).every((r) => r.source.includes("2026"))).toBe(true);
  });

  it("reads 2025's extra task names", () => {
    const tasks = new Set(ds.records.map((r) => r.task));
    for (const odd of ["QC / OTHER", "PCI GO BACK", "FINAL STAKING"]) expect(tasks.has(odd)).toBe(false);
    expect(ds.opcos.find((o) => o.name === "ONCOR SRP")?.umbrella).toBe("Oncor");
  });

  it("labels every issue with its workbook", () => {
    expect(new Set(ds.issues.map((i) => i.source))).toEqual(new Set(["TSG Field Tracker - Master 2025.xlsx", "TSG Field Tracker - Master 2026.xlsx"]));
  });
});
