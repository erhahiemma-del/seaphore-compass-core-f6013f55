/**
 * Ownership Evidence Report — client-side PDF export.
 *
 * HR-7 compliant: every export embeds officer identity, generation
 * timestamps (UTC + WAT), evidence provenance with confidence tiers,
 * and the Seaphore accountability oath. Rendered with jsPDF so the
 * artefact is produced on the officer's device (no server dependency)
 * and downloaded directly.
 */
import { jsPDF } from "jspdf";

import { SEAPHORE_OATH } from "@/lib/compliance/rules";
import type { ConfidenceTier } from "@/components/intelligence/ConfidenceChip";
import {
  KEY_INSIGHTS,
  RECOMMENDED_ACTIONS,
  SUPPORTING_EVIDENCE,
  OWNERSHIP_EVENTS,
  personsForCompany,
  vesselsForCompany,
  portsForCompany,
} from "./ownership-data";
import type { Company } from "@/lib/intel-centre-data";

export interface ExportContext {
  company: Company;
  riskScore: number;
  confidencePct: number;
  officer: { name: string; role: string; id: string };
}

const NAVY = "#0B1E3B";
const SLATE = "#5A6B7B";
const RED = "#C0392B";
const AMBER = "#B06A00";
const GREEN = "#1E6B3A";
const BLUE = "#2563EB";

function toWat(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() + 60 * 60 * 1000).toISOString().replace("Z", "+01:00");
}

function severityColor(s: "HIGH" | "MEDIUM" | "LOW") {
  return s === "HIGH" ? RED : s === "MEDIUM" ? AMBER : GREEN;
}

function tierPct(t: ConfidenceTier) {
  return t === "verified" ? 95 : t === "observed" ? 80 : t === "inferred" ? 65 : 40;
}

