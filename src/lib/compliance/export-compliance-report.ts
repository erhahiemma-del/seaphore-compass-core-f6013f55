/**
 * Client-side "Generate Compliance Report" export.
 *
 * Produces a paginated PDF summarising the current screening queue:
 *   • Executive assessment (aggregate posture, hit/review/clear breakdown)
 *   • Evidence summary (per-entity screening outcome, findings, providers)
 *
 * Pagination + scaling:
 *   1. Every entity row is measured before it is drawn so the block stays
 *      atomic across page breaks (no row torn in half).
 *   2. When the queue is large enough that a default-density layout would
 *      run long, the layout switches to a compact typography scale so
 *      more evidence lands per page without truncation.
 *   3. Continuation headers ("Evidence Summary (continued)") reappear at
 *      the top of each new page inside the Evidence section.
 *   4. Footers are stamped once at the end with "Page X of N".
 */
import jsPDF from "jspdf";

import type { ScreeningEntity, ScreeningStatus } from "@/stores/screening-queue.store";

const MARGIN_X = 48;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 64;

const COLORS = {
  navy: [15, 30, 66] as const,
  ink: [24, 33, 46] as const,
  muted: [96, 108, 128] as const,
  rule: [210, 216, 226] as const,
  accent: [10, 102, 194] as const,
  emerald: [22, 128, 90] as const,
  amber: [176, 118, 20] as const,
  danger: [176, 42, 55] as const,
};

const STATUS_LABEL: Record<ScreeningStatus, string> = {
  PENDING: "Queued",
  RUNNING: "Screening",
  CLEAR: "Clear",
  HIT: "Sanctions hit",
  REVIEW: "Review",
  ERROR: "Failed",
};

const STATUS_COLOR: Record<ScreeningStatus, readonly [number, number, number]> = {
  PENDING: COLORS.muted,
  RUNNING: COLORS.accent,
  CLEAR: COLORS.emerald,
  HIT: COLORS.danger,
  REVIEW: COLORS.amber,
  ERROR: COLORS.danger,
};

/**
 * Typography scale. Two presets — "default" for short queues and "compact"
 * for long ones — plus a small factor we apply to line-heights so the
 * whole layout tightens uniformly.
 */
interface LayoutScale {
  key: "default" | "compact";
  paragraphSize: number;
  paragraphLineGap: number;
  rowHeadSize: number;
  rowMetaSize: number;
  rowSummarySize: number;
  rowErrorSize: number;
  rowGap: number;
  sectionGap: number;
}

const LAYOUT_DEFAULT: LayoutScale = {
  key: "default",
  paragraphSize: 10.5,
  paragraphLineGap: 4,
  rowHeadSize: 11,
  rowMetaSize: 9,
  rowSummarySize: 10,
  rowErrorSize: 9.5,
  rowGap: 12,
  sectionGap: 6,
};

const LAYOUT_COMPACT: LayoutScale = {
  key: "compact",
  paragraphSize: 9.5,
  paragraphLineGap: 2.5,
  rowHeadSize: 9.5,
  rowMetaSize: 8,
  rowSummarySize: 9,
  rowErrorSize: 8.5,
  rowGap: 6,
  sectionGap: 4,
};

interface Cursor {
  y: number;
  page: number;
  /** true while we're inside the Evidence Summary section (drives continuation title). */
  inEvidence: boolean;
}

function setColor(pdf: jsPDF, kind: "text" | "draw" | "fill", rgb: readonly [number, number, number]) {
  const [r, g, b] = rgb;
  if (kind === "text") pdf.setTextColor(r, g, b);
  else if (kind === "draw") pdf.setDrawColor(r, g, b);
  else pdf.setFillColor(r, g, b);
}

function pageW(pdf: jsPDF) { return pdf.internal.pageSize.getWidth(); }
function pageH(pdf: jsPDF) { return pdf.internal.pageSize.getHeight(); }
function usableWidth(pdf: jsPDF) { return pageW(pdf) - MARGIN_X * 2; }
function usableHeight(pdf: jsPDF) { return pageH(pdf) - MARGIN_TOP - MARGIN_BOTTOM; }

