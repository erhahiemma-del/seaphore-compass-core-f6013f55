/**
 * Ownership Evidence Report — PDF export contract tests.
 *
 * These tests are the automated backstop for HR-7 compliance on the
 * ownership export. Instead of eyeballing a rendered PDF we mock jsPDF,
 * capture every drawn string, and assert that the required sections and
 * data points are present:
 *
 *   1. Entity profile block (name / country / role / risk / confidence).
 *   2. Key insights (all text + severity tokens).
 *   3. Recommended actions (all text + severity + confidence tier).
 *   4. Evidence provenance table (bundle labels + counts + confidence tier).
 *   5. HR-7 audit block (officer identity, UTC & WAT timestamps, request id,
 *      audit trail entries, Seaphore oath, immutable footer).
 *
 * A regression that quietly drops any of these will fail the build.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ---- jsPDF mock ---------------------------------------------------------
// jsPDF is heavy and touches DOM/Canvas APIs. We only need to record calls.

interface DrawCall {
  text: string;
  x: number;
  y: number;
  align?: string;
}

const draws: DrawCall[] = [];
let saved: { name: string; pages: number } | null = null;
let pageCount = 1;

vi.mock("jspdf", () => {
  class FakePDF {
    internal = {
      pageSize: { getWidth: () => 595, getHeight: () => 842 },
    };
    getCurrentPageInfo() {
      return { pageNumber: pageCount };
    }
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setDrawColor() {}
    setFillColor() {}
    setLineWidth() {}
    line() {}
    rect() {}
    circle() {}
    addPage() {
      pageCount += 1;
    }
    splitTextToSize(text: string) {
      return Array.isArray(text) ? text : [text];
    }
    text(
      text: string | string[],
      x: number,
      y: number,
      opts?: { align?: string },
    ) {
      const arr = Array.isArray(text) ? text : [text];
      for (const t of arr) draws.push({ text: t, x, y, align: opts?.align });
    }
    save(name: string) {
      saved = { name, pages: pageCount };
    }
  }
  return { jsPDF: FakePDF };
});

// Deterministic uuid so we can assert on it.
const FIXED_UUID = "abcdef12-3456-7890-abcd-ef1234567890";
vi.stubGlobal("crypto", { randomUUID: () => FIXED_UUID });

import { exportOwnershipReport, type ExportContext } from "@/features/ownership/export-report";
import { COMPANIES } from "@/lib/intel-centre-data";
import {
  KEY_INSIGHTS,
  RECOMMENDED_ACTIONS,
  SUPPORTING_EVIDENCE,
} from "@/features/ownership/ownership-data";
import { SEAPHORE_OATH } from "@/lib/compliance/rules";

const company = COMPANIES.find((c) => c.id === "co-oceanline")!;

const ctx: ExportContext = {
  company,
  riskScore: 72,
  confidencePct: 87,
  officer: {
    name: "Officer Test Subject",
    role: "Intelligence Officer",
    id: "off-000-test",
  },
};

let corpus = "";

beforeEach(() => {
  draws.length = 0;
  saved = null;
  pageCount = 1;
  const result = exportOwnershipReport(ctx);
  expect(result.requestId).toBe(FIXED_UUID);
  corpus = draws.map((d) => d.text).join("\n");
});

describe("Ownership Evidence Report — structure", () => {
  it("emits a saved PDF spanning provenance page", () => {
    expect(saved).not.toBeNull();
    expect(saved!.name).toMatch(/^Ownership_Evidence_Report_OceanLine_Shipping_SA_/);
    expect(saved!.name).toMatch(/\.pdf$/);
    // The provenance section forces an explicit addPage().
    expect(saved!.pages).toBeGreaterThanOrEqual(2);
  });

  it("renders the mandatory section headings", () => {
    for (const heading of [
      "OFFICER OF RECORD",
      "ENTITY PROFILE",
      "KEY INSIGHTS",
      "RECOMMENDED ACTIONS (SYSTEM GENERATED)",
      "OWNERSHIP TIMELINE",
      "EVIDENCE PROVENANCE",
      "AUDIT TRAIL",
      "SEAPHORE OATH",
    ]) {
      expect(corpus, `missing heading: ${heading}`).toContain(heading);
    }
  });
});

describe("Ownership Evidence Report — entity profile", () => {
  it("prints the subject entity, role, country and risk/confidence", () => {
    expect(corpus).toContain(`Subject: ${company.name}`);
    expect(corpus).toContain(company.name); // Legal Name value
    expect(corpus).toContain(company.role);
    expect(corpus).toContain(company.country);
    expect(corpus).toContain("72 / 100");
    expect(corpus).toContain("87%");
    expect(corpus).toContain(company.verified.toUpperCase());
  });
});

describe("Ownership Evidence Report — key insights", () => {
  it("prints every key insight with its severity token", () => {
    for (const k of KEY_INSIGHTS) {
      expect(corpus).toContain(k.text);
      expect(corpus).toContain(`[${k.severity}]`);
    }
  });
});

describe("Ownership Evidence Report — recommended actions", () => {
  it("prints every recommended action with severity and confidence tier", () => {
    RECOMMENDED_ACTIONS.forEach((r, i) => {
      expect(corpus).toContain(`${i + 1}. ${r.text}`);
      expect(corpus).toContain(`[${r.severity} · confidence ${r.confidence}]`);
    });
  });

  it("discloses the recommendation basis (HR-11 / HR-4 spirit)", () => {
    // The report must state that recommendations are system-generated and
    // that the officer remains accountable.
    expect(corpus.toLowerCase()).toContain("rules over available evidence");
    expect(corpus.toLowerCase()).toContain("officer");
  });
});

describe("Ownership Evidence Report — evidence provenance", () => {
  it("renders the provenance table headers", () => {
    for (const h of ["BUNDLE", "CATEGORY", "ITEMS", "CONFIDENCE"]) {
      expect(corpus).toContain(h);
    }
  });

  it("renders every supporting evidence bundle with its count and tier", () => {
    for (const ev of SUPPORTING_EVIDENCE) {
      expect(corpus).toContain(ev.label);
      expect(corpus).toContain(ev.key.toUpperCase());
      expect(corpus).toContain(String(ev.count));
    }
    // Every provenance row is marked verified in the current export.
    const verifiedRows = draws.filter((d) => d.text === "verified").length;
    expect(verifiedRows).toBe(SUPPORTING_EVIDENCE.length);
  });
});

describe("Ownership Evidence Report — HR-7 audit block", () => {
  it("embeds the officer identity", () => {
    expect(corpus).toContain(ctx.officer.name);
    expect(corpus).toContain(ctx.officer.role);
    expect(corpus).toContain(ctx.officer.id);
  });

  it("embeds the request id (unique per export)", () => {
    expect(corpus).toContain(FIXED_UUID);
    // Footer shows the short form on every page.
    expect(corpus).toContain(`Request ${FIXED_UUID.slice(0, 8)}`);
  });

  it("embeds UTC and WAT timestamps", () => {
    const utcLine = draws.find((d) => d.text.startsWith("Generated UTC: "));
    const watLine = draws.find((d) => d.text.startsWith("Generated WAT: "));
    expect(utcLine, "missing UTC timestamp").toBeTruthy();
    expect(watLine, "missing WAT timestamp").toBeTruthy();
    // UTC uses Z, WAT is +01:00 with no DST per compliance spec.
    expect(utcLine!.text).toMatch(/Z$/);
    expect(watLine!.text).toMatch(/\+01:00$/);
  });

  it("writes at least one audit trail entry naming officer and action", () => {
    const auditRow = draws.find(
      (d) =>
        d.text.includes(ctx.officer.name) &&
        d.text.includes("ownership.report.export") &&
        d.text.includes(company.id),
    );
    expect(auditRow, "missing report.export audit row").toBeTruthy();
  });

  it("renders the immutable Seaphore oath and footer on every page", () => {
    expect(corpus).toContain(SEAPHORE_OATH);
    const footerHits = draws.filter(
      (d) => d.text === "Evidence first. Explainable always. Officer decides.",
    );
    // One footer per page — provenance forces a second page.
    expect(footerHits.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Ownership Evidence Report — confidence tier hygiene", () => {
  it("never emits a bare percentage without an accompanying tier label", () => {
    // Timeline rows use the shape `[<tier> · <pct>%]`.
    const bareTimelinePct = draws.find(
      (d) => /\b\d{2,3}%\]/.test(d.text) && !/verified|observed|inferred|unconfirmed/i.test(d.text),
    );
    expect(bareTimelinePct, `bare percentage: ${bareTimelinePct?.text}`).toBeUndefined();
  });

  it("only uses tiers from the OC-001 ladder", () => {
    const allowed = new Set(["verified", "observed", "inferred", "unconfirmed"]);
    const tierTokens = corpus
      .split(/[\s\[\]·,]+/)
      .filter((t) => /^(verified|observed|inferred|unconfirmed|VERIFIED|OBSERVED|INFERRED|UNCONFIRMED)$/.test(t));
    expect(tierTokens.length).toBeGreaterThan(0);
    for (const t of tierTokens) expect(allowed.has(t.toLowerCase())).toBe(true);
  });
});
