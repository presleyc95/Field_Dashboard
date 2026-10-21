/** Permit summaries and search against the real tracker (skipped where it doesn't exist). */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadDataset } from "@/data/load";
import { summarizePermit } from "@/data/permitSummary";
import { parseQuery, SearchIndex } from "@/data/search";
import type { Dataset } from "@/data/types";

const WORKBOOK = process.env.FIELD_TRACKER ?? resolve(__dirname, "..", "TSG Field Tracker - Master 2026.xlsx");

describe.skipIf(!existsSync(WORKBOOK))("permits in the real tracker", () => {
  let ds: Dataset;
  let index: SearchIndex;

  beforeAll(() => {
    ds = loadDataset(readFileSync(WORKBOOK), "2026-10-21");
    index = new SearchIndex(ds);
  });

  const permit = (key: string) => {
    const p = ds.permits.find((x) => x.key === key);
    if (!p) throw new Error(`no permit ${key}`);
    return p;
  };

  it("summarizes a long-running permit task by task", () => {
    const s = summarizePermit(ds, permit("2025-031-0735"));
    expect(s.records.map((r) => r.date)).toEqual([
      "2026-01-22",
      "2026-01-23",
      "2026-03-08",
      "2026-06-25",
      "2026-08-19",
      "2026-08-20",
    ]);
    expect(s.firstDate).toBe("2026-01-22");
    expect(s.lastDate).toBe("2026-08-20");
    expect(s.daysOpen).toBe(211);
    expect(s.poles).toBe(161);

    const katapult = s.tasks.find((t) => t.task === "KATAPULT")!;
    expect(katapult.poles).toBe(91); // 70 + 21 over two days
    expect(katapult.days).toBe(2);
    expect(katapult.latestStatus).toBe("In Progress");
    expect(s.overall).toBe("In progress");
    expect(s.flags.some((f) => f.code === "stalled" && f.message.startsWith("KATAPULT"))).toBe(true);

    expect(s.tasks.find((t) => t.task === "PCI")).toMatchObject({ poles: 58, uploadsDone: 2, uploadsTotal: 2 });
    expect(s.people).toHaveLength(5);
  });

  it("marks gaps longer than a hitch cycle in the timeline", () => {
    const s = summarizePermit(ds, permit("2025-031-0735"));
    const gaps = s.timeline.filter((e) => e.kind === "gap");
    expect(gaps.map((g) => g.kind === "gap" && g.days)).toEqual([44, 109, 55]);
  });

  it("finds that permit from part of its number", () => {
    const { hits } = index.permits(parseQuery("0735"));
    expect(hits.some((h) => h.permit.key === "2025-031-0735")).toBe(true);
    expect(index.permits(parseQuery("2025-031-0735")).hits[0]!.permit.key).toBe("2025-031-0735");
  });

  it("matches permits whose IDs had line breaks", () => {
    const { hits } = index.permits(parseQuery("90723013 R26P16 NORTH VICTORIA"));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.tier).toBeLessThanOrEqual(1);
  });

  it("filters by umbrella", () => {
    const { total } = index.permits(parseQuery("opco:aep"));
    expect(total).toBeGreaterThan(1_000);
    expect(total).toBeLessThan(ds.permits.length);
  });

  it("gives every permit an overall status", () => {
    const counts: Record<string, number> = {};
    for (const p of ds.permits) {
      const s = summarizePermit(ds, p);
      counts[s.overall] = (counts[s.overall] ?? 0) + 1;
    }
    expect(Object.keys(counts).sort()).toEqual(["Awaiting upload", "Complete", "In progress", "Unknown"]);
    expect(counts.Complete!).toBeGreaterThan(counts["In progress"]!);
  });
});
