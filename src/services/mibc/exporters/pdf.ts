import { jsPDF } from "jspdf";
import type { ReportPackage } from "../types";

const FOOTER = "Evidence first. Explainable always. Officer decides.";

export function exportReportPdf(report: ReportPackage): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const ensure = (h: number) => {
    if (y + h > pageH - 60) {
      addFooter();
      doc.addPage();
      y = margin;
    }
  };
  const addFooter = () => {
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(FOOTER, margin, pageH - 30);
    doc.text(report.provenanceLine, margin, pageH - 18);
    doc.setTextColor(0);
  };

  // Header
  doc.setFontSize(18);
  doc.text(report.title, margin, y);
  y += 22;
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`${report.reportTypeLabel} · ${report.periodLabel}`, margin, y);
  y += 14;
  doc.text(
    `Generated ${new Date(report.generatedAt).toISOString().replace("T", " ").slice(0, 16)} by ${report.officer} · confidence ${report.overallConfidence}%`,
    margin,
    y,
  );
  y += 8;
  doc.setTextColor(0);
  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 16;

  for (const s of report.sections) {
    ensure(30);
    doc.setFontSize(13);
    doc.text(s.title, margin, y);
    y += 16;
    doc.setFontSize(10);

    if (s.body) {
      const lines = doc.splitTextToSize(s.body, pageW - margin * 2) as string[];
      for (const line of lines) {
        ensure(14);
        doc.text(line, margin, y);
        y += 12;
      }
      y += 4;
    }
    if (s.bullets?.length) {
      for (const b of s.bullets) {
        const lines = doc.splitTextToSize(`• ${b}`, pageW - margin * 2 - 10) as string[];
        for (const line of lines) {
          ensure(14);
          doc.text(line, margin + 6, y);
          y += 12;
        }
      }
      y += 4;
    }
    if (s.columns && s.rows?.length) {
      const cols = s.columns;
      const colW = (pageW - margin * 2) / cols.length;
      ensure(16);
      doc.setFont("helvetica", "bold");
      cols.forEach((c, i) => doc.text(String(c), margin + i * colW, y));
      doc.setFont("helvetica", "normal");
      y += 12;
      doc.setDrawColor(230);
      doc.line(margin, y - 4, pageW - margin, y - 4);
      for (const row of s.rows) {
        ensure(14);
        cols.forEach((c, i) => {
          const val = String(row[c] ?? "");
          const truncated = val.length > 34 ? val.slice(0, 33) + "…" : val;
          doc.text(truncated, margin + i * colW, y);
        });
        y += 12;
      }
      y += 4;
    }
    y += 6;
  }

  addFooter();
  return doc.output("blob");
}
