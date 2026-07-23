/**
 * Client-side export of the latest Adaptive Briefing to a PDF.
 * One-click, no server round-trip. The PDF mirrors the on-screen briefing
 * structure so it is safe for sharing and archival.
 */
import jsPDF from "jspdf";

import type { AdaptiveBriefing } from "@/components/copilot/briefing/types";

const MARGIN_X = 48;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 64;
const LINE_GAP = 4;

const COLORS = {
  navy: [15, 30, 66] as const,
  ink: [24, 33, 46] as const,
  muted: [96, 108, 128] as const,
  rule: [210, 216, 226] as const,
  accent: [10, 102, 194] as const,
  danger: [176, 42, 55] as const,
};

const PRIORITY_LABELS: Record<string, string> = {
  immediate: "Immediate",
  today: "Today",
  monitor: "Monitor",
  archive: "Archive",
};

function setColor(pdf: jsPDF, kind: "text" | "draw" | "fill", rgb: readonly [number, number, number]) {
  const [r, g, b] = rgb;
  if (kind === "text") pdf.setTextColor(r, g, b);
  else if (kind === "draw") pdf.setDrawColor(r, g, b);
  else pdf.setFillColor(r, g, b);
}

interface Cursor {
  y: number;
  page: number;
}

function ensureSpace(pdf: jsPDF, cursor: Cursor, needed: number) {
  const pageHeight = pdf.internal.pageSize.getHeight();
  if (cursor.y + needed > pageHeight - MARGIN_BOTTOM) {
    drawFooter(pdf, cursor.page);
    pdf.addPage();
    cursor.page += 1;
    cursor.y = MARGIN_TOP;
    drawHeader(pdf);
  }
}

function drawHeader(pdf: jsPDF) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  setColor(pdf, "fill", COLORS.navy);
  pdf.rect(0, 0, pageWidth, 28, "F");
  setColor(pdf, "text", [255, 255, 255]);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("SEAPHORE — NIMASA COPILOT", MARGIN_X, 18);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text("Operational Intelligence Briefing", pageWidth - MARGIN_X, 18, { align: "right" });
}

function drawFooter(pdf: jsPDF, pageNumber: number) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  setColor(pdf, "draw", COLORS.rule);
  pdf.setLineWidth(0.4);
  pdf.line(MARGIN_X, pageHeight - 42, pageWidth - MARGIN_X, pageHeight - 42);

  setColor(pdf, "text", COLORS.muted);
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(8);
  pdf.text(
    "Evidence first. Explainable always. Officer decides.",
    MARGIN_X,
    pageHeight - 28,
  );
  pdf.setFont("helvetica", "normal");
  pdf.text(`Page ${pageNumber}`, pageWidth - MARGIN_X, pageHeight - 28, {
    align: "right",
  });
}

