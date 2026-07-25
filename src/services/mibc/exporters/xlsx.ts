import * as XLSX from "xlsx";
import type { ReportPackage } from "../types";

export function exportReportXlsx(report: ReportPackage): Blob {
  const wb = XLSX.utils.book_new();

  // Embed provenance in the workbook's core file properties so Excel
  // / Numbers surface source_uip_id, briefingId, officer, and engine
  // version in File > Info without opening any sheet.
  wb.Props = {
    Title: report.title,
    Subject: `${report.reportTypeLabel} · ${report.periodLabel}`,
    Author: report.officer,
    Company: `Seaphore MIBC ${report.engineVersion}`,
    Category: report.origin,
    Keywords: [
      `mibc:${report.engineVersion}`,
      `briefing:${report.briefingId ?? "—"}`,
      `officer:${report.officerId ?? "—"}`,
      `uip:${report.sourceUipIds.join("|") || "—"}`,
      `confidence:${report.overallConfidence}%`,
    ].join("; "),
    Comments: report.provenanceLine,
    LastAuthor: report.officer,
    CreatedDate: new Date(report.generatedAt),
  };

  // Cover sheet
  const cover = [
    ["Seaphore Maritime Intelligence Briefing Centre"],
    [report.title],
    [`${report.reportTypeLabel} · ${report.periodLabel}`],
    ["Generated", new Date(report.generatedAt).toISOString()],
    ["Officer", report.officer],
    ["Officer ID", report.officerId ?? "—"],
    ["Briefing ID", report.briefingId ?? "—"],
    ["MIBC engine version", report.engineVersion],
    ["Report origin", report.origin],
    ["Confidence", `${report.overallConfidence}%`],
    ["Source UIP ids", report.sourceUipIds.join(", ") || "—"],
    ["Investigations", report.sourceInvestigationIds.join(", ") || "—"],
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
