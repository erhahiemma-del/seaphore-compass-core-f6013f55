/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT REP-01 — Intelligence Readiness Report (PDF)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Renders the LIVE Intelligence Coverage & Readiness diagnostic
 *  (`IntelligenceCoverageReport`, produced server-side by
 *  `src/lib/server/intelligence/coverage.server.ts`) into a paginated,
 *  timestamped PDF the officer can download from the Intelligence
 *  Dashboard.
 *
 *  Honesty rules honoured here:
 *   • No mock, sample or placeholder data — every value in the PDF comes
 *     from the report object passed in. If a section has nothing to
 *     report, it says so in words rather than inventing a number.
 *   • Every readiness figure is stamped with how it was derived and
 *     when it was measured.
 *   • The system reports; the officer decides. The report recommends
 *     actions, it never claims to have taken one.
 * ─────────────────────────────────────────────────────────────────────
 */
import jsPDF from "jspdf";

import {
  KPI_STATE_META,
  ROOT_CAUSE_LABELS,
  type IntelligenceCoverageReport,
  type KpiCoverage,
  type KpiProviderCoverage,
  type ProviderCoverageStatus,
} from "./coverage-model";

/** Report format version. Bump when the section layout changes. */
export const READINESS_REPORT_VERSION = "1.0";

const FOOTER_MOTTO = "Evidence first. Explainable always. Officer decides.";

const MARGIN_X = 44;
const MARGIN_TOP = 52;
const MARGIN_BOTTOM = 58;

const COLORS = {
  navy: [15, 30, 66] as const,
  ink: [24, 33, 46] as const,
  muted: [96, 108, 128] as const,
  rule: [214, 220, 230] as const,
  teal: [13, 122, 122] as const,
  emerald: [22, 128, 90] as const,
  amber: [176, 118, 20] as const,
  danger: [176, 42, 55] as const,
  slateBg: [244, 246, 250] as const,
};

const PROVIDER_STATUS_LABEL: Record<ProviderCoverageStatus, string> = {
  OPERATIONAL: "Operational",
  PARTIAL: "Partial",
  AWAITING_CREDENTIALS: "Awaiting Credentials",
  CREDENTIALS_INVALID: "Credentials Invalid",
  RATE_LIMITED: "Rate Limited",
  OFFLINE: "Offline",
  NOT_REGISTERED: "Not Registered",
};

const PROVIDER_STATUS_COLOR: Record<ProviderCoverageStatus, readonly [number, number, number]> = {
  OPERATIONAL: COLORS.emerald,
  PARTIAL: COLORS.amber,
  AWAITING_CREDENTIALS: COLORS.amber,
  CREDENTIALS_INVALID: COLORS.danger,
  RATE_LIMITED: COLORS.amber,
  OFFLINE: COLORS.danger,
  NOT_REGISTERED: COLORS.muted,
};

/** A provider is "pending" until it can actually serve evidence. */
const OPERATIONAL_STATUSES: ReadonlyArray<ProviderCoverageStatus> = ["OPERATIONAL", "PARTIAL"];

/* ──────────────────────── derived, live-only views ─────────────────── */

export interface ProviderRollup {
  providerId: string;
  providerName: string;
  status: ProviderCoverageStatus;
  certification: KpiProviderCoverage["certification"];
  credentialEnv: ReadonlyArray<string>;
  lastError: string | null;
  lastCheckedAt: string | null;
  lastSuccessfulSync: string | null;
  /** KPI titles this provider is registered to serve. */
  serves: ReadonlyArray<string>;
}

/**
 * Collapse the per-KPI provider entries into one row per provider.
 * The worst observed status wins so the summary can never look
 * healthier than the platform actually is.
 */
