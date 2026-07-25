import PptxGenJS from "pptxgenjs";
import type { ReportPackage } from "../types";

const FOOTER = "Evidence first. Explainable always. Officer decides.";

export async function exportReportPptx(report: ReportPackage): Promise<Blob> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";

  const addFooter = (slide: PptxGenJS.Slide) => {
    slide.addText(FOOTER, {
      x: 0.4,
      y: 7.0,
      w: 12.5,
      h: 0.3,
      fontSize: 9,
      italic: true,
      color: "6B7280",
    });
    slide.addText(report.provenanceLine, {
      x: 0.4,
      y: 7.25,
      w: 12.5,
      h: 0.3,
      fontSize: 8,
      color: "94A3B8",
    });
  };

  // Cover
  const cover = pptx.addSlide();
  cover.background = { color: "0F172A" };
  cover.addText(report.title, {
    x: 0.5,
    y: 2.2,
    w: 12,
    h: 1.5,
    fontSize: 36,
    bold: true,
    color: "FFFFFF",
  });
  cover.addText(`${report.reportTypeLabel} · ${report.periodLabel}`, {
    x: 0.5,
    y: 3.8,
    w: 12,
    h: 0.5,
    fontSize: 18,
    color: "94A3B8",
  });
  cover.addText(
    `Generated ${new Date(report.generatedAt).toISOString().slice(0, 16).replace("T", " ")} by ${report.officer} · confidence ${report.overallConfidence}%`,
    { x: 0.5, y: 4.4, w: 12, h: 0.4, fontSize: 12, color: "CBD5F5" },
  );
  addFooter(cover);

  for (const s of report.sections) {
    const slide = pptx.addSlide();
    slide.addText(s.title, {
      x: 0.4,
      y: 0.3,
      w: 12.5,
      h: 0.6,
      fontSize: 22,
      bold: true,
      color: "0F172A",
    });
    if (s.body) {
      slide.addText(s.body, {
        x: 0.4,
        y: 1.0,
        w: 12.5,
        h: 1.2,
        fontSize: 13,
        color: "1F2937",
      });
    }
    if (s.bullets?.length) {
      slide.addText(
        s.bullets.slice(0, 10).map((b) => ({ text: b, options: { bullet: true } })),
        { x: 0.5, y: 2.2, w: 12.3, h: 4.4, fontSize: 12, color: "1F2937" },
      );
    }
    if (s.columns && s.rows?.length) {
      const header = s.columns.map((c) => ({
        text: String(c),
        options: { bold: true, fill: { color: "E2E8F0" } },
      }));
      const body = s.rows
        .slice(0, 10)
        .map((r) => s.columns!.map((c) => ({ text: String(r[c] ?? "") })));
      slide.addTable([header, ...body], {
        x: 0.4,
        y: 2.2,
        w: 12.5,
        fontSize: 10,
        border: { pt: 0.5, color: "CBD5F5" },
      });
    }
    addFooter(slide);
  }

  const arrayBuffer = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  return new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}
