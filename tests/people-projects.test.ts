import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadDataset } from "@/data/load";
import { focusHitch } from "@/data/metrics";
import { buildDataset } from "@/data/model";
import { type RawTrackerRow, type RawWorkbook, readWorkbook } from "@/data/parse";
import { buildProfile, consistencyOf, peopleDirectory } from "@/data/people";
import { findProject, projectList, summarizeProject } from "@/data/projects";
import type { Dataset, ScopeItem } from "@/data/types";

// 46310 = 2026-10-15, day 1 of the current hitch; 46296 = 2026-10-01, the previous one.
function dataset(rows: Partial<Record<keyof RawTrackerRow, unknown>>[], scope: Partial<ScopeItem>[] = []): Dataset {
  const raw: RawWorkbook = {
    headerRow: 1,
    columns: {},
    hitches: [
      { start: "2026-10-01", end: "2026-10-08" },
      { start: "2026-10-15", end: "2026-10-22" },
    ],
    rows: rows.map((r, i) => {
      const row = { excelRow: i + 2 } as RawTrackerRow;
      const values = { opco: "ONCOR", permitId: `P${i}`, tech: "Alex", date: 46310, task: "PCI", status: "Complete", poles: 10, ...r };
      for (const [k, v] of Object.entries(values)) (row as Record<string, unknown>)[k] = { v };
      return row;
    }),
    scope: scope.map((s, i) => ({
      sheet: "RM4 CNP",
      opco: "CenterPoint",
      key: `C${i}`,
      permitKey: `C${i}`,
      status: "Ready to Field",
      poles: 100,
      goBackPoles: null,
      city: null,
      state: null,
      priority: null,
      workOrder: null,
      received: null,
      due: null,
      excelRow: i + 2,
      ...s,
    })),
  };
  return buildDataset(raw, "2026-10-21");
}

describe("profiles", () => {
  const ds = dataset([
    { tech: "Alex", partner: "Sam", poles: 40, opco: "APCO" },
    { tech: "Alex", partner: "Sam", poles: 20, opco: "APCO", date: 46311 },
    { tech: "Alex", poles: 30, opco: "ONCOR", date: 46296 },
    { tech: "Jo", partner: "Alex", poles: 5, opco: "ONCOR", date: 46297 },
  ]);
  const alex = buildProfile(ds, ds.people.find((p) => p.name === "Alex")!);

  it("credits a person with every row they're on", () => {
    expect(alex.totals.poles).toBe(95);
    expect(alex.totals.techDays).toBe(4);
    expect(alex.hitchesWorked).toBe(2);
  });

  it("finds the most-worked OPCO by days, and frequent partners", () => {
    expect(alex.mostWorkedOpco).toEqual({ name: "APCO", techDays: 2 });
    expect(alex.partners.map((p) => [p.name, p.days, p.poles])).toEqual([
      ["Sam", 2, 60],
      ["Jo", 1, 5],
    ]);
  });

  it("finds the best hitch", () => {
    expect(alex.bestHitch?.hitch.start).toBe("2026-10-15");
    expect(alex.bestHitch?.poles).toBe(60);
  });

  it("lists everyone in the directory, partner-only people included", () => {
    const dir = peopleDirectory(ds);
    expect(dir.map((p) => p.name)).toEqual(["Alex", "Sam", "Jo"]);
    expect(dir.find((p) => p.name === "Sam")).toMatchObject({ poles: 60, partnerOnly: true, topOpco: "APCO" });
  });
});

describe("consistencyOf", () => {
  it("needs five production days", () => {
    const ds = dataset([{ poles: 10 }, { poles: 20, date: 46311 }]);
    expect(consistencyOf(ds.records).label).toBe("Too few days");
  });

  it("rates steady and variable output", () => {
    const steady = dataset([46296, 46297, 46298, 46299, 46300].map((date) => ({ date, poles: 50 })));
    expect(consistencyOf(steady.records).label).toBe("Steady");
    const variable = dataset([46296, 46297, 46298, 46299, 46300].map((date, i) => ({ date, poles: i === 0 ? 200 : 2 })));
    expect(consistencyOf(variable.records).label).toBe("Variable");
  });
});

