/**
 * Maritime Intelligence Briefing Centre (MIBC) — public entry.
 *
 * Enterprise reporting engine. Reads ONLY from Investigation Workspaces
 * (which are themselves fed by OIE / OKL / IFE — never raw connectors).
 */
export * from "./types";
export { buildReport, type BuildReportInput } from "./engine";
export { parseReportRequest, type ParsedReportRequest } from "./nl";
export { exportReportPdf } from "./exporters/pdf";
export { exportReportDocx } from "./exporters/docx";
export { exportReportXlsx } from "./exporters/xlsx";
export { exportReportPptx } from "./exporters/pptx";

import type { ExportFormat, ReportPackage } from "./types";
import { exportReportPdf } from "./exporters/pdf";
import { exportReportDocx } from "./exporters/docx";
import { exportReportXlsx } from "./exporters/xlsx";
import { exportReportPptx } from "./exporters/pptx";

export async function exportReport(
  report: ReportPackage,
  format: ExportFormat,
): Promise<Blob> {
  switch (format) {
    case "PDF":
      return exportReportPdf(report);
    case "DOCX":
      return exportReportDocx(report);
    case "XLSX":
      return exportReportXlsx(report);
    case "PPTX":
      return exportReportPptx(report);
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
