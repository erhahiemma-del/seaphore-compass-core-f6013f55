/**
 * Sprint 1G — Revenue Leakage Detection Engine.
 *
 * Deterministic detectors that scan fused evidence for revenue leakage
 * signals (manifest under-declaration, unpaid port fees, cargo under-value,
 * declared-vs-actual movement mismatch, compliance-linked fee bypass).
 * Every finding carries factors, an explanation, citations, an estimated
 * magnitude in currency units, and a priority band. OSAE remains the sole
 * authority for operational priority — this engine only computes leakage
 * severity; enforcement always requires human approval.
 *
 * Golden Rule: Detect. Decide. Act. Every operational recommendation must be
 * explainable, evidence-backed, and human-approved before execution.
 */
import { create } from "zustand";
import type { EvidenceGrade, NormalizedEvidence } from "@/services/ial/types";

export type LeakageCategory =
  | "manifest-under-declaration"
  | "unpaid-port-fee"
  | "cargo-under-value"
  | "movement-mismatch"
  | "compliance-linked-bypass";

export type LeakagePriority = "watch" | "elevated" | "high" | "critical";

export interface LeakageFactor {
  readonly label: string;
  readonly weight: number;
  readonly evidenceIds: ReadonlyArray<string>;
}

export interface LeakageFinding {
  readonly id: string;
  readonly category: LeakageCategory;
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly headline: string;
  readonly explanation: string;
  readonly magnitudeCurrency: string;
  /** Estimated leaked amount, in currency units. */
  readonly magnitude: number;
  readonly confidence: EvidenceGrade;
  readonly priority: LeakagePriority;
  readonly factors: ReadonlyArray<LeakageFactor>;
  readonly citations: ReadonlyArray<{ evidenceId: string; source: string; grade: EvidenceGrade }>;
  readonly detectedAt: string;
  /** Officer approval is required before any enforcement action. */
  readonly humanApproved: boolean;
  readonly approvedBy?: string;
  readonly approvedAt?: string;
}

const GRADE_RANK: Record<EvidenceGrade, number> = {
  OBSERVED: 1,
  DECLARED: 2,
  INFERRED: 3,
  CORROBORATED: 4,
  VERIFIED: 5,
  AUDITED: 6,
};

function weakestGrade(grades: ReadonlyArray<EvidenceGrade>): EvidenceGrade {
  if (grades.length === 0) return "INFERRED";
  return grades.reduce((min, g) => (GRADE_RANK[g] < GRADE_RANK[min] ? g : min), grades[0]);
}

function priorityFor(magnitude: number, confidence: EvidenceGrade): LeakagePriority {
  const cw = GRADE_RANK[confidence] / 6;
  const score = magnitude * cw;
  if (score >= 500_000) return "critical";
  if (score >= 100_000) return "high";
  if (score >= 20_000) return "elevated";
  return "watch";
}

function readNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function readStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

type DetectorContext = { readonly now: Date };
type Detector = (ev: ReadonlyArray<NormalizedEvidence>, ctx: DetectorContext) => LeakageFinding[];

const detectManifestUnderDeclaration: Detector = (ev, ctx) => {
  return ev
    .filter((e) => e.kind === "manifest" || e.kind === "cargo")
    .flatMap((e) => {
      const declared = readNum(e.fields["declaredTonnage"]) ?? readNum(e.fields["manifestTonnage"]);
      const actual = readNum(e.fields["actualTonnage"]);
      if (declared === undefined || actual === undefined || declared <= 0) return [];
      const gap = actual - declared;
      if (gap <= declared * 0.1) return [];
      const feePerTonne = readNum(e.fields["feePerTonne"]) ?? 15;
      const magnitude = Math.round(gap * feePerTonne);
      const conf = e.grade;
      return [
        {
          id: `leak_manifest_${e.id}`,
          category: "manifest-under-declaration" as const,
          subjectId: e.entity.id,
          subjectLabel: e.entity.label ?? e.entity.id,
          headline: `Manifest under-declaration: +${gap.toFixed(1)}t vs declared`,
          explanation: `Declared ${declared.toFixed(1)}t vs observed ${actual.toFixed(1)}t. Estimated unpaid duty at ${feePerTonne}/t.`,
          magnitudeCurrency: readStr(e.fields["currency"]) ?? "USD",
          magnitude,
          confidence: conf,
          priority: priorityFor(magnitude, conf),
          factors: [
            { label: `Declared ${declared.toFixed(1)}t`, weight: 0.3, evidenceIds: [e.id] },
            { label: `Actual ${actual.toFixed(1)}t`, weight: 0.7, evidenceIds: [e.id] },
          ],
          citations: [{ evidenceId: e.id, source: e.source, grade: e.grade }],
          detectedAt: ctx.now.toISOString(),
          humanApproved: false,
        },
      ];
    });
};

