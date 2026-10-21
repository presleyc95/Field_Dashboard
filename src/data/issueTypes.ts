/**
 * Plain-language names for data-quality issue codes, and what to do about each flag. Codes come
 * from clean.ts and model.ts.
 */
export type IssueType = { title: string; help: string };

export const ISSUE_TYPES: Record<string, IssueType> = {
  // Flags: something to check in the tracker.
  "missing-status": { title: "Missing status", help: "Set Status to Complete or In Progress." },
  "unknown-status": { title: "Status not recognized", help: "Use Complete or In Progress." },
  "possible-duplicate": {
    title: "Both partners logged the same job",
    help: "One row normally covers the pair. Delete one row, or set it to the other person's work, so poles aren't counted twice.",
  },
  "bad-number": { title: "Text in a number column", help: "Move notes to the Notes column and enter just the number." },
  "permit-as-date": {
    title: "Permit ID turned into a date",
    help: "Excel reformatted it. Set the cell to Text and re-type the Permit ID from the original paperwork.",
  },
  "missing-permit": { title: "Missing Permit ID", help: "Enter the Permit ID." },
  "missing-task": { title: "Missing task", help: "Pick the task from the list." },
  "unknown-task": { title: "Task not recognized", help: "Pick a task from the tracker's list (KATAPULT, PCI, GO BACKS…)." },
  "missing-date": { title: "Missing date", help: "Enter the work date." },
  "bad-date": { title: "Date can't be read", help: "Re-enter the date as a date (e.g. 10/20/2026)." },
  "future-date": { title: "Date in the future", help: "Check the year or month; it's probably a typo." },
  "outside-tracker-year": {
    title: "Dated outside the tracker's year",
    help: "Check the date; a row this far from the tracker's year is usually a typo.",
  },
  "missing-tech": { title: "Missing tech name", help: "Enter who did the work." },
  "missing-opco": { title: "Missing OPCO", help: "Pick the OPCO." },

  // Fixed: handled by the dashboard, listed so nothing changes silently.
  "permit-whitespace": { title: "Extra spaces or line breaks in Permit ID", help: "Read without them." },
  "permit-spelling": { title: "Permit ID spelled another way", help: "Matched to the most common spelling." },
  "opco-spelling": { title: "OPCO spelled another way", help: "Read as the most common spelling." },
  "name-spelling": { title: "Name spelled another way", help: "Read as the most common spelling." },
  "task-spelling": { title: "Task spelled another way", help: "Read as the standard task name." },
  "status-spelling": { title: "Status spelled another way", help: "Read as Complete / In Progress." },
  "text-number": { title: "Number stored as text", help: "Read as a number." },
  "text-date": { title: "Date stored as text", help: "Read as a date." },
  "replaced-by-newer": {
    title: "Also in the next year's tracker",
    help: "The years overlap around New Year; the newer tracker's copy is used.",
  },
};

export function issueType(code: string): IssueType {
  return ISSUE_TYPES[code] ?? { title: code, help: "" };
}