export function rollUpProviders(report: IntelligenceCoverageReport): ProviderRollup[] {
  const severity: Record<ProviderCoverageStatus, number> = {
    OPERATIONAL: 0,
    PARTIAL: 1,
    RATE_LIMITED: 2,
    AWAITING_CREDENTIALS: 3,
    CREDENTIALS_INVALID: 4,
    OFFLINE: 5,
    NOT_REGISTERED: 6,
  };
  const byId = new Map<string, ProviderRollup & { serves: string[] }>();

  for (const kpi of report.kpis) {
    for (const p of kpi.providers) {
      const existing = byId.get(p.providerId);
      if (!existing) {
        byId.set(p.providerId, {
          providerId: p.providerId,
          providerName: p.providerName,
          status: p.status,
          certification: p.certification,
          credentialEnv: p.credentialEnv,
          lastError: p.lastError,
          lastCheckedAt: p.lastCheckedAt,
          lastSuccessfulSync: p.lastSuccessfulSync,
          serves: [kpi.title],
        });
        continue;
      }
      if (!existing.serves.includes(kpi.title)) existing.serves.push(kpi.title);
      if (severity[p.status] > severity[existing.status]) {
        existing.status = p.status;
        existing.lastError = p.lastError ?? existing.lastError;
      }
      existing.lastCheckedAt = existing.lastCheckedAt ?? p.lastCheckedAt;
      existing.lastSuccessfulSync = existing.lastSuccessfulSync ?? p.lastSuccessfulSync;
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => severity[a.status] - severity[b.status] || a.providerName.localeCompare(b.providerName),
  );
}

export function isOperational(status: ProviderCoverageStatus): boolean {
  return OPERATIONAL_STATUSES.includes(status);
}

export interface ConfigurationItem {
  severity: "BLOCKING" | "DEGRADED" | "ADVISORY";
  subject: string;
  detail: string;
}

/** Outstanding configuration items, derived purely from live diagnostics. */
export function outstandingConfiguration(report: IntelligenceCoverageReport): ConfigurationItem[] {
  const items: ConfigurationItem[] = [];

  for (const p of rollUpProviders(report)) {
    if (p.status === "AWAITING_CREDENTIALS") {
      items.push({
        severity: "BLOCKING",
        subject: `${p.providerName} — credentials missing`,
        detail: p.credentialEnv.length
          ? `Set ${p.credentialEnv.join(" or ")} to activate ${p.serves.join(", ")}.`
          : `Credential required before ${p.serves.join(", ")} can report live evidence.`,
      });
    } else if (p.status === "CREDENTIALS_INVALID") {
      items.push({
        severity: "BLOCKING",
        subject: `${p.providerName} — credentials rejected`,
        detail:
          p.lastError ??
          `The configured credential (${p.credentialEnv.join(", ") || "unnamed"}) was rejected upstream.`,
      });
    } else if (p.status === "OFFLINE") {
      items.push({
        severity: "BLOCKING",
        subject: `${p.providerName} — connectivity`,
        detail: p.lastError ?? "Provider unreachable at the last health probe.",
      });
    } else if (p.status === "RATE_LIMITED") {
      items.push({
        severity: "DEGRADED",
        subject: `${p.providerName} — rate limited`,
        detail: p.lastError ?? "Upstream quota exhausted; evidence acquisition is throttled.",
      });
    }
  }

  for (const kpi of report.kpis) {
    if (kpi.state === "NO_PROVIDER") {
      items.push({
        severity: "BLOCKING",
        subject: `${kpi.title} — no provider connected`,
        detail: `No Evidence Provider is registered for this capability. ${kpi.rootCauseDetail}`,
      });
    }
    if (kpi.projectionStatus === "MISSING") {
      items.push({
        severity: "ADVISORY",
        subject: `${kpi.title} — projection contract missing`,
        detail: `Declare ${kpi.projectionContractId} in the projection contract registry.`,
      });
    }
    if (kpi.dashboardStatus === "MAPPING_ERROR") {
      items.push({
        severity: "DEGRADED",
        subject: `${kpi.title} — dashboard mapping error`,
        detail: `Dashboard field "${kpi.dashboardField}" does not resolve against ${kpi.sourceOfTruth}.`,
      });
    }
  }

  return items;
}

export interface NextAction {
  priority: number;
  action: string;
  rationale: string;
}

/** Prioritised next actions. Recommendations only — the officer decides. */
export function recommendedNextActions(report: IntelligenceCoverageReport): NextAction[] {
  const rank: Record<ConfigurationItem["severity"], number> = {
    BLOCKING: 0,
    DEGRADED: 1,
    ADVISORY: 2,
  };
  const items = outstandingConfiguration(report).sort(
    (a, b) => rank[a.severity] - rank[b.severity],
  );

  const actions: NextAction[] = items.map((item, i) => ({
    priority: i + 1,
    action: item.subject,
    rationale: item.detail,
  }));

  if (actions.length === 0) {
    actions.push({
      priority: 1,
      action: "No configuration action outstanding",
      rationale:
        "Every registered provider reported operational at the last probe. Continue routine health monitoring.",
    });
  }
  return actions;
}

/* ──────────────────────────── PDF rendering ────────────────────────── */

interface Cursor {
  y: number;
  page: number;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

/**
 * Build the readiness PDF from a live coverage report.
 * Pure: no network, no persistence, no mutation of the input.
 */
export function buildReadinessReportPdf(report: IntelligenceCoverageReport): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN_X * 2;
  const cur: Cursor = { y: MARGIN_TOP, page: 1 };

  const generatedAt = new Date();
  const providers = rollUpProviders(report);
  const operational = providers.filter((p) => isOperational(p.status));
  const pending = providers.filter((p) => !isOperational(p.status));
  const configItems = outstandingConfiguration(report);
  const actions = recommendedNextActions(report);

  /* ── primitives ── */

  const ensure = (needed: number) => {
    if (cur.y + needed <= pageH - MARGIN_BOTTOM) return;
    doc.addPage();
    cur.page += 1;
    cur.y = MARGIN_TOP;
  };

  const text = (
    value: string,
    opts: {
      size?: number;
      bold?: boolean;
      color?: readonly [number, number, number];
      x?: number;
      width?: number;
      gap?: number;
    } = {},
  ) => {
    const size = opts.size ?? 9.5;
    const lineH = size + (opts.gap ?? 3.5);
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(opts.color ?? COLORS.ink));
    const lines = doc.splitTextToSize(value, opts.width ?? contentW) as string[];
    for (const line of lines) {
      ensure(lineH);
      doc.text(line, opts.x ?? MARGIN_X, cur.y + size * 0.8);
      cur.y += lineH;
    }
  };

  const sectionHeading = (label: string) => {
    ensure(34);
    cur.y += 10;
    doc.setDrawColor(...COLORS.rule);
    doc.setLineWidth(0.6);
    doc.line(MARGIN_X, cur.y, pageW - MARGIN_X, cur.y);
    cur.y += 10;
    text(label.toUpperCase(), { size: 10.5, bold: true, color: COLORS.navy, gap: 5 });
  };

  /** Simple auto-paginating table. Column widths are fractions of content. */
  const table = (
    headers: string[],
    rows: string[][],
    widths: number[],
    tint?: (row: string[]) => readonly [number, number, number] | null,
  ) => {
    const size = 8.2;
    const padX = 5;
    const cols = widths.map((w) => w * contentW);

    const drawHeader = () => {
      ensure(20);
      doc.setFillColor(...COLORS.slateBg);
      doc.rect(MARGIN_X, cur.y, contentW, 16, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(size);
      doc.setTextColor(...COLORS.navy);
      let x = MARGIN_X;
      headers.forEach((h, i) => {
        doc.text(doc.splitTextToSize(h, cols[i] - padX * 2)[0] as string, x + padX, cur.y + 11);
        x += cols[i];
      });
      cur.y += 16;
    };

    drawHeader();

    for (const row of rows) {
      const cells = row.map(
        (cell, i) => doc.splitTextToSize(cell || "—", cols[i] - padX * 2) as string[],
      );
      const lines = Math.max(...cells.map((c) => c.length));
      const rowH = lines * (size + 2.6) + 7;
      if (cur.y + rowH > pageH - MARGIN_BOTTOM) {
        doc.addPage();
        cur.page += 1;
        cur.y = MARGIN_TOP;
        drawHeader();
      }
      const accent = tint?.(row) ?? null;
      if (accent) {
        doc.setFillColor(...accent);
        doc.rect(MARGIN_X, cur.y, 2.4, rowH, "F");
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      let x = MARGIN_X;
      cells.forEach((lines_, i) => {
        const cellColor: readonly [number, number, number] = i === 0 ? COLORS.ink : COLORS.muted;
        doc.setTextColor(...cellColor);
        lines_.forEach((line, li) => {
          doc.text(line, x + padX, cur.y + 9 + li * (size + 2.6));
        });
        x += cols[i];
      });
      cur.y += rowH;
      doc.setDrawColor(...COLORS.rule);
      doc.setLineWidth(0.4);
      doc.line(MARGIN_X, cur.y, pageW - MARGIN_X, cur.y);
    }
    cur.y += 4;
  };

  /* ── cover block ── */

  doc.setFillColor(...COLORS.navy);
  doc.rect(0, 0, pageW, 96, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(255, 255, 255);
  doc.text("Intelligence Readiness Report", MARGIN_X, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(196, 208, 226);
  doc.text("SEAPHORE — Maritime Intelligence Operating System", MARGIN_X, 62);
  doc.text(
    `Report version ${READINESS_REPORT_VERSION}  ·  Generated ${fmtDate(generatedAt.toISOString())}  ·  Diagnostics measured ${fmtDate(report.generatedAt)}`,
    MARGIN_X,
    78,
  );
  cur.y = 118;

  /* ── 1. Executive summary ── */

  sectionHeading("1. Executive Summary");
  const r = report.readiness;
  text(
    `Overall Intelligence Readiness is ${r.overallPct}%. ${r.activeKpis} of ${r.totalKpis} intelligence KPIs are reporting live evidence, drawn from ${r.totalProviders} registered Evidence Providers: ${operational.length} operational and ${pending.length} pending configuration or connectivity.`,
  );
  cur.y += 2;
  text(
    configItems.length === 0
      ? "No outstanding configuration items were detected at the time of this probe. The platform is serving intelligence from every registered provider."
      : `${configItems.length} outstanding item${configItems.length === 1 ? "" : "s"} currently constrain coverage — ${configItems.filter((i) => i.severity === "BLOCKING").length} blocking, ${configItems.filter((i) => i.severity === "DEGRADED").length} degrading, ${configItems.filter((i) => i.severity === "ADVISORY").length} advisory. Each is listed with its root cause in sections 5 and 8.`,
  );
  cur.y += 2;
  text(
    "Every figure in this report is read from live platform diagnostics at the timestamp above. No value is simulated, cached from a previous run, or filled with a placeholder. Where a capability cannot report, the report states why rather than showing a zero.",
    { color: COLORS.muted, size: 8.6 },
  );

  /* ── 2. Overall readiness ── */

  sectionHeading("2. Overall Intelligence Readiness");
  ensure(64);
  const barY = cur.y + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(...COLORS.navy);
  doc.text(`${r.overallPct}%`, MARGIN_X, barY + 24);
  doc.setFillColor(230, 236, 244);
  doc.rect(MARGIN_X + 96, barY + 8, contentW - 96, 12, "F");
  doc.setFillColor(...COLORS.teal);
  doc.rect(MARGIN_X + 96, barY + 8, ((contentW - 96) * r.overallPct) / 100, 12, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.4);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    `Derived from live provider health and KPI coverage · ${r.activeKpis}/${r.totalKpis} KPIs active`,
    MARGIN_X + 96,
    barY + 34,
  );
  cur.y = barY + 46;
  table(
    ["Readiness band", "Providers"],
    [
      ["Operational", r.operational.length ? r.operational.join(", ") : "None"],
      ["Partial", r.partial.length ? r.partial.join(", ") : "None"],
      ["Awaiting configuration", r.awaitingConfiguration.length ? r.awaitingConfiguration.join(", ") : "None"],
      ["Offline", r.offline.length ? r.offline.join(", ") : "None"],
    ],
    [0.3, 0.7],
  );

  /* ── 3. Provider health summary ── */

  sectionHeading("3. Provider Health Summary");
  if (providers.length === 0) {
    text("No Evidence Providers are registered in the catalog.", { color: COLORS.muted });
  } else {
    table(
      ["Provider", "Status", "Certification", "Last checked", "Last successful sync"],
      providers.map((p) => [
        p.providerName,
        PROVIDER_STATUS_LABEL[p.status],
        p.certification,
        fmtDate(p.lastCheckedAt),
        fmtDate(p.lastSuccessfulSync),
      ]),
      [0.26, 0.17, 0.14, 0.215, 0.215],
      (row) => {
        const match = (Object.keys(PROVIDER_STATUS_LABEL) as ProviderCoverageStatus[]).find(
          (k) => PROVIDER_STATUS_LABEL[k] === row[1],
        );
        return match ? PROVIDER_STATUS_COLOR[match] : null;
      },
    );
  }

  /* ── 4. Coverage matrix ── */

  sectionHeading("4. Intelligence Coverage Matrix");
  table(
    ["Capability", "State", "Reported value", "Coverage", "Confidence", "Providers"],
    report.kpis.map((k: KpiCoverage) => [
      k.title,
      KPI_STATE_META[k.state].label,
      k.display,
      `${k.coveragePct}%`,
      k.confidence,
      k.providers.length ? k.providers.map((p) => p.providerName).join(", ") : "None registered",
    ]),
    [0.19, 0.16, 0.16, 0.09, 0.12, 0.28],
  );

  /* ── 5. Root cause matrix ── */

  sectionHeading("5. Root Cause Matrix");
  table(
    ["Capability", "Root cause", "Explanation", "Failing check"],
    report.kpis.map((k) => {
      const failing = Object.entries(k.checks)
        .filter(([, ok]) => !ok)
        .map(([name]) => name);
      return [
        k.title,
        ROOT_CAUSE_LABELS[k.rootCause],
        k.rootCauseDetail || k.stateDetail,
        failing.length ? failing.join(", ") : "All checks passing",
      ];
    }),
    [0.19, 0.2, 0.36, 0.25],
  );

  /* ── 6. Operational vs pending ── */

  sectionHeading("6. Operational vs Pending Providers");
  text(
    `${operational.length} operational · ${pending.length} pending`,
    { bold: true, size: 9.5, color: COLORS.navy },
  );
  cur.y += 2;
  table(
    ["Disposition", "Provider", "Serves", "Blocking detail"],
    [
      ...operational.map((p) => ["Operational", p.providerName, p.serves.join(", "), "—"]),
      ...pending.map((p) => [
        `Pending — ${PROVIDER_STATUS_LABEL[p.status]}`,
        p.providerName,
        p.serves.join(", "),
        p.lastError ?? "Awaiting configuration",
      ]),
    ],
    [0.2, 0.2, 0.24, 0.36],
    (row) => (row[0] === "Operational" ? COLORS.emerald : COLORS.amber),
  );

  /* ── 7. KPI status ── */

  sectionHeading("7. KPI Status");
  table(
    ["KPI", "Headline", "State", "Evidence", "Projection", "Dashboard"],
    report.kpis.map((k) => [
      k.title,
      k.display,
      KPI_STATE_META[k.state].label,
      String(k.evidenceCount),
      k.projectionStatus === "MAPPED" ? "Mapped" : "Missing",
      k.dashboardStatus === "READING_CORRECT_FIELD" ? "Correct field" : "Mapping error",
    ]),
    [0.19, 0.19, 0.19, 0.1, 0.15, 0.18],
  );

  /* ── 8. Outstanding configuration ── */

  sectionHeading("8. Outstanding Configuration Items");
  if (configItems.length === 0) {
    text("None outstanding at the time of this probe.", { color: COLORS.muted });
  } else {
    table(
      ["Severity", "Item", "What is required"],
      configItems.map((i) => [i.severity, i.subject, i.detail]),
      [0.15, 0.32, 0.53],
      (row) =>
        row[0] === "BLOCKING" ? COLORS.danger : row[0] === "DEGRADED" ? COLORS.amber : COLORS.muted,
    );
  }

  /* ── 9. Recommended next actions ── */

  sectionHeading("9. Recommended Next Actions (Prioritised)");
  table(
    ["#", "Recommended action", "Why it matters"],
    actions.map((a) => [String(a.priority), a.action, a.rationale]),
    [0.07, 0.35, 0.58],
  );
  cur.y += 4;
  text(
    "These are system recommendations produced from live diagnostics. No configuration change has been made. The officer decides which action to take and in what order.",
    { color: COLORS.muted, size: 8.4 },
  );

  /* ── footers ── */

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(...COLORS.rule);
    doc.setLineWidth(0.5);
    doc.line(MARGIN_X, pageH - 40, pageW - MARGIN_X, pageH - 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    doc.setTextColor(...COLORS.muted);
    doc.text(FOOTER_MOTTO, MARGIN_X, pageH - 27);
    doc.text(
      `Intelligence Readiness Report v${READINESS_REPORT_VERSION} · ${fmtDate(generatedAt.toISOString())}`,
      MARGIN_X,
      pageH - 17,
    );
    doc.text(`Page ${p} of ${pages}`, pageW - MARGIN_X, pageH - 27, { align: "right" });
  }

  return doc;
}

/** Stable, timestamped filename for the download. */
export function readinessReportFilename(at: Date = new Date()): string {
  const stamp = at.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `seaphore-intelligence-readiness-v${READINESS_REPORT_VERSION}-${stamp}.pdf`;
}

/** Build and download the report in the browser. */
export function exportIntelligenceReadinessReport(report: IntelligenceCoverageReport): string {
  const doc = buildReadinessReportPdf(report);
  const filename = readinessReportFilename();
  doc.save(filename);
  return filename;
}
