import { describe, expect, it } from "vitest";
import { buildDataset } from "@/data/model";
import type { RawTrackerRow, RawWorkbook } from "@/data/parse";
import { parseQuery, SearchIndex } from "@/data/search";

/** A tiny tracker: one row per entry, everything Complete unless given. */
function dataset(rows: Partial<Record<keyof RawTrackerRow, unknown>>[]) {
  const raw: RawWorkbook = {
    headerRow: 1,
    columns: {},
    hitches: [{ start: "2026-10-15", end: "2026-10-22" }],
    rows: rows.map((r, i) => {
      const row = { excelRow: i + 2 } as RawTrackerRow;
      const values = { opco: "ONCOR", tech: "Alex Reed", date: 46310, task: "PCI", status: "Complete", poles: 5, ...r };
      for (const [k, v] of Object.entries(values)) (row as Record<string, unknown>)[k] = { v };
      return row;
    }),
  };
  return buildDataset(raw, "2026-10-21");
}

describe("parseQuery", () => {
  it("splits field filters from text", () => {
    expect(parseQuery('0735 opco:aep tech:"jane doe" task:pci')).toEqual({
      text: "0735",
      filters: { opco: ["aep"], tech: ["jane doe"], task: ["pci"] },
    });
  });

  it("leaves unknown prefixes in the text", () => {
    expect(parseQuery("FTR#:5327744")).toEqual({ text: "FTR#:5327744", filters: {} });
    expect(parseQuery("wo:123").text).toBe("wo:123");
  });
});

describe("SearchIndex.permits", () => {
  const ds = dataset([
    { permitId: "2025-031-0735", date: 46300 },
    { permitId: "2025-031-07351", date: 46305 },
    { permitId: "X-2025-031-0735-B", date: 46310 },
    { permitId: "WCFL-06-009-4", opco: "AEP TX", tech: "Jane Doe", status: "In Progress" },
  ]);
  const index = new SearchIndex(ds);
  const ids = (q: string) => index.permits(parseQuery(q)).hits.map((h) => h.permit.id);

  it("ranks exact, then starts-with, then contains", () => {
    expect(ids("2025-031-0735")).toEqual(["2025-031-0735", "2025-031-07351", "X-2025-031-0735-B"]);
  });

  it("ignores punctuation and capitalization", () => {
    expect(ids("2025031 0735")[0]).toBe("2025-031-0735");
    expect(ids("wcfl06")).toEqual(["WCFL-06-009-4"]);
  });

  it("finds a permit from the end of its number", () => {
    expect(ids("0735")).toContain("2025-031-0735");
  });

  it("finds close spellings", () => {
    expect(ids("WCFL-06-009-5")).toContain("WCFL-06-009-4");
    expect(ids("WCLF 06 009")).toContain("WCFL-06-009-4");
    expect(ids("2025-013-0735")).toContain("2025-031-0735");
  });

  it("doesn't call unrelated short queries close", () => {
    expect(ids("ZZ99")).toEqual([]);
  });

  it("applies filters, alone or with text", () => {
    expect(ids("opco:aep")).toEqual(["WCFL-06-009-4"]);
    expect(ids("tech:jane")).toEqual(["WCFL-06-009-4"]);
    expect(ids("status:progress")).toEqual(["WCFL-06-009-4"]);
    expect(ids("0735 opco:aep")).toEqual([]);
  });
});

describe("SearchIndex people and OPCOs", () => {
  const ds = dataset([
    { permitId: "A1", tech: "Alex Reed", partner: "Sam Ortiz" },
    { permitId: "A2", tech: "Jordan Alexander", opco: "APCO" },
  ]);
  const index = new SearchIndex(ds);

  it("finds people by any part of their name, name-start first", () => {
    expect(index.people("alex").map((p) => p.name)).toEqual(["Alex Reed", "Jordan Alexander"]);
    expect(index.people("ortiz").map((p) => p.name)).toEqual(["Sam Ortiz"]);
  });

  it("finds OPCOs by name or umbrella", () => {
    expect(index.opcos("aep").map((o) => o.name)).toEqual(["APCO"]);
    expect(index.umbrellas("ae")).toEqual([{ name: "AEP", opcos: ["APCO"] }]);
  });
});
