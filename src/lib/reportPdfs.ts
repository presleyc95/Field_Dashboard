/** Turns report data into the PDF layout (see pdf.ts). */
import { formatShort } from "@/data/dates";
import type { DailyReport, HitchReport, TeamLine } from "@/data/reports";
import { formatInt, formatNumber, formatRate, hitchRange } from "./format";
import { downloadPdfReport, type PdfReport, type PdfSection } from "./pdf";

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Tuesday, October 20, 2026" */
export function longDate(iso: string): string {
  return WEEKDAY.format(new Date(`${iso}T00:00:00Z`));
}

const hours = (n: number) => formatNumber(Math.round(n * 10) / 10);

export function downloadHitchReport(r: HitchReport, state: string) {
  return downloadPdfReport(hitchReportPdf(r, state));
}

export function downloadDailyReport(r: DailyReport) {
  return downloadPdfReport(dailyReportPdf(r));
}

export function hitchReportPdf(r: HitchReport, state: string): PdfReport {
  const t = r.totals;
  const sections: PdfSection[] = [
    {
      kind: "table",
      title: "Projects worked",
      note: `${r.projects.length} OPCOs`,
      headers: ["OPCO", "Umbrella", "Poles", "Permits", "Jobs done", "Teams", "Tech-days", "Hours"],
      numeric: [2, 3, 4, 5, 6, 7],
      totalRow: true,
      rows: [
        ...r.projects.map((p) => [p.key, p.umbrella ?? "", formatInt(p.poles), formatInt(p.permits), formatInt(p.jobsCompleted), formatInt(p.teamNames.length), formatInt(p.techDays), hours(p.permitHours)]),
        ["Total", "", formatInt(t.poles), formatInt(t.permits), formatInt(r.jobsCompleted), formatInt(t.teams), formatInt(t.techDays), hours(t.permitHours)],
      ],
    },
    teamSection(r.teams, "Teams", t.poles),
    {
      kind: "bars",
      title: "Poles by hitch day",
      note: r.daily.length < r.hitch.days ? `${r.daily.length} of ${r.hitch.days} days have data` : undefined,
      bars: r.daily.map((d) => ({ label: `D${d.day} ${formatShort(d.date)}`, value: d.poles })),
    },
    {
      kind: "table",
      title: "Poles by task",
      headers: ["Task", "Poles", "Share", "Permits", "Tech-days"],
      numeric: [1, 2, 3, 4],
      rows: r.tasks.map((g) => [g.key, formatInt(g.poles), share(g.poles, t.poles), formatInt(g.permits), formatInt(g.techDays)]),
    },
  ];
  return {
    fileName: `Hitch report ${r.hitch.start} to ${r.hitch.end}`,
    kicker: "Hitch report",
    title: hitchRange(r.hitch),
    subtitle: `${r.hitch.days}-day hitch · ${state}`,
    kpis: [
      { label: "Poles collected", value: formatInt(t.poles) },
      { label: "Poles / tech-day", value: formatRate(t.polesPerTechDay), note: `${formatInt(t.techDays)} tech-days` },
      { label: "Teams", value: formatInt(t.teams), note: `${formatInt(t.people)} people` },
      { label: "Projects", value: formatInt(r.projects.length), note: "OPCOs worked" },
      { label: "Permits worked", value: formatInt(t.permits) },
      { label: "Jobs completed", value: formatInt(r.jobsCompleted), note: "Permit + task marked Complete" },
      { label: "Hours on permit", value: formatInt(Math.round(t.permitHours)), note: `${formatRate(t.polesPerHour)} poles / hour` },
      { label: "Drive hours", value: formatInt(Math.round(t.driveHours)), note: `${formatInt(Math.round(t.mileage))} miles` },
    ],
    sections,
  };
}

