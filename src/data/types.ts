/** Calendar date as `YYYY-MM-DD`. Dates carry no time or time zone. */
export type ISODate = string;

export type Status = "Complete" | "In Progress" | "Unknown";

/** One cleaned row of the TSG Field Tracker table. */
export type TrackerRecord = {
  /** Index into `Dataset.records`. */
  id: number;
  /** 1-based row number in the Excel sheet (used for saving and "find it in Excel"). */
  excelRow: number;
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

export type Dataset = {
  records: TrackerRecord[];
  issues: DataIssue[];
  hitches: Hitch[];
  permits: Permit[];
  people: Person[];
  teams: Team[];
  opcos: Opco[];
  /** Latest work date in the tracker. */
  dataThrough: ISODate | null;
  /** The date `buildDataset` treated as today. */
  today: ISODate;
};