const detectUnpaidPortFee: Detector = (ev, ctx) => {
  return ev
    .filter((e) => e.kind === "port-call" || readStr(e.fields["expectedFee"]) !== undefined || readNum(e.fields["expectedFee"]) !== undefined)
    .flatMap((e) => {
      const expected = readNum(e.fields["expectedFee"]);
      const paid = readNum(e.fields["paidFee"]);
      if (expected === undefined || paid === undefined || expected <= 0) return [];
      const gap = expected - paid;
      if (gap <= expected * 0.05) return [];
      const conf = e.grade;
      return [
        {
          id: `leak_port_${e.id}`,
          category: "unpaid-port-fee" as const,
          subjectId: e.entity.id,
          subjectLabel: e.entity.label ?? e.entity.id,
          headline: `Port fee shortfall at ${readStr(e.fields["portCode"]) ?? "port"}`,
          explanation: `Expected fee ${expected.toFixed(0)}, paid ${paid.toFixed(0)}. Shortfall ${gap.toFixed(0)}.`,
          magnitudeCurrency: readStr(e.fields["currency"]) ?? "USD",
          magnitude: Math.round(gap),
          confidence: conf,
          priority: priorityFor(gap, conf),
          factors: [
            { label: "Expected fee", weight: 0.5, evidenceIds: [e.id] },
            { label: "Paid fee", weight: 0.5, evidenceIds: [e.id] },
          ],
          citations: [{ evidenceId: e.id, source: e.source, grade: e.grade }],
          detectedAt: ctx.now.toISOString(),
          humanApproved: false,
        },
      ];
    });
};

const detectCargoUnderValue: Detector = (ev, ctx) => {
  return ev
    .filter((e) => e.kind === "cargo")
    .flatMap((e) => {
      const declared = readNum(e.fields["declaredValue"]);
      const market = readNum(e.fields["marketValue"]);
      if (declared === undefined || market === undefined || declared <= 0) return [];
      const gap = market - declared;
      if (gap <= declared * 0.25) return [];
      const dutyRate = readNum(e.fields["dutyRate"]) ?? 0.05;
      const magnitude = Math.round(gap * dutyRate);
      const conf = e.grade;
      return [
        {
          id: `leak_value_${e.id}`,
          category: "cargo-under-value" as const,
          subjectId: e.entity.id,
          subjectLabel: e.entity.label ?? e.entity.id,
          headline: `Cargo under-valuation: ${((gap / declared) * 100).toFixed(0)}% below market`,
          explanation: `Declared ${declared.toFixed(0)} vs market ${market.toFixed(0)}. Duty at ${(dutyRate * 100).toFixed(1)}%.`,
          magnitudeCurrency: readStr(e.fields["currency"]) ?? "USD",
          magnitude,
          confidence: conf,
          priority: priorityFor(magnitude, conf),
          factors: [
            { label: "Declared value", weight: 0.4, evidenceIds: [e.id] },
            { label: "Market benchmark", weight: 0.6, evidenceIds: [e.id] },
          ],
          citations: [{ evidenceId: e.id, source: e.source, grade: e.grade }],
          detectedAt: ctx.now.toISOString(),
          humanApproved: false,
        },
      ];
    });
};

const detectMovementMismatch: Detector = (ev, ctx) => {
  return ev
    .filter((e) => e.kind === "voyage")
    .flatMap((e) => {
      const declaredPort = readStr(e.fields["declaredPort"]);
      const actualPort = readStr(e.fields["actualPort"]);
      if (!declaredPort || !actualPort || declaredPort === actualPort) return [];
      if (e.fields["unscheduled"] !== true) return [];
      const magnitude = readNum(e.fields["estimatedFeeLoss"]) ?? 15_000;
      const conf = e.grade;
      return [
        {
          id: `leak_move_${e.id}`,
          category: "movement-mismatch" as const,
          subjectId: e.entity.id,
          subjectLabel: e.entity.label ?? e.entity.id,
          headline: `Unscheduled port call: ${declaredPort} → ${actualPort}`,
          explanation: `Declared destination ${declaredPort}; actual ${actualPort} logged as unscheduled. Fees and inspections likely bypassed.`,
          magnitudeCurrency: "USD",
          magnitude,
          confidence: conf,
          priority: priorityFor(magnitude, conf),
          factors: [{ label: "Declared vs actual mismatch", weight: 1, evidenceIds: [e.id] }],
          citations: [{ evidenceId: e.id, source: e.source, grade: e.grade }],
          detectedAt: ctx.now.toISOString(),
          humanApproved: false,
        },
      ];
    });
};

