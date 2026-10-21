import { describe, expect, it } from "vitest";
import { buildHitches, HitchIndex, hitchStatus } from "@/data/hitches";

const LISTED = [
  { start: "2026-10-01", end: "2026-10-08" },
  { start: "2026-10-15", end: "2026-10-22" },
  { start: "2026-10-29", end: "2026-11-05" },
];

describe("buildHitches", () => {
  it("keeps listed hitches and measures their length", () => {
    const hitches = buildHitches(LISTED, "2026-11-05");
    expect(hitches).toHaveLength(3);
    expect(hitches[1]).toEqual({ id: 1, start: "2026-10-15", end: "2026-10-22", days: 8, inferred: false });
  });

  it("continues the pattern past the end of the list", () => {
    const hitches = buildHitches(LISTED, "2026-12-01");
    const inferred = hitches.filter((h) => h.inferred);
    expect(inferred.map((h) => [h.start, h.end])).toEqual([
      ["2026-11-12", "2026-11-19"],
      ["2026-11-26", "2026-12-03"],
    ]);
  });

  it("sorts the list and drops overlapping or backwards entries", () => {
    const hitches = buildHitches(
      [LISTED[2]!, LISTED[0]!, { start: "2026-10-05", end: "2026-10-09" }, { start: "2026-10-20", end: "2026-10-10" }],
      "2026-01-01",
    );
    expect(hitches.map((h) => h.start)).toEqual(["2026-10-01", "2026-10-29"]);
  });
});

describe("HitchIndex", () => {
  const index = new HitchIndex(buildHitches(LISTED, "2026-11-05"));

  it("finds the hitch and day for a date", () => {
    expect(index.find("2026-10-15")?.day).toBe(1);
    expect(index.find("2026-10-21")?.day).toBe(7);
    expect(index.find("2026-10-22")?.day).toBe(8);
    expect(index.find("2026-10-23")).toBeNull();
  });

  it("reports on- and off-hitch status", () => {
    const on = hitchStatus(index, "2026-10-21");
    expect(on.kind === "on" && on.hitch.start === "2026-10-15" && on.day === 7).toBe(true);

    const off = hitchStatus(index, "2026-10-25");
    expect(off.kind).toBe("off");
    if (off.kind === "off") {
      expect(off.previous?.start).toBe("2026-10-15");
      expect(off.next?.start).toBe("2026-10-29");
    }
  });
});
