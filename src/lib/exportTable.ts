/**
 * Table exports: every table on the dashboard can be saved as an Excel file. Cells are React
 * nodes, so a column without an `exportValue` is exported as the text its cell shows.
 */
import { isValidElement, type ReactNode } from "react";

export type ExportCell = string | number | null;
export type ExportSheet = { name: string; headers: string[]; rows: ExportCell[][] };

/** The text a cell shows: strings and numbers inside it, joined, including simple components. */
export function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) {
    const { type, props } = node as { type: unknown; props: { children?: ReactNode } };
    // Small display components (StatusBadge) are plain functions of their props; render them.
    if (typeof type === "function") {
      try {
        return nodeText((type as (p: unknown) => ReactNode)(props));
      } catch {
        return "";
      }
    }
    return nodeText(props.children);
  }
  return "";
}

/** "1,234" → 1234 and "—" → null in number columns, so Excel can add them up. */
export function toNumber(text: string): ExportCell {
  const t = text.trim();
  if (t === "" || t === "—") return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : t;
}

/** Saves one or more sheets as an .xlsx download. */
export async function downloadWorkbook(fileName: string, sheets: ExportSheet[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const sheet of sheets) {
    const rows = sheet.rows.map((r) => r.map((v) => (typeof v === "string" && ISO_DATE.test(v) ? isoToDate(v) : v)));
    const ws = XLSX.utils.aoa_to_sheet([sheet.headers, ...rows], { cellDates: true, dateNF: "yyyy-mm-dd" });
    ws["!cols"] = sheet.headers.map((h, i) => ({
      wch: Math.min(48, Math.max(h.length, ...sheet.rows.slice(0, 500).map((r) => String(r[i] ?? "").length)) + 2),
    }));
    XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(sheet.name, used));
  }
  XLSX.writeFile(wb, `${safeFileName(fileName)}.xlsx`);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Midnight local time, which SheetJS writes as that calendar date. */
function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/** Excel sheet names: 31 characters, none of []:*?/\ and unique within the workbook. */
function uniqueSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 28) || "Sheet";
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base} ${i}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

export function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, "-").replace(/\s+/g, " ").trim() || "export";
}
