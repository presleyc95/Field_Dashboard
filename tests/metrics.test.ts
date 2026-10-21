import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadDataset } from "@/data/load";
import {
  awaitingUpload,
  commandCenter,
  dailyPoles,
  focusHitch,
  groupRecords,
  summarizeHitches,
  teamKey,
  totals,
} from "@/data/metrics";
import { buildDataset } from "@/data/model";
import type { RawTrackerRow, RawWorkbook } from "@/data/parse";
import type { Dataset } from "@/data/types";

// Excel serials: 46310 = 2026-10-15 (hitch day 1), 46311 = day 2.
function dataset(rows: Partial<Record<keyof RawTrackerRow, unknown>>[]): Dataset {
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
  };
  return buildDataset(raw, "2026-10-21");
}

describe("totals", () => {
  const ds = dataset([
    { tech: "Alex", partner: "Sam", poles: 40 },
    { tech: "Alex", partner: "Sam", poles: 20, permitId: "P9" },
    { tech: "Jo", poles: 30, hoursOnPermit: 3 },
    { tech: "Jo", task: "DRIVE TIME (MOB/DEMOB)", poles: 0, permitId: "Drive Time", driveHours: 2 },
    { tech: "Jo", date: 46311, poles: 10 },
  ]);
  const t = totals(ds.records);

  it("counts each row's poles once and credits both partners", () => {
    expect(t.poles).toBe(100);
    expect(t.creditedPoles).toBe(160); // 60 × 2 + 40
  });

  it("counts tech-days from production rows only", () => {
    // Alex day 1, Sam day 1, Jo day 1, Jo day 2 (the drive-time row adds nothing)
    expect(t.techDays).toBe(4);
    expect(t.polesPerTechDay).toBe(40);
  });

  it("counts people, teams and permits", () => {
    expect(t.people).toBe(3);
    expect(t.teams).toBe(2);
    expect(t.permits).toBe(4);
    expect(t.driveHours).toBe(2);
  });
});

describe("groupRecords", () => {
  const ds = dataset([
    { tech: "Alex", partner: "Sam", poles: 40, opco: "APCO" },
    { tech: "Sam", partner: "Alex", poles: 20 },
    { tech: "Jo", poles: 30, task: "KATAPULT" },
  ]);

  it("groups pairs as one team regardless of who logged", () => {
    const teams = groupRecords(ds.records, "team");
    expect(teams.map((g) => [g.key, g.poles])).toEqual([
      ["Alex + Sam", 60],
      ["Jo", 30],
    ]);
  });

  it("credits each person with their rows' poles", () => {
    const people = groupRecords(ds.records, "person");
    expect(people.map((g) => [g.key, g.poles, g.techDays])).toEqual([
      ["Alex", 60, 1],
      ["Sam", 60, 1],
      ["Jo", 30, 1],
    ]);
  });

  it("groups by umbrella and task", () => {
    expect(groupRecords(ds.records, "umbrella").map((g) => [g.key, g.poles])).toEqual([
      ["Oncor", 50],
      ["AEP", 40],
    ]);
    expect(groupRecords(ds.records, "task").map((g) => [g.key, g.poles])).toEqual([
      ["PCI", 60],
      ["KATAPULT", 30],
    ]);
  });
});

describe("hitch comparisons", () => {
  const ds = dataset([
    { date: 46296, poles: 5 }, // Oct 1, previous hitch day 1
    { date: 46297, poles: 7 }, // Oct 2, previous day 2
    { date: 46303, poles: 100 }, // Oct 8, previous day 8 (outside the comparison window)
    { date: 46310, poles: 6 }, // Oct 15, current day 1
    { date: 46311, poles: 9, status: "Complete", task: "KATAPULT", uploaded: "" },
  ]);

  it("compares the current hitch with the same days of the last one", () => {
    const hitch = focusHitch(ds, "2026-10-21")!;
    expect(hitch.start).toBe("2026-10-15");
    const s = commandCenter(ds, hitch.id);
    expect(s.daysCovered).toBe(2); // data through Oct 16
    expect(s.now.poles).toBe(15);
    expect(s.then?.poles).toBe(12);
  });

  it("lists daily poles up to the data date", () => {
    const hitch = ds.hitches.find((h) => h.start === "2026-10-15")!;
    expect(dailyPoles(ds, hitch).map((d) => [d.day, d.poles])).toEqual([
      [1, 6],
      [2, 9],
    ]);
  });

  it("counts the upload backlog", () => {
    expect(ds.records.filter(awaitingUpload)).toHaveLength(5);
  });

  it("labels hitches past, current and upcoming", () => {
    const states = summarizeHitches(ds, "2026-10-21").map((h) => [h.hitch.start, h.state]);
    expect(states.slice(0, 2)).toEqual([
      ["2026-10-01", "past"],
      ["2026-10-15", "current"],
    ]);
    expect(states.at(-1)![1]).toBe("upcoming");
  });
});

describe("teamKey", () => {
  it("is the same whichever partner logged", () => {
    const ds = dataset([
      { tech: "Sam", partner: "Alex" },
      { tech: "Alex", partner: "Sam" },
    ]);
    expect(teamKey(ds.records[0]!)).toBe(teamKey(ds.records[1]!));
  });
});

const WORKBOOK = process.env.FIELD_TRACKER ?? resolve(__dirname, "..", "TSG Field Tracker - Master 2026.xlsx");

describe.skipIf(!existsSync(WORKBOOK))("metrics on the real tracker", () => {
  let ds: Dataset;
  beforeAll(() => {
    ds = loadDataset(readFileSync(WORKBOOK), "2026-10-21");
  });

  it("summarizes the current hitch against the last one", () => {
    const hitch = focusHitch(ds, "2026-10-21")!;
    const s = commandCenter(ds, hitch.id);
    expect(s.current.start).toBe("2026-10-15");
    expect(s.daysCovered).toBe(6); // data through Oct 20
    expect(s.now.poles).toBeGreaterThan(5_000);
    expect(s.then!.poles).toBeGreaterThan(5_000);
    expect(s.now.polesPerTechDay!).toBeGreaterThan(5);
    expect(s.now.polesPerTechDay!).toBeLessThan(200);
    expect(s.backlog.rows).toBeGreaterThan(1_000);
  });

  it("adds up the year's poles consistently", () => {
    const all = totals(ds.records).poles;
    const byOpco = groupRecords(ds.records, "opco").reduce((n, g) => n + g.poles, 0);
    const byTask = groupRecords(ds.records, "task").reduce((n, g) => n + g.poles, 0);
    expect(byOpco).toBe(all);
    expect(byTask).toBe(all);
    expect(all).toBeGreaterThan(150_000);
  });

  it("has production in every past hitch of 2026", () => {
    const past = summarizeHitches(ds, "2026-10-21").filter((h) => h.state === "past" && h.hitch.start >= "2026-01-08");
    expect(past.length).toBeGreaterThan(15);
    expect(past.every((h) => h.poles > 0)).toBe(true);
  });
});
