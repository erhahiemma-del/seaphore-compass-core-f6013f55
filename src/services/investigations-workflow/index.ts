/**
 * Sprint 1G — Investigation Workflows Service.
 *
 * Structured, evidence-backed case workflow for vessels, cargo, companies,
 * people, sanctions, compliance, and incidents. Each case carries an
 * immutable audit trail (append-only), evidence links (citations), and a
 * stage machine. Backward compatible with the existing investigations
 * service — this is an additive workflow layer at /investigations-workflow.
 *
 * Golden Rule: Detect. Decide. Act. Every operational recommendation must be
 * explainable, evidence-backed, and human-approved before execution.
 */
import { create } from "zustand";
import type { EvidenceGrade } from "@/services/ial/types";

export type CaseSubjectKind =
  | "vessel"
  | "cargo"
  | "company"
  | "person"
  | "sanction"
  | "compliance"
  | "incident";

export type CaseStage = "intake" | "evidence" | "analysis" | "decision" | "closed";

const ALLOWED_TRANSITIONS: Record<CaseStage, ReadonlyArray<CaseStage>> = {
  intake: ["evidence", "closed"],
  evidence: ["analysis", "closed"],
  analysis: ["decision", "evidence", "closed"],
  decision: ["closed", "analysis"],
  closed: [],
};

export interface CaseSubject {
  readonly kind: CaseSubjectKind;
  readonly id: string;
  readonly label: string;
}

export interface CaseEvidenceLink {
  readonly evidenceId: string;
  readonly source: string;
  readonly sourceName: string;
  readonly grade: EvidenceGrade;
  readonly linkedAt: string;
  readonly linkedBy: string;
  readonly note?: string;
}

export interface CaseFinding {
  readonly id: string;
  readonly label: string;
  readonly rationale: string;
  readonly confidence: EvidenceGrade;
  readonly citations: ReadonlyArray<string>;
  readonly createdAt: string;
  readonly createdBy: string;
  /** Officer-approval gate for enforcement-bearing findings. */
  readonly officerApproved: boolean;
  readonly approvedBy?: string;
  readonly approvedAt?: string;
}

export interface AuditTrailEntry {
  readonly atISO: string;
  readonly actor: string;
  readonly action: string;
  readonly note?: string;
}

export interface InvestigationCase {
  readonly id: string;
  readonly title: string;
  readonly subject: CaseSubject;
  readonly stage: CaseStage;
  readonly openedAt: string;
  readonly openedBy: string;
  readonly closedAt?: string;
  readonly closedBy?: string;
  readonly closureNote?: string;
  readonly priority: "watch" | "monitor" | "act" | "urgent";
  readonly evidence: ReadonlyArray<CaseEvidenceLink>;
  readonly findings: ReadonlyArray<CaseFinding>;
  readonly auditTrail: ReadonlyArray<AuditTrailEntry>;
}

export interface OpenCaseInput {
  readonly title: string;
  readonly subject: CaseSubject;
  readonly openedBy: string;
  readonly priority?: InvestigationCase["priority"];
}

interface WorkflowState {
  cases: ReadonlyArray<InvestigationCase>;
  open(input: OpenCaseInput): InvestigationCase;
  linkEvidence(caseId: string, link: Omit<CaseEvidenceLink, "linkedAt">): void;
  addFinding(caseId: string, f: Omit<CaseFinding, "id" | "createdAt" | "officerApproved">): CaseFinding | undefined;
  approveFinding(caseId: string, findingId: string, officer: string): void;
  advance(caseId: string, to: CaseStage, actor: string, note?: string): boolean;
  close(caseId: string, actor: string, note: string): void;
  reset(): void;
}

function append(c: InvestigationCase, entry: AuditTrailEntry): InvestigationCase {
  return { ...c, auditTrail: [...c.auditTrail, entry] };
}

function upd(cases: ReadonlyArray<InvestigationCase>, id: string, fn: (c: InvestigationCase) => InvestigationCase) {
  return cases.map((c) => (c.id === id ? fn(c) : c));
}

export function canAdvance(from: CaseStage, to: CaseStage): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export const useInvestigationWorkflowStore = create<WorkflowState>((set, get) => ({
  cases: [],
  open(input) {
    const iso = new Date().toISOString();
    const c: InvestigationCase = {
      id: `case_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      title: input.title,
      subject: input.subject,
      stage: "intake",
      openedAt: iso,
      openedBy: input.openedBy,
      priority: input.priority ?? "monitor",
      evidence: [],
      findings: [],
      auditTrail: [{ atISO: iso, actor: input.openedBy, action: "opened" }],
    };
    set((s) => ({ cases: [c, ...s.cases] }));
    return c;
  },
  linkEvidence(caseId, link) {
    const iso = new Date().toISOString();
    set((s) => ({
      cases: upd(s.cases, caseId, (c) =>
        append(
          {
            ...c,
            evidence: [...c.evidence, { ...link, linkedAt: iso }],
          },
          { atISO: iso, actor: link.linkedBy, action: `linked-evidence:${link.evidenceId}` },
        ),
      ),
    }));
  },
  addFinding(caseId, f) {
    const iso = new Date().toISOString();
    const finding: CaseFinding = {
      id: `find_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: iso,
      officerApproved: false,
      ...f,
    };
    set((s) => ({
      cases: upd(s.cases, caseId, (c) =>
        append({ ...c, findings: [...c.findings, finding] }, {
          atISO: iso,
          actor: f.createdBy,
          action: `finding-added:${finding.id}`,
        }),
      ),
    }));
    return finding;
  },
  approveFinding(caseId, findingId, officer) {
    const iso = new Date().toISOString();
    set((s) => ({
      cases: upd(s.cases, caseId, (c) =>
        append(
          {
            ...c,
            findings: c.findings.map((f) =>
              f.id === findingId ? { ...f, officerApproved: true, approvedBy: officer, approvedAt: iso } : f,
            ),
          },
          { atISO: iso, actor: officer, action: `finding-approved:${findingId}` },
        ),
      ),
    }));
  },
  advance(caseId, to, actor, note) {
    const cur = get().cases.find((c) => c.id === caseId);
    if (!cur || !canAdvance(cur.stage, to)) return false;
    const iso = new Date().toISOString();
    set((s) => ({
      cases: upd(s.cases, caseId, (c) =>
        append({ ...c, stage: to }, { atISO: iso, actor, action: `stage:${cur.stage}->${to}`, note }),
      ),
    }));
    return true;
  },
  close(caseId, actor, note) {
    const iso = new Date().toISOString();
    set((s) => ({
      cases: upd(s.cases, caseId, (c) =>
        append(
          { ...c, stage: "closed", closedAt: iso, closedBy: actor, closureNote: note },
          { atISO: iso, actor, action: "closed", note },
        ),
      ),
    }));
  },
  reset() {
    set({ cases: [] });
  },
}));