export function dailyReportPdf(r: DailyReport): PdfReport {
  const t = r.totals;
  const vsAvg = r.hitchAverage ? (t.poles - r.hitchAverage) / r.hitchAverage : null;
  return {
    fileName: `Daily report ${r.date}`,
    kicker: "Daily production report",
    title: longDate(r.date),
    subtitle: r.hitch ? `Hitch ${hitchRange(r.hitch)}${r.hitchDay ? ` · day ${r.hitchDay} of ${r.hitch.days}` : ""}` : "Off hitch",
    kpis: [
      { label: "Poles collected", value: formatInt(t.poles), note: r.hitchAverage ? `Hitch avg so far ${formatRate(r.hitchAverage)}/day` : undefined },
      { label: "Vs. hitch average", value: vsAvg === null ? "—" : `${vsAvg >= 0 ? "+" : ""}${Math.round(vsAvg * 100)}%` },
      { label: "Teams", value: formatInt(t.teams), note: `${formatInt(t.people)} people` },
      { label: "Poles / tech-day", value: formatRate(t.polesPerTechDay), note: `${formatInt(t.techDays)} tech-days` },
      { label: "Permits worked", value: formatInt(t.permits) },
      { label: "Rows complete", value: formatInt(r.records.filter((x) => x.status === "Complete").length), note: `of ${formatInt(t.rows)} rows` },
      { label: "Hours on permit", value: hours(t.permitHours) },
      { label: "Drive hours", value: hours(t.driveHours), note: `${formatInt(Math.round(t.mileage))} miles` },
    ],
    sections: [
      {
        kind: "table",
        title: "Teams",
        note: `${r.teams.length} teams`,
        headers: ["Team", "Projects", "Tasks", "Permits", "Poles", "Share", "Hours", "Drive"],
        numeric: [3, 4, 5, 6, 7],
        widths: { 0: 150 },
        rows: r.teams.map((g) => [g.key, g.opcos.join(", "), g.tasks.join(", "), formatInt(g.permits), formatInt(g.poles), share(g.poles, t.poles), hours(g.permitHours), hours(g.driveHours)]),
      },
      {
        kind: "table",
        title: "By project",
        headers: ["OPCO", "Poles", "Permits", "Teams", "Hours"],
        numeric: [1, 2, 3, 4],
        rows: r.opcos.map((g) => [g.key, formatInt(g.poles), formatInt(g.permits), formatInt(g.teams), hours(g.permitHours)]),
      },
      {
        kind: "table",
        title: "Rows",
        note: `${formatInt(r.records.length)} rows`,
        headers: ["Permit", "OPCO", "Team", "Task", "Status", "Poles", "Hours", "Drive"],
        numeric: [5, 6, 7],
        widths: { 4: 62 },
        rows: [...r.records]
          .sort((a, b) => (a.tech ?? "").localeCompare(b.tech ?? "") || a.excelRow - b.excelRow)
          .map((x) => [
            x.permitId ?? "",
            x.opco ?? "",
            x.partner ? `${x.tech} + ${x.partner}` : (x.tech ?? ""),
            x.task ?? "",
            x.status,
            formatNumber(x.poles),
            formatNumber(x.hoursOnPermit),
            formatNumber(x.driveHours),
          ]),
      },
    ],
  };
}

function teamSection(teams: TeamLine[], title: string, total: number): PdfSection {
  // Hitch teams: how much each team collected over the hitch.
  return {
    kind: "table",
    title,
    note: `${teams.length} teams`,
    headers: ["Team", "Projects", "Poles", "Share", "Days", "Poles / day", "Permits", "Hours"],
    numeric: [2, 3, 4, 5, 6, 7],
    widths: { 0: 150 },
    rows: teams.map((g) => [
      g.key,
      g.opcos.join(", "),
      formatInt(g.poles),
      share(g.poles, total),
      formatInt(g.workDays),
      formatRate(g.workDays ? g.poles / g.workDays : null),
      formatInt(g.permits),
      hours(g.permitHours),
    ]),
  };
}

function share(part: number, total: number): string {
  return total ? `${Math.round((part / total) * 100)}%` : "—";
}
