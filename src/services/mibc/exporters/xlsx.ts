import * as XLSX from "xlsx";
import type { ReportPackage } from "../types";

export function exportReportXlsx(report: ReportPackage): Blob {
  const wb = XLSX.utils.book_new();

  // Cover sheet
  const cover = [
    ["Seaphore Maritime Intelligence Briefing Centre"],
    [report.title],
    [`${report.reportTypeLabel} · ${report.periodLabel}`],
    [`Generated`, new Date(report.generatedAt).toISOString()],
    [`Officer`, report.officer],
    [`Confidence`, `${report.overallConfidence}%`],
    [`Investigations`, report.sourceInvestigationIds.join(", ")],
    [],
    ["Evidence first. Explainable always. Officer decides."],
    [report.provenanceLine],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cover), "Cover");

  for (const s of report.sections) {
    const rows: (string | number)[][] = [[s.title]];
    if (s.body) rows.push([s.body]);
    if (s.bullets?.length) {
      rows.push([]);
      for (const b of s.bullets) rows.push([b]);
    }
    if (s.columns && s.rows?.length) {
      rows.push([]);
      rows.push(s.columns);
      for (const r of s.rows) rows.push(s.columns.map((c) => (r[c] ?? "") as string | number));
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const name = s.title.slice(0, 28) || s.id.slice(0, 28);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
