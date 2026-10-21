import { describe, expect, it } from "vitest";
import { awaitingUpload } from "@/data/metrics";
import { buildDataset } from "@/data/model";
import type { RawTrackerRow, RawWorkbook } from "@/data/parse";
import { dailyReport, defaultReportDate, hitchReport, personDays } from "@/data/reports";
import type { Dataset } from "@/data/types";
import { nodeText, toNumber } from "@/lib/exportTable";

// Excel serials: 46310 = 2026-10-15 (hitch day 1), 46311 = day 2, 46312 = day 3.
function dataset(rows: Partial<Record<keyof RawTrackerRow, unknown>>[]): Dataset {
  const raw: RawWorkbook = {
    headerRow: 1,
    columns: {},
    hitches: [{ start: "2026-10-15", end: "2026-10-22" }],
    rows: rows.map((r, i) => {
      const row = { excelRow: i + 2 } as RawTrackerRow;
      const values = { opco: "ONCOR", permitId: `P${i}`, tech: "Alex", date: 46310, task: "PCI", status: "Complete", poles: 10, ...r };
      for (const [k, v] of Object.entries(values)) (row as Record<string, unknown>)[k] = { v };
      return row;
    }),
  };
  return buildDataset(raw, "2026-10-21");
}

describe("upload queue: finished jobs only", () => {
  const ds = dataset([
    // Job A: In Progress then Complete → its Complete row is ready.
    { permitId: "A", date: 46310, status: "In Progress" },
    { permitId: "A", date: 46311, status: "Complete" },
    // Job B: marked Complete on day 1 but picked back up on day 2 → not ready.
    { permitId: "B", date: 46310, status: "Complete" },
    { permitId: "B", date: 46311, status: "In Progress" },
    // Same permit, different task: its own job.
    { permitId: "B", date: 46310, status: "Complete", task: "KATAPULT" },
  ]);

  it("queues the Complete row of a finished job and nothing of an unfinished one", () => {
    const queued = ds.records.filter(awaitingUpload).map((r) => `${r.permitId}/${r.task}/${r.date}`);
    expect(queued).toEqual(["A/PCI/2026-10-16", "B/KATAPULT/2026-10-15"]);
  });
});

describe("reports", () => {
  const ds = dataset([
    { tech: "Alex", partner: "Sam", date: 46310, poles: 20, opco: "ONCOR" },
    { tech: "Jo", date: 46310, poles: 10, opco: "AEP TEXAS" },
    { tech: "Alex", partner: "Sam", date: 46311, poles: 30, opco: "ONCOR", status: "In Progress" },
    { tech: "Alex", date: 46312, poles: 5, opco: "AEP TEXAS", permitId: "P0" },
  ]);

  it("breaks a person's production down by day, newest first", () => {
    const days = personDays(ds.records.filter((r) => r.tech === "Sam" || r.partner === "Sam"), "Sam");
    expect(days.map((d) => [d.date, d.poles, d.partners])).toEqual([
      ["2026-10-16", 30, ["Alex"]],
      ["2026-10-15", 20, ["Alex"]],
    ]);
  });

  it("opens the daily report on yesterday, or the latest day with data", () => {
    expect(defaultReportDate(ds, "2026-10-18")).toBe("2026-10-17");
    expect(defaultReportDate(ds, "2026-10-21")).toBe("2026-10-17");
  });

  it("sums one day by team and compares it with the hitch so far", () => {
    const r = dailyReport(ds, "2026-10-16");
    expect(r.totals.poles).toBe(30);
    expect(r.hitchDay).toBe(2);
    expect(r.hitchAverage).toBe(30); // day 1: 30 poles
    expect(r.previousDate).toBe("2026-10-15");
    expect(r.nextDate).toBe("2026-10-17");
    expect(r.teams.map((t) => [t.key, t.poles, t.completed])).toEqual([["Alex + Sam", 30, 0]]);
  });

  it("summarizes a hitch by project and team", () => {
    const r = hitchReport(ds, 0);
    expect(r.totals.poles).toBe(65);
    expect(r.projects.map((p) => [p.key, p.poles, p.teamNames])).toEqual([
      ["ONCOR", 50, ["Alex + Sam"]],
      ["AEP TEXAS", 15, ["Jo", "Alex"]],
    ]);
    expect(r.teams.map((t) => [t.key, t.poles, t.opcos])).toEqual([
      ["Alex + Sam", 50, ["ONCOR"]],
      ["Jo", 10, ["AEP TEXAS"]],
      ["Alex", 5, ["AEP TEXAS"]],
    ]);
    expect(r.daily.map((d) => d.poles)).toEqual([30, 30, 5]);
  });
});

describe("table export", () => {
  it("reads the text a cell shows", () => {
    expect(nodeText(["Row ", 12, null, false])).toBe("Row 12");
    expect(toNumber("1,234")).toBe(1234);
    expect(toNumber("—")).toBeNull();
    expect(toNumber("2026 · 12")).toBe("2026 · 12");
  });
});
