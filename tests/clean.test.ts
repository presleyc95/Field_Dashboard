import { describe, expect, it } from "vitest";
import {
  cleanDate,
  cleanName,
  cleanNumber,
  cleanPermit,
  cleanStatus,
  cleanTask,
  cleanUploaded,
  IssueLog,
  SpellingPicker,
} from "@/data/clean";
import { umbrellaFor } from "@/data/umbrellas";

const cell = (v: unknown, w?: string) => ({ v, w });

describe("cleanTask", () => {
  it.each([
    ["KATAPULT", "KATAPULT", false],
    ["Katapult", "KATAPULT", true],
    ["pci", "PCI", true],
    ["Staking", "STAKING", true],
    ["GO BACK", "GO BACKS", true],
    ["go back", "GO BACKS", true],
    ["Go-Back", "GO BACKS", true],
    ["DRIVE TIME (MOB/DEMOB)", "DRIVE TIME", false],
    ["DRIVE TIME (MOB/DEMOB) 0", "DRIVE TIME", true],
    ["Drive", "DRIVE TIME", true],
    ["Coordination", "COORDINATION", false],
  ])("%s → %s", (raw, expected, reported) => {
    const log = new IssueLog();
    expect(cleanTask(cell(raw), 2, log)).toBe(expected);
    expect(log.issues.length > 0).toBe(reported);
  });

  it("flags unknown and missing tasks", () => {
    const log = new IssueLog();
    expect(cleanTask(cell("SURVEY"), 2, log)).toBe("SURVEY");
    expect(cleanTask(undefined, 3, log)).toBeNull();
    expect(log.issues.map((i) => i.code)).toEqual(["unknown-task", "missing-task"]);
  });
});

describe("cleanStatus", () => {
  it("standardizes spellings and flags the rest", () => {
    const log = new IssueLog();
    expect(cleanStatus(cell("Complete"), 2, log)).toBe("Complete");
    expect(cleanStatus(cell("in progress"), 2, log)).toBe("In Progress");
    expect(cleanStatus(cell(0), 2, log)).toBe("Unknown");
    expect(cleanStatus(undefined, 2, log)).toBe("Unknown");
    expect(log.issues.map((i) => i.code)).toEqual(["status-spelling", "unknown-status", "missing-status"]);
  });

  it("doesn't flag a blank status when none is required", () => {
    const log = new IssueLog();
    expect(cleanStatus(undefined, 2, log, false)).toBe("Unknown");
    expect(log.issues).toEqual([]);
  });
});

describe("cleanUploaded", () => {
  it("only Yes counts as uploaded", () => {
    expect(cleanUploaded(cell("Yes"))).toBe(true);
    expect(cleanUploaded(cell(" yes "))).toBe(true);
    for (const v of [0, "0", "Na", "n/a", "", null]) expect(cleanUploaded(cell(v))).toBe(false);
    expect(cleanUploaded(undefined)).toBe(false);
  });
});

describe("cleanNumber", () => {
  it("reads numbers, converts text numbers and flags junk", () => {
    const log = new IssueLog();
    expect(cleanNumber(cell(4.75), "Total", 2, log)).toBe(4.75);
    expect(cleanNumber(cell(" 12 "), "Total", 2, log)).toBe(12);
    expect(cleanNumber(cell("abc"), "Total", 2, log)).toBeNull();
    expect(cleanNumber(cell(""), "Total", 2, log)).toBeNull();
    expect(log.issues.map((i) => i.code)).toEqual(["text-number", "bad-number"]);
  });
});

describe("cleanDate", () => {
  it("converts Excel serials and date text", () => {
    const log = new IssueLog();
    expect(cleanDate(cell(46027, "1/5/26"), 2, log)).toBe("2026-01-05");
    expect(cleanDate(cell("10/5/2026"), 2, log)).toBe("2026-10-05");
    expect(cleanDate(cell("soon"), 2, log)).toBeNull();
    expect(cleanDate(undefined, 2, log)).toBeNull();
    expect(log.issues.map((i) => i.code)).toEqual(["text-date", "bad-date", "missing-date"]);
  });
});

describe("cleanPermit", () => {
  it("tidies line breaks and Excel escapes into one key", () => {
    const log = new IssueLog();
    const a = cleanPermit(cell("90723013 R26P16 NORTH VICTORIA\r\n  94CN1470"), 2, log);
    const b = cleanPermit(cell("90723013 R26P16 north victoria_x000D_\n 94CN1470"), 3, log);
    expect(a.text).toBe("90723013 R26P16 NORTH VICTORIA 94CN1470");
    expect(a.key).toBe(b.key);
    expect(log.issues.every((i) => i.code === "permit-whitespace")).toBe(true);
  });

  it("treats Coordinator and Drive Time as placeholders", () => {
    const log = new IssueLog();
    expect(cleanPermit(cell("Coordinator"), 2, log)).toEqual({ text: "Coordinator", key: null, isPlaceholder: true });
    expect(cleanPermit(cell(" Drive Time "), 2, log).isPlaceholder).toBe(true);
  });

  it("reads numeric permits as displayed and flags ones Excel turned into dates", () => {
    const log = new IssueLog();
    expect(cleanPermit(cell(6057640, "6057640"), 2, log).key).toBe("6057640");
    expect(cleanPermit(cell(46027, "1/5/26"), 3, log).text).toBe("1/5/26");
    expect(log.issues.map((i) => i.code)).toEqual(["permit-as-date"]);
  });
});

describe("cleanName", () => {
  it("treats N/A and blanks as no partner", () => {
    expect(cleanName(cell("N/A"))).toBeNull();
    expect(cleanName(cell("  "))).toBeNull();
    expect(cleanName(cell(" Jane  Doe "))).toBe("Jane Doe");
  });
});

describe("SpellingPicker", () => {
  it("picks the most common spelling in each group", () => {
    const picker = new SpellingPicker();
    ["Georgia Power", "Georgia Power", "Georgia power", "APCO", "apco", "APCO"].forEach((s) => picker.add(s));
    expect(picker.pick("Georgia power")).toBe("Georgia Power");
    expect(picker.pick("apco")).toBe("APCO");
    expect(picker.variants("APCO")).toEqual(["apco"]);
  });
});

describe("umbrellaFor", () => {
  it("groups related OPCOs and leaves others alone", () => {
    expect(umbrellaFor("APCO")).toBe("AEP");
    expect(umbrellaFor("aep resiliency (srp)")).toBe("AEP");
    expect(umbrellaFor("ONCOR ENGINEERING")).toBe("Oncor");
    expect(umbrellaFor("GIGAPOWER")).toBeNull();
  });
});