function drawTitle(pdf: jsPDF, cursor: Cursor, briefing: AdaptiveBriefing) {
  setColor(pdf, "text", COLORS.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("Operational Briefing", MARGIN_X, cursor.y);
  cursor.y += 20;

  setColor(pdf, "text", COLORS.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  const generated = new Date().toUTCString();
  pdf.text(`Generated ${generated}`, MARGIN_X, cursor.y);
  cursor.y += 12;

  const classification = briefing.classification;
  if (classification) {
    const parts: string[] = [];
    if (classification.typeBadge) parts.push(`Type: ${classification.typeBadge}`);
    if (classification.tier) parts.push(`Tier: ${classification.tier}`);
    if (typeof classification.compositeConfidence === "number")
      parts.push(`Confidence: ${Math.round(classification.compositeConfidence * 100)}%`);
    if (classification.evidenceStrength) parts.push(`Evidence: ${classification.evidenceStrength}`);
    if (parts.length) {
      pdf.text(parts.join("   ·   "), MARGIN_X, cursor.y);
      cursor.y += 12;
    }
  }

  setColor(pdf, "text", COLORS.ink);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Query", MARGIN_X, cursor.y);
  cursor.y += 12;

  setColor(pdf, "text", COLORS.ink);
  pdf.setFont("helvetica", "normal");
  writeParagraph(pdf, cursor, briefing.query ?? "(no query captured)", 10.5);
  cursor.y += 6;

  setColor(pdf, "draw", COLORS.rule);
  pdf.setLineWidth(0.6);
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.line(MARGIN_X, cursor.y, pageWidth - MARGIN_X, cursor.y);
  cursor.y += 14;
}

function writeParagraph(pdf: jsPDF, cursor: Cursor, text: string, fontSize = 10.5) {
  if (!text) return;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const maxWidth = pageWidth - MARGIN_X * 2;
  pdf.setFontSize(fontSize);
  const lines = pdf.splitTextToSize(text, maxWidth) as string[];
  const lineHeight = fontSize + LINE_GAP;
  for (const line of lines) {
    ensureSpace(pdf, cursor, lineHeight);
    pdf.text(line, MARGIN_X, cursor.y);
    cursor.y += lineHeight;
  }
}

function writeSectionTitle(pdf: jsPDF, cursor: Cursor, title: string) {
  ensureSpace(pdf, cursor, 24);
  setColor(pdf, "text", COLORS.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(title.toUpperCase(), MARGIN_X, cursor.y);
  cursor.y += 6;
  setColor(pdf, "draw", COLORS.accent);
  pdf.setLineWidth(0.8);
  pdf.line(MARGIN_X, cursor.y, MARGIN_X + 40, cursor.y);
  cursor.y += 12;
  setColor(pdf, "text", COLORS.ink);
  pdf.setFont("helvetica", "normal");
}

function writeBullet(pdf: jsPDF, cursor: Cursor, text: string, fontSize = 10) {
  if (!text) return;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const bulletIndent = 12;
  const maxWidth = pageWidth - MARGIN_X * 2 - bulletIndent;
  pdf.setFontSize(fontSize);
  const lines = pdf.splitTextToSize(text, maxWidth) as string[];
  const lineHeight = fontSize + LINE_GAP;
  ensureSpace(pdf, cursor, lineHeight);
  setColor(pdf, "text", COLORS.accent);
  pdf.text("•", MARGIN_X, cursor.y);
  setColor(pdf, "text", COLORS.ink);
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) ensureSpace(pdf, cursor, lineHeight);
    pdf.text(lines[i], MARGIN_X + bulletIndent, cursor.y);
    cursor.y += lineHeight;
  }
}

function safeFilename(query: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const slug = (query || "briefing")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "briefing";
  return `seaphore-briefing-${slug}-${stamp}.pdf`;
}

export function exportBriefingToPdf(briefing: AdaptiveBriefing): string {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const cursor: Cursor = { y: MARGIN_TOP, page: 1 };
  drawHeader(pdf);
  drawTitle(pdf, cursor, briefing);

  if (briefing.executive?.text) {
    writeSectionTitle(pdf, cursor, "Executive Summary");
    writeParagraph(pdf, cursor, briefing.executive.text);
    cursor.y += 6;
  }

  if (briefing.criticalFindings?.length) {
    writeSectionTitle(pdf, cursor, "Key Findings");
    for (const f of briefing.criticalFindings) {
      const priority = PRIORITY_LABELS[f.priority] ?? f.priority ?? "";
      writeBullet(
        pdf,
        cursor,
        `[${priority}] ${f.title}${f.source ? `  —  ${f.source}` : ""}${f.grade ? `  (${f.grade})` : ""}`,
      );
      if (f.citations?.length) {
        for (const c of f.citations) {
          const excerpt = c.excerpt ? ` — "${c.excerpt}"` : "";
          writeParagraph(
            pdf,
            cursor,
            `      ↳ ${c.source} · ${c.grade}${excerpt}`,
            9,
          );
        }
      }
    }
    cursor.y += 6;
  }

  if (briefing.analytical?.text) {
    writeSectionTitle(pdf, cursor, "Analytical Assessment");
    writeParagraph(pdf, cursor, briefing.analytical.text);
    cursor.y += 6;
  }

  if (briefing.whyChain?.length) {
    writeSectionTitle(pdf, cursor, "Reasoning");
    briefing.whyChain.forEach((step, i) => {
      const label = `${step.step}  (${step.from} → ${step.to})`;
      writeBullet(pdf, cursor, `${i + 1}. ${label}`);
    });
    cursor.y += 6;
  }

  if (briefing.counterHypotheses?.length) {
    writeSectionTitle(pdf, cursor, "Counter-Hypotheses");
    for (const h of briefing.counterHypotheses) writeBullet(pdf, cursor, h);
    cursor.y += 6;
  }

  if (briefing.intelligenceGaps?.length) {
    writeSectionTitle(pdf, cursor, "Intelligence Gaps");
    for (const g of briefing.intelligenceGaps) writeBullet(pdf, cursor, g);
    cursor.y += 6;
  }

  if (briefing.decisionImpact) {
    writeSectionTitle(pdf, cursor, "Decision Impact");
    const impact = briefing.decisionImpact;
    const pct = (n: number) => `${Math.round((n ?? 0) * 100)}%`;
    writeBullet(pdf, cursor, `Revenue impact: ${pct(impact.revenue)}`);
    writeBullet(pdf, cursor, `Security impact: ${pct(impact.security)}`);
    writeBullet(pdf, cursor, `Operational impact: ${pct(impact.operational)}`);
    writeBullet(pdf, cursor, `Cargo impact: ${pct(impact.cargo)}`);
    cursor.y += 6;
  }

  if (briefing.decisionRequired) {
    writeSectionTitle(pdf, cursor, "Decision Required");
    writeParagraph(
      pdf,
      cursor,
      `Deadline: ${briefing.decisionRequired.deadline}  ·  Risk if deferred: ${briefing.decisionRequired.risk}`,
    );
    cursor.y += 6;
  }

  if (briefing.officerActions?.length) {
    writeSectionTitle(pdf, cursor, "Recommended Officer Actions");
    for (const a of briefing.officerActions) {
      const line = a.description ? `${a.label} — ${a.description}` : a.label;
      writeBullet(pdf, cursor, line);
    }
    cursor.y += 6;
  }

  if (briefing.nextQuestions?.length) {
    writeSectionTitle(pdf, cursor, "Suggested Next Questions");
    for (const q of briefing.nextQuestions) writeBullet(pdf, cursor, q);
  }

  drawFooter(pdf, cursor.page);

  const filename = safeFilename(briefing.query ?? "");
  pdf.save(filename);
  return filename;
}
