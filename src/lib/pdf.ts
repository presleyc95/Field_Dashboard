/**
 * PDF reports (daily and end-of-hitch). Printed on white paper, so the dark dashboard theme isn't
 * used: black text, the orange accent for the header rule and bars. jsPDF loads only when a
 * report is downloaded.
 */
import { safeFileName } from "./exportTable";

export type PdfKpi = { label: string; value: string; note?: string };

export type PdfSection =
  | {
      kind: "table";
      title: string;
      note?: string;
      headers: string[];
      rows: (string | number)[][];
      /** Indexes of right-aligned (number) columns. */
      numeric?: number[];
      /** Bold last row (totals). */
      totalRow?: boolean;
      /** Fixed widths (pt) by column index. */
      widths?: Record<number, number>;
    }
  | { kind: "bars"; title: string; note?: string; bars: { label: string; value: number }[] };

export type PdfReport = {
  fileName: string;
  /** Small caps line above the title, e.g. "Hitch report". */
  kicker: string;
  title: string;
  subtitle?: string;
  kpis: PdfKpi[];
  sections: PdfSection[];
};

const ACCENT: [number, number, number] = [249, 115, 22];
const INK: [number, number, number] = [23, 23, 23];
const MUTED: [number, number, number] = [115, 115, 115];
const LINE: [number, number, number] = [212, 212, 212];
const MARGIN = 40;

export async function downloadPdfReport(report: PdfReport) {
  (await buildPdf(report)).save(`${safeFileName(report.fileName)}.pdf`);
}

/** Lays the report out; returns the jsPDF document. */
export async function buildPdf(report: PdfReport) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const inner = width - MARGIN * 2;
  let y = MARGIN;

  // Header
  doc.setFillColor(...ACCENT);
  doc.rect(MARGIN, y, 36, 3, "F");
  y += 18;
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
  doc.text(report.kicker.toUpperCase(), MARGIN, y, { charSpace: 1 });
  y += 22;
  doc.setFontSize(20).setTextColor(...INK);
  doc.text(report.title, MARGIN, y);
  if (report.subtitle) {
    y += 16;
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
    doc.text(report.subtitle, MARGIN, y);
  }
  y += 22;

  // KPI tiles, four to a row
  const perRow = 4;
  const gap = 8;
  const tileW = (inner - gap * (perRow - 1)) / perRow;
  const tileH = 50;
  report.kpis.forEach((k, i) => {
    const x = MARGIN + (i % perRow) * (tileW + gap);
    const ty = y + Math.floor(i / perRow) * (tileH + gap);
    doc.setDrawColor(...LINE).setLineWidth(0.75).roundedRect(x, ty, tileW, tileH, 3, 3, "S");
    doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(...MUTED);
    doc.text(k.label.toUpperCase(), x + 8, ty + 13, { charSpace: 0.5 });
    doc.setFontSize(15).setTextColor(...INK);
    doc.text(k.value, x + 8, ty + 32);
    if (k.note) {
      doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...MUTED);
      doc.text(doc.splitTextToSize(k.note, tileW - 16)[0] as string, x + 8, ty + 43);
    }
  });
  y += Math.ceil(report.kpis.length / perRow) * (tileH + gap) + 10;

  const sectionTitle = (title: string, note?: string) => {
    if (y > height - 120) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...INK);
    doc.text(title.toUpperCase(), MARGIN, y, { charSpace: 0.6 });
    if (note) {
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
      doc.text(note, width - MARGIN, y, { align: "right" });
    }
    y += 8;
  };

  for (const section of report.sections) {
    sectionTitle(section.title, section.note);
    if (section.kind === "table") {
      const numeric = new Set(section.numeric ?? []);
      const last = section.rows.length - 1;
      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN + 10 },
        head: [section.headers],
        body: section.rows.map((r) => r.map(String)),
        theme: "plain",
        styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 4, bottom: 4, left: 5, right: 5 }, textColor: INK, overflow: "linebreak" },
        headStyles: { fontStyle: "bold", fontSize: 7, textColor: MUTED, lineWidth: { bottom: 0.75 }, lineColor: INK },
        bodyStyles: { lineWidth: { bottom: 0.25 }, lineColor: LINE },
        columnStyles: Object.fromEntries(
          section.headers.map((_, i) => [i, { halign: numeric.has(i) ? ("right" as const) : ("left" as const), cellWidth: section.widths?.[i] ?? ("auto" as const) }]),
        ),
        didParseCell: (data) => {
          if (data.section === "head" && numeric.has(data.column.index)) data.cell.styles.halign = "right";
          if (data.section === "body" && section.totalRow && data.row.index === last) data.cell.styles.fontStyle = "bold";
        },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
    } else {
      const chartH = 110;
      if (y + chartH + 30 > height - MARGIN) {
        doc.addPage();
        y = MARGIN;
        sectionTitle(section.title, section.note);
      }
      y += 6;
      const max = Math.max(1, ...section.bars.map((b) => b.value));
      const slot = inner / Math.max(1, section.bars.length);
      const barW = Math.min(28, slot * 0.6);
      doc.setDrawColor(...LINE).setLineWidth(0.5).line(MARGIN, y + chartH, width - MARGIN, y + chartH);
      section.bars.forEach((b, i) => {
        const h = (b.value / max) * (chartH - 14);
        const x = MARGIN + i * slot + (slot - barW) / 2;
        doc.setFillColor(...ACCENT).rect(x, y + chartH - h, barW, h, "F");
        doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(...INK);
        doc.text(b.value.toLocaleString("en-US"), x + barW / 2, y + chartH - h - 3, { align: "center" });
        doc.setFont("helvetica", "normal").setTextColor(...MUTED);
        doc.text(b.label, x + barW / 2, y + chartH + 10, { align: "center" });
      });
      y += chartH + 34;
    }
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  const generated = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...MUTED);
    doc.text(`TSG Field Tracker · ${report.kicker} · generated ${generated}`, MARGIN, height - 22);
    doc.text(`Page ${i} of ${pages}`, width - MARGIN, height - 22, { align: "right" });
  }

  return doc;
}