function drawHeader(pdf: jsPDF) {
  const w = pageW(pdf);
  setColor(pdf, "fill", COLORS.navy);
  pdf.rect(0, 0, w, 28, "F");
  setColor(pdf, "text", [255, 255, 255]);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("SEAPHORE — COMPLIANCE REPORT", MARGIN_X, 18);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text("Sanctions screening · Officer briefing", w - MARGIN_X, 18, { align: "right" });
}

/** Draw the continuation title used at the top of new pages inside Evidence Summary. */
function drawEvidenceContinuation(pdf: jsPDF, cursor: Cursor) {
  setColor(pdf, "text", COLORS.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("EVIDENCE SUMMARY (CONTINUED)", MARGIN_X, cursor.y);
  cursor.y += 6;
  setColor(pdf, "draw", COLORS.accent);
  pdf.setLineWidth(0.8);
  pdf.line(MARGIN_X, cursor.y, MARGIN_X + 40, cursor.y);
  cursor.y += 10;
  setColor(pdf, "text", COLORS.ink);
  pdf.setFont("helvetica", "normal");
}

/**
 * If `needed` doesn't fit on the current page, open a new one. Redraws the
 * header on the new page, and — when we're mid-Evidence — the continuation
 * title. Footers are stamped once at the very end (Page X of N).
 */
function ensureSpace(pdf: jsPDF, cursor: Cursor, needed: number) {
  if (cursor.y + needed <= pageH(pdf) - MARGIN_BOTTOM) return;
  pdf.addPage();
  cursor.page += 1;
  cursor.y = MARGIN_TOP;
  drawHeader(pdf);
  if (cursor.inEvidence) drawEvidenceContinuation(pdf, cursor);
}

/** Split text into wrapped lines and return their total height at `fontSize`. */
function measureParagraph(pdf: jsPDF, text: string, fontSize: number, lineGap: number) {
  if (!text) return { lines: [] as string[], height: 0 };
  pdf.setFontSize(fontSize);
  const lines = pdf.splitTextToSize(text, usableWidth(pdf)) as string[];
  const lh = fontSize + lineGap;
  return { lines, height: lines.length * lh, lh };
}

function writeParagraph(
  pdf: jsPDF,
  cursor: Cursor,
  text: string,
  fontSize: number,
  lineGap: number,
) {
  if (!text) return;
  const { lines, lh } = measureParagraph(pdf, text, fontSize, lineGap);
  if (!lh) return;
  for (const line of lines) {
    ensureSpace(pdf, cursor, lh);
    pdf.text(line, MARGIN_X, cursor.y);
    cursor.y += lh;
  }
}

function writeSectionTitle(pdf: jsPDF, cursor: Cursor, title: string) {
  ensureSpace(pdf, cursor, 26);
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

function writeKV(pdf: jsPDF, cursor: Cursor, label: string, value: string) {
  const lh = 14;
  ensureSpace(pdf, cursor, lh);
  setColor(pdf, "text", COLORS.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.text(label, MARGIN_X, cursor.y);
  setColor(pdf, "text", COLORS.ink);
  pdf.setFont("helvetica", "bold");
  pdf.text(value, MARGIN_X + 140, cursor.y);
  cursor.y += lh;
  pdf.setFont("helvetica", "normal");
}

function statusChip(pdf: jsPDF, x: number, y: number, status: ScreeningStatus): number {
  const label = STATUS_LABEL[status];
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  const textWidth = pdf.getTextWidth(label);
  const padX = 5;
  const padY = 3;
  const boxW = textWidth + padX * 2;
  const boxH = 12;
  setColor(pdf, "fill", STATUS_COLOR[status]);
  pdf.roundedRect(x, y - boxH + padY, boxW, boxH, 3, 3, "F");
  setColor(pdf, "text", [255, 255, 255]);
  pdf.text(label, x + padX, y - 1.5);
  pdf.setFont("helvetica", "normal");
  return boxW;
}

function priorityBanner(status: ScreeningStatus): string {
  switch (status) {
    case "HIT": return "ELEVATED — sanctions matches confirmed. Immediate officer review required.";
    case "REVIEW": return "AMBER — partial matches require officer adjudication.";
    case "CLEAR": return "STABLE — no sanctions matches across screened entities.";
    case "ERROR": return "DEGRADED — one or more screenings failed; re-run before decisions.";
    default: return "";
  }
}

function computePosture(rows: ScreeningEntity[]) {
  const counts: Record<ScreeningStatus, number> = {
    PENDING: 0, RUNNING: 0, CLEAR: 0, HIT: 0, REVIEW: 0, ERROR: 0,
  };
  for (const r of rows) counts[r.status] += 1;
  const total = rows.length;
  const completed = counts.CLEAR + counts.HIT + counts.REVIEW;
  const outstanding = counts.PENDING + counts.RUNNING;
  const worst: ScreeningStatus =
    counts.HIT > 0 ? "HIT"
    : counts.REVIEW > 0 ? "REVIEW"
    : counts.ERROR > 0 ? "ERROR"
    : outstanding > 0 && completed === 0 ? "PENDING"
    : "CLEAR";
  return { counts, total, completed, outstanding, worst };
}

/**
 * Measure a single entity block at the given scale so we can decide whether
 * to keep it together on the current page or open a new one.
 */
function measureRow(pdf: jsPDF, r: ScreeningEntity, index: number, s: LayoutScale): number {
  let h = 0;
  // head line
  h += s.rowHeadSize + 3;
  // meta line (only when any meta present)
  const hasMeta =
    !!r.kind || !!r.imo || !!r.origin ||
    typeof r.hitCount === "number" || !!r.providers?.length;
  if (hasMeta) h += s.rowMetaSize + 3;
  // queued/completed line
  h += s.rowMetaSize + 3;
  // summary paragraph
  if (r.summary) {
    const m = measureParagraph(pdf, r.summary, s.rowSummarySize, s.paragraphLineGap);
    h += m.height;
  }
  // error paragraph
  if (r.error) {
    const m = measureParagraph(pdf, `Error: ${r.error}`, s.rowErrorSize, s.paragraphLineGap);
    h += m.height;
  }
  // divider + trailing gap
  h += s.rowGap;
  void index;
  return h;
}

/**
 * Decide which layout to use. We render a single row at default scale to see
 * roughly how many pages the evidence section alone would take — if that
 * exceeds a small threshold, or if any single row wouldn't fit in a page,
 * we downgrade to compact.
 */
function chooseLayout(pdf: jsPDF, rows: ScreeningEntity[]): LayoutScale {
  if (rows.length === 0) return LAYOUT_DEFAULT;
  const avail = usableHeight(pdf);
  const totalDefault = rows.reduce((acc, r, i) => acc + measureRow(pdf, r, i, LAYOUT_DEFAULT), 0);
  const anyRowTooTall = rows.some((r, i) => measureRow(pdf, r, i, LAYOUT_DEFAULT) > avail - 40);
  // Reserve one page's worth of budget for the executive assessment / banner /
  // signature. If the evidence alone would run past ~3 pages, compact it.
  const projectedPages = totalDefault / avail;
  if (anyRowTooTall || projectedPages > 3) return LAYOUT_COMPACT;
  return LAYOUT_DEFAULT;
}

function safeFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `seaphore-compliance-report-${stamp}.pdf`;
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  try { return new Date(iso).toUTCString(); } catch { return iso; }
}

export interface ComplianceReportInput {
  rows: ScreeningEntity[];
  /** Optional officer / operator name for the signature block. */
  officer?: string;
  /** Optional free-text mission or investigation context. */
  context?: string;
}

/**
 * Build the PDF without triggering a download. Useful for tests / QA.
 * Returns the underlying jsPDF instance so callers can .output(...) it.
 */
export function buildComplianceReportPdf(
  input: ComplianceReportInput,
): { pdf: jsPDF; filename: string; layout: LayoutScale["key"] } {
  const { rows, officer, context } = input;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const cursor: Cursor = { y: MARGIN_TOP, page: 1, inEvidence: false };
  drawHeader(pdf);

  const scale = chooseLayout(pdf, rows);

  // Title block
  setColor(pdf, "text", COLORS.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("Compliance Report", MARGIN_X, cursor.y);
  cursor.y += 20;

  setColor(pdf, "text", COLORS.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.text(`Generated ${new Date().toUTCString()}`, MARGIN_X, cursor.y);
  cursor.y += 14;

  const posture = computePosture(rows);

  // Executive assessment
  writeSectionTitle(pdf, cursor, "Executive Assessment");
  writeKV(pdf, cursor, "Entities screened", `${posture.completed} of ${posture.total}`);
  writeKV(pdf, cursor, "Sanctions hits", String(posture.counts.HIT));
  writeKV(pdf, cursor, "Requires review", String(posture.counts.REVIEW));
  writeKV(pdf, cursor, "Clear", String(posture.counts.CLEAR));
  writeKV(pdf, cursor, "Outstanding", String(posture.outstanding));
  if (posture.counts.ERROR > 0) writeKV(pdf, cursor, "Failed screenings", String(posture.counts.ERROR));
  if (officer) writeKV(pdf, cursor, "Officer of record", officer);
  if (context) writeKV(pdf, cursor, "Context", context);
  cursor.y += 4;

  // Posture banner
  const banner = priorityBanner(posture.worst);
  if (banner) {
    ensureSpace(pdf, cursor, 34);
    const w = pageW(pdf);
    setColor(pdf, "fill", STATUS_COLOR[posture.worst]);
    pdf.roundedRect(MARGIN_X, cursor.y - 2, w - MARGIN_X * 2, 26, 4, 4, "F");
    setColor(pdf, "text", [255, 255, 255]);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(banner, MARGIN_X + 10, cursor.y + 15);
    cursor.y += 34;
    setColor(pdf, "text", COLORS.ink);
    pdf.setFont("helvetica", "normal");
  }

  // Recommended officer action
  writeSectionTitle(pdf, cursor, "Recommended Officer Action");
  const action =
    posture.worst === "HIT"
      ? "Suspend clearance for hit entities. Escalate to compliance lead and document justification in the Decision Log before any further port state or shipping action."
      : posture.worst === "REVIEW"
        ? "Adjudicate REVIEW entities individually. Attach counter-evidence or approvals before permitting downstream operational decisions."
        : posture.worst === "ERROR"
          ? "Re-run failed screenings. Do not clear affected entities until a successful screening completes."
          : posture.outstanding > 0
            ? "Complete outstanding screenings before this report is considered final."
            : "No further action required. Archive this report in the case file for auditability.";
  writeParagraph(pdf, cursor, action, LAYOUT_DEFAULT.paragraphSize, LAYOUT_DEFAULT.paragraphLineGap);
  cursor.y += LAYOUT_DEFAULT.sectionGap;

  // Evidence summary — per-entity, atomic blocks
  writeSectionTitle(pdf, cursor, "Evidence Summary");
  cursor.inEvidence = true;
  if (rows.length === 0) {
    writeParagraph(pdf, cursor, "No entities were queued for screening at report time.", scale.paragraphSize, scale.paragraphLineGap);
  } else {
    rows.forEach((r, i) => {
      const rowH = measureRow(pdf, r, i, scale);
      // Keep the whole row on one page whenever it fits; otherwise open a new
      // page (the row is still bigger than a page only in pathological cases,
      // where writeParagraph will split gracefully on its own).
      ensureSpace(pdf, cursor, Math.min(rowH, usableHeight(pdf) - 20));

      const w = pageW(pdf);
      // Row header line: index + name + kind + IMO
      setColor(pdf, "text", COLORS.ink);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(scale.rowHeadSize);
      const head = `${i + 1}. ${r.name}`;
      pdf.text(head, MARGIN_X, cursor.y);
      // Chip aligned right
      const chipW = pdf.getTextWidth(STATUS_LABEL[r.status]) + 10;
      statusChip(pdf, w - MARGIN_X - chipW, cursor.y, r.status);
      cursor.y += scale.rowHeadSize + 3;

      setColor(pdf, "text", COLORS.muted);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(scale.rowMetaSize);
      const meta: string[] = [];
      if (r.kind) meta.push(r.kind.toUpperCase());
      if (r.imo) meta.push(`IMO ${r.imo}`);
      if (r.origin) meta.push(`origin ${r.origin}`);
      if (typeof r.hitCount === "number") meta.push(`${r.hitCount} finding${r.hitCount === 1 ? "" : "s"}`);
      if (r.providers?.length) meta.push(`providers: ${r.providers.join(", ")}`);
      if (meta.length) {
        pdf.text(meta.join("  ·  "), MARGIN_X, cursor.y);
        cursor.y += scale.rowMetaSize + 3;
      }

      pdf.text(
        `Queued ${fmtDate(r.addedAt)}${r.completedAt ? `  ·  Completed ${fmtDate(r.completedAt)}` : ""}`,
        MARGIN_X,
        cursor.y,
      );
      cursor.y += scale.rowMetaSize + 3;

      if (r.summary) {
        setColor(pdf, "text", COLORS.ink);
        writeParagraph(pdf, cursor, r.summary, scale.rowSummarySize, scale.paragraphLineGap);
      }
      if (r.error) {
        setColor(pdf, "text", COLORS.danger);
        writeParagraph(pdf, cursor, `Error: ${r.error}`, scale.rowErrorSize, scale.paragraphLineGap);
      }

      // Divider + trailing gap
      setColor(pdf, "draw", COLORS.rule);
      pdf.setLineWidth(0.3);
      pdf.line(MARGIN_X, cursor.y + 2, pageW(pdf) - MARGIN_X, cursor.y + 2);
      cursor.y += scale.rowGap;
    });
  }
  cursor.inEvidence = false;

  // Signature block
  ensureSpace(pdf, cursor, 90);
  cursor.y += 8;
  writeSectionTitle(pdf, cursor, "Officer Attestation");
  writeParagraph(
    pdf,
    cursor,
    "I confirm this compliance report reflects the screening evidence available at the time of generation. The system provides recommendations; the officer named below is accountable for the operational decision.",
    LAYOUT_DEFAULT.paragraphSize,
    LAYOUT_DEFAULT.paragraphLineGap,
  );
  cursor.y += 14;
  ensureSpace(pdf, cursor, 40);
  setColor(pdf, "draw", COLORS.ink);
  pdf.setLineWidth(0.6);
  const w = pageW(pdf);
  pdf.line(MARGIN_X, cursor.y, MARGIN_X + 200, cursor.y);
  pdf.line(w - MARGIN_X - 160, cursor.y, w - MARGIN_X, cursor.y);
  cursor.y += 12;
  setColor(pdf, "text", COLORS.muted);
  pdf.setFontSize(9);
  pdf.text(officer ? `Officer: ${officer}` : "Officer signature", MARGIN_X, cursor.y);
  pdf.text("Date", w - MARGIN_X - 160, cursor.y);

  // Stamp footers on every page with "Page X of N" now that N is known.
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    pdf.setPage(p);
    const ph = pageH(pdf);
    const pw = pageW(pdf);
    setColor(pdf, "draw", COLORS.rule);
    pdf.setLineWidth(0.4);
    pdf.line(MARGIN_X, ph - 42, pw - MARGIN_X, ph - 42);
    setColor(pdf, "text", COLORS.muted);
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(8);
    pdf.text("Evidence first. Explainable always. Officer decides.", MARGIN_X, ph - 28);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Page ${p} of ${total}`, pw - MARGIN_X, ph - 28, { align: "right" });
  }

  const filename = safeFilename();
  return { pdf, filename, layout: scale.key };
}

/** Build the compliance report PDF and trigger a browser download. */
export function exportComplianceReport(input: ComplianceReportInput): string {
  const { pdf, filename } = buildComplianceReportPdf(input);
  pdf.save(filename);
  return filename;
}