describe("projects", () => {
  const ds = dataset(
    [
      { opco: "CenterPoint", permitId: "C0", poles: 30, date: 46296 },
      { opco: "CenterPoint", permitId: "X1", poles: 70, date: 46297 },
      { opco: "CenterPoint", permitId: "X2", poles: 15 },
      { opco: "APCO", poles: 5 },
    ],
    [{ key: "C0", permitKey: "C0", poles: 100, due: "2026-10-30" }, { poles: 150, due: "2026-10-01" }, { poles: 50 }],
  );
  const focus = focusHitch(ds, "2026-10-21")!;

  it("finds OPCOs and umbrellas separately", () => {
    expect(findProject(ds, "centerpoint")).toEqual({ name: "CenterPoint", isUmbrella: false, opcos: ["CenterPoint"] });
    expect(findProject(ds, "aep", true)).toEqual({ name: "AEP", isUmbrella: true, opcos: ["APCO"] });
    expect(findProject(ds, "aep")).toBeNull();
    expect(findProject(ds, "nope", true)).toBeNull();
  });

  it("keeps the ONCOR OPCO apart from the Oncor umbrella", () => {
    const oncor = dataset([{ opco: "ONCOR" }, { opco: "ONCOR ENGINEERING" }]);
    expect(findProject(oncor, "ONCOR")).toEqual({ name: "ONCOR", isUmbrella: false, opcos: ["ONCOR"] });
    expect(findProject(oncor, "Oncor", true)).toEqual({ name: "Oncor", isUmbrella: true, opcos: ["ONCOR", "ONCOR ENGINEERING"] });
  });

  it("measures the queue against the last hitches' pace", () => {
    const s = summarizeProject(ds, findProject(ds, "CenterPoint")!, focus, "2026-10-21");
    expect(s.currentPoles).toBe(15);
    expect(s.pace).toEqual({ polesPerHitch: 100, hitchesCounted: 1 });
    expect(s.queuePoles).toBe(300);
    expect(s.queueHitches).toBe(3);
    // Done in the third hitch from now: Oct 15–22, Oct 29–Nov 5, Nov 12–19.
    expect(s.projectedFinish).toBe("2026-11-19");
  });

  it("links scope rows to tracker permits and flags due dates", () => {
    const s = summarizeProject(ds, findProject(ds, "CenterPoint")!, focus, "2026-10-21");
    expect(s.scope.map((r) => [r.key, r.risk, r.collected])).toEqual([
      ["C1", "overdue", 0],
      ["C0", "due-soon", 30],
      ["C2", null, 0],
    ]);
  });

  it("lists every OPCO with its queue", () => {
    const rows = projectList(ds, focus);
    expect(rows.find((r) => r.project.name === "CenterPoint")).toMatchObject({ poles: 115, currentPoles: 15, queuePoles: 300 });
    expect(rows.find((r) => r.project.name === "APCO")?.umbrella).toBe("AEP");
  });
});

const WORKBOOK = process.env.FIELD_TRACKER ?? resolve(__dirname, "..", "TSG Field Tracker - Master 2026.xlsx");

describe.skipIf(!existsSync(WORKBOOK))("people and projects in the real tracker", () => {
  let ds: Dataset;
  beforeAll(() => {
    ds = loadDataset(readFileSync(WORKBOOK), "2026-10-21");
  });

  it("doesn't read the field schedules by default", () => {
    expect(ds.scope).toEqual([]);
  });

  // The field schedules are switched off for now (READ_FIELD_SCHEDULES); these keep the reader
  // working for when they're turned back on.
  it("can still read the field-queue sheets when switched on", () => {
    const withScope = buildDataset(readWorkbook(readFileSync(WORKBOOK), true), "2026-10-21");
    const sheets = new Set(withScope.scope.map((s) => s.sheet));
    expect(sheets).toEqual(new Set(["RM1 CNP", "RM4 CNP", "Entergy Eng Field Schedule"]));
    expect(withScope.scope.filter((s) => s.sheet === "RM4 CNP")).toHaveLength(10);
    const bz03 = withScope.scope.find((s) => s.key === "BZ03")!;
    expect(bz03).toMatchObject({ opco: "CenterPoint", poles: 274, due: "2027-01-15", received: "2026-08-05", priority: "2" });

    const focus = focusHitch(withScope, "2026-10-21")!;
    const s = summarizeProject(withScope, findProject(withScope, "CenterPoint")!, focus, "2026-10-21");
    expect(s.queuePoles).toBeGreaterThan(2_000);
    expect(s.scope.some((r) => r.permit)).toBe(true);
  });

  it("builds a profile for every person", () => {
    for (const p of ds.people) {
      const profile = buildProfile(ds, p);
      expect(profile.records.length).toBeGreaterThan(0);
    }
    const dir = peopleDirectory(ds);
    expect(dir).toHaveLength(ds.people.length);
    expect(dir[0]!.poles).toBeGreaterThan(5_000);
  });
});
