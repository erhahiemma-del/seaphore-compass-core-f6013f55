import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
} from "docx";
import type { ReportPackage } from "../types";

const FOOTER = "Evidence first. Explainable always. Officer decides.";

export async function exportReportDocx(report: ReportPackage): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(report.title)] }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${report.reportTypeLabel} · ${report.periodLabel} · confidence ${report.overallConfidence}%`,
          italics: true,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun(
          `Generated ${new Date(report.generatedAt).toISOString().slice(0, 16).replace("T", " ")} by ${report.officer}`,
        ),
      ],
    }),
    new Paragraph({ children: [new TextRun("")] }),
  );

  for (const s of report.sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(s.title)] }));
    if (s.body) children.push(new Paragraph(s.body));
    if (s.bullets?.length) {
      for (const b of s.bullets)
        children.push(new Paragraph({ text: b, bullet: { level: 0 } }));
    }
    if (s.columns && s.rows?.length) {
      const cols = s.columns;
      const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: cols.map(
              (c) =>
                new TableCell({
                  children: [
                    new Paragraph({ children: [new TextRun({ text: String(c), bold: true })] }),
                  ],
                }),
            ),
          }),
          ...s.rows.map(
            (row) =>
              new TableRow({
                children: cols.map(
                  (c) => new TableCell({ children: [new Paragraph(String(row[c] ?? ""))] }),
                ),
              }),
          ),
        ],
      });
      children.push(table);
    }
    children.push(new Paragraph({ children: [new TextRun("")] }));
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: FOOTER, italics: true, color: "666666" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: report.provenanceLine, italics: true, color: "888888" })],
    }),
  );

  // Embed provenance in the DOCX's document properties so recipients
  // see source_uip_id, briefingId, officer, and engine version in
  // Word's File > Info panel.
  const keywords = [
    `mibc:${report.engineVersion}`,
    `origin:${report.origin}`,
    `briefing:${report.briefingId ?? "—"}`,
    `officer:${report.officerId ?? "—"}`,
    `uip:${report.sourceUipIds.join("|") || "—"}`,
    `confidence:${report.overallConfidence}%`,
  ].join("; ");

  const doc = new Document({
    creator: `Seaphore MIBC ${report.engineVersion}`,
    title: report.title,
    subject: `${report.reportTypeLabel} · ${report.periodLabel}`,
    description: `Seaphore Maritime Intelligence Briefing. ${keywords}`,
    keywords,
    lastModifiedBy: report.officer,
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(doc);
  return blob;
}