const detectComplianceLinkedBypass: Detector = (ev, ctx) => {
  // Pair sanctions/PSC hits with any fee waiver on the same subject.
  const hitsBySubject = new Map<string, NormalizedEvidence>();
  for (const e of ev) {
    if ((e.kind === "sanctions" || e.kind === "compliance") && e.grade !== "OBSERVED") {
      hitsBySubject.set(e.entity.id, e);
    }
  }
  return ev
    .filter((e) => e.fields["feeWaiver"] === true && hitsBySubject.has(e.entity.id))
    .map((e) => {
      const hit = hitsBySubject.get(e.entity.id)!;
      const magnitude = readNum(e.fields["waivedAmount"]) ?? 25_000;
      const conf = weakestGrade([e.grade, hit.grade]);
      return {
        id: `leak_bypass_${e.id}`,
        category: "compliance-linked-bypass" as const,
        subjectId: e.entity.id,
        subjectLabel: e.entity.label ?? e.entity.id,
        headline: `Fee waiver on subject with active ${hit.kind} hit`,
        explanation: `A fee waiver was applied while ${hit.kind} evidence (${hit.sourceName}) is active. Waiver requires re-review.`,
        magnitudeCurrency: readStr(e.fields["currency"]) ?? "USD",
        magnitude,
        confidence: conf,
        priority: priorityFor(magnitude, conf),
        factors: [
          { label: `${hit.kind} hit`, weight: 0.6, evidenceIds: [hit.id] },
          { label: "Fee waiver applied", weight: 0.4, evidenceIds: [e.id] },
        ],
        citations: [
          { evidenceId: e.id, source: e.source, grade: e.grade },
          { evidenceId: hit.id, source: hit.source, grade: hit.grade },
        ],
        detectedAt: ctx.now.toISOString(),
        humanApproved: false,
      };
    });
};

const DEFAULT_DETECTORS: ReadonlyArray<Detector> = [
  detectManifestUnderDeclaration,
  detectUnpaidPortFee,
  detectCargoUnderValue,
  detectMovementMismatch,
  detectComplianceLinkedBypass,
];

export function scanForLeakage(
  evidence: ReadonlyArray<NormalizedEvidence>,
  opts?: { now?: () => Date },
): LeakageFinding[] {
  const ctx: DetectorContext = { now: (opts?.now ?? (() => new Date()))() };
  const findings = DEFAULT_DETECTORS.flatMap((d) => d(evidence, ctx));
  // Deterministic ordering: priority desc, then magnitude desc, then id.
  const rank: Record<LeakagePriority, number> = { critical: 4, high: 3, elevated: 2, watch: 1 };
  return findings.sort((a, b) => {
    if (rank[b.priority] !== rank[a.priority]) return rank[b.priority] - rank[a.priority];
    if (b.magnitude !== a.magnitude) return b.magnitude - a.magnitude;
    return a.id.localeCompare(b.id);
  });
}

interface LeakageState {
  findings: ReadonlyArray<LeakageFinding>;
  scan(ev: ReadonlyArray<NormalizedEvidence>): LeakageFinding[];
  approve(id: string, officer: string): void;
  dismiss(id: string, officer: string, reason: string): void;
  reset(): void;
}

export const useRevenueLeakageStore = create<LeakageState>((set) => ({
  findings: [],
  scan(ev) {
    const findings = scanForLeakage(ev);
    set({ findings });
    return findings;
  },
  approve(id, officer) {
    set((s) => ({
      findings: s.findings.map((f) =>
        f.id === id ? { ...f, humanApproved: true, approvedBy: officer, approvedAt: new Date().toISOString() } : f,
      ),
    }));
  },
  dismiss(id, _officer, _reason) {
    set((s) => ({ findings: s.findings.filter((f) => f.id !== id) }));
  },
  reset() {
    set({ findings: [] });
  },
}));
