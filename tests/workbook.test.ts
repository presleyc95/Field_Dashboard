/**
 * Checks against the real tracker. The workbook is never committed, so these tests run only
 * where it exists: set FIELD_TRACKER to its path, or keep a copy named
 * "TSG Field Tracker - Master 2026.xlsx" in the project folder. Elsewhere (e.g. GitHub Actions)
 * they're skipped.
 *
 * Expected counts come from profiling the 2026-10-21 copy; they're ranges so the tests keep
 * passing as the admin adds rows.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { hitchStatus, HitchIndex } from "@/data/hitches";
import { buildDataset } from "@/data/model";
import { readWorkbook, type RawWorkbook } from "@/data/parse";
import type { Dataset } from "@/data/types";

const WORKBOOK = process.env.FIELD_TRACKER ?? resolve(__dirname, "..", "TSG Field Tracker - Master 2026.xlsx");
const TODAY = "2026-10-21";

describe.skipIf(!existsSync(WORKBOOK))("real tracker workbook", () => {
  let raw: RawWorkbook;
  let ds: Dataset;

  beforeAll(() => {
    raw = readWorkbook(readFileSync(WORKBOOK));
    ds = buildDataset(raw, TODAY);
  });

  it("finds the tracker columns by header and keeps Excel row numbers", () => {
    expect(raw.headerRow).toBe(1);
    expect(raw.columns.permitId).toBe(1);
    expect(raw.columns.uploaded).toBe(13); // column N
    expect(raw.rows.length).toBeGreaterThanOrEqual(20_500);
    expect(raw.rows[0]!.excelRow).toBe(2);
    expect(ds.records.every((r, i) => r.id === i)).toBe(true);
  });

  it("reads the hitch list from Validations and continues it", () => {
    expect(raw.hitches.length).toBeGreaterThanOrEqual(50);
    expect(raw.hitches[0]).toEqual({ start: "2025-01-09", end: "2025-01-16" });
    const listed = ds.hitches.filter((h) => !h.inferred);
    expect(listed.every((h) => h.days === 8)).toBe(true);
    expect(ds.hitches.some((h) => h.inferred)).toBe(true);
    expect(ds.hitches.at(-1)!.start > "2027-02-01").toBe(true);
  });

  it("puts 2026-10-21 on day 7 of the Oct 15–22 hitch", () => {
    const status = hitchStatus(new HitchIndex(ds.hitches), TODAY);
    expect(status.kind).toBe("on");
    if (status.kind === "on") {
      expect([status.hitch.start, status.hitch.end, status.day]).toEqual(["2026-10-15", "2026-10-22", 7]);
    }
  });

  it("places about 94% of dated rows inside a hitch", () => {
    const dated = ds.records.filter((r) => r.date);
    const inHitch = dated.filter((r) => r.hitchId !== null).length / dated.length;
    expect(inHitch).toBeGreaterThan(0.9);
    expect(inHitch).toBeLessThan(0.99);
  });

  it("reports data through the latest work date", () => {
    expect(ds.dataThrough! >= "2026-10-20").toBe(true);
    expect(ds.dataThrough! <= TODAY).toBe(true);
  });

  it("merges OPCO spellings and assigns umbrellas", () => {
    const names = ds.opcos.map((o) => o.name);
    expect(names).toContain("Georgia Power");
    expect(names).not.toContain("Georgia power");
    expect(names).not.toContain("apco");
    expect(ds.opcos.find((o) => o.name === "APCO")?.umbrella).toBe("AEP");
    expect(ds.opcos.find((o) => o.name === "ONCOR ENGINEERING")?.umbrella).toBe("Oncor");
    expect(ds.records.filter((r) => r.opco === "ONCOR").length).toBeGreaterThan(9_000);
  });

  it("standardizes tasks and statuses", () => {
    const tasks = new Set(ds.records.map((r) => r.task));
    for (const odd of ["pci", "Staking", "GO BACK", "go back", "Go-Back", "Katapult", "Drive"]) {
      expect(tasks.has(odd)).toBe(false);
    }
    expect(ds.records.filter((r) => r.task === "KATAPULT").length).toBeGreaterThan(8_000);
    expect(new Set(ds.records.map((r) => r.status))).toEqual(new Set(["Complete", "In Progress", "Unknown"]));
  });

  it("counts uploads the way the tracker does", () => {
    const uploaded = ds.records.filter((r) => r.uploaded).length;
    expect(uploaded).toBeGreaterThan(10_700);
    expect(uploaded).toBeLessThan(ds.records.length);
  });

  it("builds about 13,250 permits, merging spelling variants", () => {
    expect(ds.permits.length).toBeGreaterThan(13_000);
    expect(ds.permits.length).toBeLessThan(13_250);
    expect(ds.permits.some((p) => p.variants.length > 0)).toBe(true);
    expect(ds.permits.some((p) => /COORDINATOR|^DRIVE TIME$/.test(p.key))).toBe(false);
    expect(ds.records.filter((r) => r.isPlaceholder).length).toBeGreaterThan(1_100);
  });

  it("shows every task on a long-running permit", () => {
    const permit = ds.permits.find((p) => p.key === "2025-031-0735");
    expect(permit).toBeDefined();
    expect(new Set(permit!.tasks)).toEqual(new Set(["KATAPULT", "GO BACKS", "PCI", "DRIVE TIME"]));
    expect(permit!.recordIds).toHaveLength(6);
  });

  it("includes people who only ever appear as partners", () => {
    const partnerOnly = ds.people.filter((p) => p.rowsAsLogger === 0 && p.rowsAsPartner > 0);
    expect(ds.people.length).toBeGreaterThan(80);
    expect(partnerOnly.length).toBeGreaterThan(25);
  });

  it("builds teams per hitch from Tech Name and Paired With", () => {
    const current = ds.teams.filter((t) => ds.hitches[t.hitchId]!.start === "2026-10-15");
    expect(current.length).toBeGreaterThan(20);
    expect(current.some((t) => t.partners.length === 0)).toBe(true);
    expect(current.some((t) => t.partners.length === 1)).toBe(true);
  });

  it("flags the few rows where both partners logged the same job", () => {
    // Coordinator and Drive Time rows aren't permits, so they never count as duplicates.
    const dupes = ds.issues.filter((i) => i.code === "possible-duplicate");
    expect(dupes.length).toBeGreaterThan(0);
    expect(dupes.length).toBeLessThan(100);
  });

  it("flags Permit IDs Excel turned into dates", () => {
    const asDate = ds.issues.filter((i) => i.code === "permit-as-date");
    expect(asDate.length).toBeGreaterThanOrEqual(4);
    expect(asDate.some((i) => i.original === "Mar-41")).toBe(true);
  });

  it("logs the known data problems", () => {
    const codes = new Set(ds.issues.map((i) => i.code));
    for (const code of [
      "missing-status",
      "opco-spelling",
      "task-spelling",
      "permit-whitespace",
      "possible-duplicate",
      "paired-with-self",
      "bad-number",
    ]) {
      expect(codes.has(code), code).toBe(true);
    }
  });
});