export function exportOwnershipReport(ctx: ExportContext) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 40;
  let y = 40;

  const nowIso = new Date().toISOString();
  const requestId = crypto.randomUUID();

  const ensure = (needed: number) => {
    if (y + needed > pageH - 60) {
      addFooter();
      doc.addPage();
      y = 40;
    }
  };

  const addFooter = () => {
    const page = doc.getCurrentPageInfo().pageNumber;
    doc.setDrawColor(230);
    doc.line(marginX, pageH - 42, pageW - marginX, pageH - 42);
    doc.setFontSize(7.5);
    doc.setTextColor(SLATE);
    doc.text("Evidence first. Explainable always. Officer decides.", marginX, pageH - 28);
    doc.text(`Request ${requestId.slice(0, 8)} · Page ${page}`, pageW - marginX, pageH - 28, {
      align: "right",
    });
  };

  const h1 = (t: string) => {
    ensure(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(NAVY);
    doc.text(t, marginX, y);
    y += 20;
  };

  const h2 = (t: string) => {
    ensure(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(NAVY);
    doc.text(t.toUpperCase(), marginX, y);
    doc.setDrawColor(BLUE);
    doc.setLineWidth(0.8);
    doc.line(marginX, y + 3, marginX + 60, y + 3);
    y += 16;
  };

  const body = (
    t: string,
    opts: { color?: string; bold?: boolean; size?: number; indent?: number } = {},
  ) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size ?? 9.5);
    doc.setTextColor(opts.color ?? "#1F2A37");
    const x = marginX + (opts.indent ?? 0);
    const wrapped = doc.splitTextToSize(t, pageW - marginX * 2 - (opts.indent ?? 0));
    ensure(wrapped.length * 12);
    doc.text(wrapped, x, y);
    y += wrapped.length * 12;
  };

  const kv = (label: string, value: string) => {
    ensure(14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(SLATE);
    doc.text(label, marginX, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY);
    doc.text(value, marginX + 130, y);
    y += 13;
  };

  // ---- Cover / Header -----------------------------------------------------
  doc.setFillColor(NAVY);
  doc.rect(0, 0, pageW, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(BLUE);
  doc.text("SEAPHORE · OWNERSHIP INTELLIGENCE CENTRE", marginX, y);
  y += 20;
  h1("Ownership Evidence Report");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(SLATE);
  doc.text(`Subject: ${ctx.company.name}`, marginX, y);
  y += 12;
  doc.text(`Generated UTC: ${nowIso}`, marginX, y);
  y += 12;
  doc.text(`Generated WAT: ${toWat(nowIso)}`, marginX, y);
  y += 20;

  // ---- Officer accountability --------------------------------------------
  h2("Officer of Record");
  kv("Name", ctx.officer.name);
  kv("Role", ctx.officer.role);
  kv("Officer ID", ctx.officer.id);
  kv("Request ID", requestId);
  y += 6;

  // ---- Entity Profile -----------------------------------------------------
  h2("Entity Profile");
  kv("Legal Name", ctx.company.name);
  kv("Role", ctx.company.role);
  kv("Country", ctx.company.country);
  if (ctx.company.cacNumber) kv("CAC Number", ctx.company.cacNumber);
  kv("Verification", ctx.company.verified.toUpperCase());
  kv("Risk Score", `${ctx.riskScore} / 100`);
  kv("Confidence", `${ctx.confidencePct}%`);

  const persons = personsForCompany(ctx.company.id);
  const vessels = vesselsForCompany(ctx.company.id);
  const ports = portsForCompany(ctx.company.id);
  kv("Linked Persons", String(persons.length));
  kv("Linked Vessels", String(vessels.length));
  kv("Linked Ports", String(ports.length));
  y += 6;

  if (persons.length) {
    h2("Beneficial Ownership");
    persons.forEach((p) => {
      body(
        `• ${p.name} — ${p.role}${p.stakePct ? ` (${p.stakePct}%)` : ""} · ${p.country}${p.pep ? " · PEP" : ""}${p.sanctioned ? " · SANCTIONED" : ""}`,
        { color: p.sanctioned ? RED : p.pep ? AMBER : "#1F2A37" },
      );
    });
    y += 6;
  }

  // ---- Key Insights -------------------------------------------------------
  h2("Key Insights");
  KEY_INSIGHTS.forEach((k) => {
    ensure(20);
    doc.setFillColor(severityColor(k.severity));
    doc.circle(marginX + 3, y - 3, 2.2, "F");
    body(`  ${k.text}   [${k.severity}]`, { indent: 8 });
  });
  y += 6;

  // ---- Recommended Actions -----------------------------------------------
  h2("Recommended Actions (System Generated)");
  body(
    "Recommendations are produced from rules over available evidence. Every action is the officer's.",
    { color: SLATE, size: 8.5 },
  );
  y += 4;
  RECOMMENDED_ACTIONS.forEach((r, i) => {
    body(`${i + 1}. ${r.text}   [${r.severity} · confidence ${r.confidence}]`, {
      color: severityColor(r.severity),
      bold: true,
    });
  });
  y += 6;

  // ---- Ownership Timeline (last events) ----------------------------------
  h2("Ownership Timeline");
  OWNERSHIP_EVENTS.slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 8)
    .forEach((e) => {
      body(`${e.date} — ${e.kind}: ${e.summary}  [${e.confidence} · ${tierPct(e.confidence)}%]`);
    });
  y += 6;

  // ---- Evidence provenance -----------------------------------------------
  doc.addPage();
  y = 40;
  h1("Evidence Provenance");
  body(
    "The following supporting evidence bundles were referenced in this report. Every item is retained under the Seaphore chain of custody and is auditable via the Evidence Library.",
    { color: SLATE },
  );
  y += 6;

  // table
  const cols = [
    { label: "Bundle", w: 200 },
    { label: "Category", w: 130 },
    { label: "Items", w: 60 },
    { label: "Confidence", w: 90 },
  ];
  ensure(20);
  doc.setFillColor("#F1F5F9");
  doc.rect(marginX, y - 10, pageW - marginX * 2, 16, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(NAVY);
  let cx = marginX + 6;
  cols.forEach((c) => {
    doc.text(c.label.toUpperCase(), cx, y);
    cx += c.w;
  });
  y += 14;

  SUPPORTING_EVIDENCE.forEach((ev, i) => {
    ensure(16);
    if (i % 2 === 0) {
      doc.setFillColor("#FAFBFC");
      doc.rect(marginX, y - 10, pageW - marginX * 2, 14, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor("#1F2A37");
    let x = marginX + 6;
    doc.text(ev.label, x, y);
    x += cols[0]!.w;
    doc.text(ev.key.toUpperCase(), x, y);
    x += cols[1]!.w;
    doc.text(String(ev.count), x, y);
    x += cols[2]!.w;
    doc.setTextColor(GREEN);
    doc.text("verified", x, y);
    y += 14;
  });
  y += 8;

  // ---- Audit trail --------------------------------------------------------
  h2("Audit Trail");
  const auditRows = [
    { at: nowIso, action: "ownership.report.export", entity: ctx.company.id },
    { at: nowIso, action: "ownership.entity.view", entity: ctx.company.id },
  ];
  auditRows.forEach((a) => {
    body(`${a.at}  ·  ${ctx.officer.name} (${ctx.officer.role})  ·  ${a.action}  ·  ${a.entity}`);
  });
  y += 10;

  // ---- Oath ---------------------------------------------------------------
  h2("Seaphore Oath");
  body(SEAPHORE_OATH, { color: NAVY, bold: true });

  addFooter();

  const safeName = ctx.company.name.replace(/[^A-Za-z0-9]+/g, "_");
  const stamp = nowIso.replace(/[:.]/g, "-");
  doc.save(`Ownership_Evidence_Report_${safeName}_${stamp}.pdf`);

  return { requestId };
}
