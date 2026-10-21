import { describe, expect, it } from "vitest";
import { trackerWorkbooks } from "@/file/access";

describe("trackerWorkbooks", () => {
  it("keeps master trackers with a year at the end, oldest first", () => {
    expect(
      trackerWorkbooks([
        "TSG Field Tracker - Master 2026.xlsx",
        "TSG Field Tracker - Master 2025.xlsx",
        "Some Report.xlsx",
        "TSG Field Tracker - Master 2027.XLSX",
      ]),
    ).toEqual(["TSG Field Tracker - Master 2025.xlsx", "TSG Field Tracker - Master 2026.xlsx", "TSG Field Tracker - Master 2027.XLSX"]);
  });

  it("ignores copies, drafts and workbooks without Master or a trailing year", () => {
    expect(
      trackerWorkbooks([
        "TSG Field Tracker - Master 2026 (backup).xlsx",
        "TSG Field Tracker - Master 2026 - Copy.xlsx",
        "TSG Field Tracker 2026.xlsx",
        "Master 2026 notes v2.xlsx",
        "~$TSG Field Tracker - Master 2026.xlsx",
        "TSG Field Tracker - Master.xlsx",
        "TSG Field Tracker - Master 12026.xlsx",
      ]),
    ).toEqual([]);
  });

  it("allows other naming, as long as it says Master and ends with the year", () => {
    expect(trackerWorkbooks(["Field Master Tracker_2028.xlsx", "master tracker 2029.xlsx"])).toEqual([
      "Field Master Tracker_2028.xlsx",
      "master tracker 2029.xlsx",
    ]);
  });
});
