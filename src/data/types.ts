/** Calendar date as `YYYY-MM-DD`. Dates carry no time or time zone. */
export type ISODate = string;

export type Status = "Complete" | "In Progress" | "Unknown";

/** One cleaned row of the TSG Field Tracker table. */
export type TrackerRecord = {
  /** Index into `Dataset.records`. */
  id: number;
  /** 1-based row number in the Excel sheet (used for saving and "find it in Excel"). */
  excelRow: number;
  /** The workbook the row came from (file name). */
  source: string;
  /**
   * True for rows from the current year's workbook: the only one the upload queue uses and the
   * app may save to. Past years are read-only history.
   */
  editable: boolean;
  opco: string | null;
  umbrella: string | null;
  /** Permit ID as displayed (whitespace tidied); null when the cell is blank. */
  permitId: string | null;
  /** Comparison key shared by spelling variants; null for placeholders and blanks. */
  permitKey: string | null;
  /** "Coordinator" and "Drive Time" entries: logged time, not a permit. */
  isPlaceholder: boolean;
  /** The person who logged the row. */
  tech: string | null;
  /** Partner, or null when solo. */
  partner: string | null;
  date: ISODate | null;
  /** Index into `Dataset.hitches`, or null when the date is outside every hitch. */
  hitchId: number | null;
  /** 1-based day within the hitch. */
  hitchDay: number | null;
  task: string | null;
  status: Status;
  poles: number | null;
  hoursOnPermit: number | null;
  driveHours: number | null;
  totalHours: number | null;
  mileage: number | null;
  notes: string | null;
  uploaded: boolean;
};

export type IssueKind =
  /** The value was changed to a standard form; nothing for anyone to do. */
  | "fixed"
  /** Something looks wrong and should be checked in the tracker. */
  | "flag";

export type DataIssue = {
  /** Workbook the row is in. */
  source: string;
  excelRow: number;
  field: string;
  kind: IssueKind;
  code: string;
  message: string;
  /** The value as it appears in the workbook. */
  original: string;
};

export type Hitch = {
  id: number;
  start: ISODate;
  end: ISODate;
  /** Number of days, start and end included. */
  days: number;
  /** True when the date comes from continuing the pattern past the Validations list. */
  inferred: boolean;
};

export type Permit = {
  key: string;
  /** Most common spelling. */
  id: string;
  /** Other spellings found in the tracker. */
  variants: string[];
  opcos: string[];
  recordIds: number[];
  tasks: string[];
  firstDate: ISODate | null;
  lastDate: ISODate | null;
};

export type Person = {
  name: string;
  rowsAsLogger: number;
  rowsAsPartner: number;
  /** Rows logged with no partner. */
  rowsSolo: number;
  firstDate: ISODate | null;
  lastDate: ISODate | null;
};

/** The person who logs rows plus whoever they were paired with, within one hitch. */
export type Team = {
  hitchId: number;
  logger: string;
  /** Partners during the hitch; empty when the logger worked solo the whole hitch. */
  partners: string[];
  recordIds: number[];
  /** Days with at least one solo row. */
  soloDays: number;
};

export type Opco = {
  name: string;
  umbrella: string | null;
  variants: string[];
  recordCount: number;
};

/**
 * One row of a field-queue sheet (RM# CNP, Entergy schedules): work received and waiting to be
 * fielded. These sheets are a snapshot of what's waiting now, not a history.
 */
export type ScopeItem = {
  sheet: string;
  /** OPCO the queue belongs to, as spelled in the tracker. */
  opco: string;
  /** Circuit, work order description or permit, as written. */
  key: string;
  /** Comparison key, same rules as Permit IDs. */
  permitKey: string;
  status: string | null;
  poles: number | null;
  goBackPoles: number | null;
  city: string | null;
  state: string | null;
  priority: string | null;
  workOrder: string | null;
  received: ISODate | null;
  due: ISODate | null;
  /** 1-based row on its sheet. */
  excelRow: number;
};

/** One tracker workbook that was loaded (one per year). */
export type SourceInfo = {
  name: string;
  /** Year from the file name ("… Master 2026.xlsx"), if it has one. */
  year: number | null;
  /** The newest workbook: editable, feeds the upload queue. */
  current: boolean;
  /** Data rows in the workbook. */
  rows: number;
  /** Rows dropped because a newer workbook has the same row (years overlap around New Year). */
  replaced: number;
  firstDate: ISODate | null;
  lastDate: ISODate | null;
};

export type Dataset = {
  /** Workbooks loaded, oldest first; the last one is current. */
  sources: SourceInfo[];
  records: TrackerRecord[];
  issues: DataIssue[];
  hitches: Hitch[];
  permits: Permit[];
  people: Person[];
  teams: Team[];
  opcos: Opco[];
  /** Field-queue rows from the scope sheets. */
  scope: ScopeItem[];
  /** Latest work date in the tracker. */
  dataThrough: ISODate | null;
  /** The date `buildDataset` treated as today. */
  today: ISODate;
};
