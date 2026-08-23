/**
 * Sprint 1G — AI-Assisted Mission Planning Service.
 *
 * Deterministic, evidence-backed mission planner. Consumes PIE predictions
 * and unified intelligence and derives a Mission Plan (objectives, tasks,
 * resource allocation, timeline, recommendations). Every recommendation
 * carries factors + citations. Missions require officer approval before
 * they can advance to `executing`.
 *
 * Golden Rule: Detect. Decide. Act. Every operational recommendation must be
 * explainable, evidence-backed, and human-approved before execution.
 */
import { create } from "zustand";
import type { Prediction } from "@/services/pie";
import type { EvidenceGrade } from "@/services/ial/types";

export type MissionType =
  | "surveillance"
  | "interdiction"
  | "inspection"
  | "compliance-audit"
  | "revenue-audit"
  | "search-and-rescue"
  | "escort";

export type MissionStatus =
  "draft" | "pending-approval" | "approved" | "executing" | "completed" | "rejected" | "aborted";

export interface MissionSubject {
  readonly kind: "vessel" | "port" | "company" | "person" | "cargo";
  readonly id: string;
  readonly label: string;
}

export interface MissionObjective {
  readonly id: string;
  readonly label: string;
  readonly rationale: string;
  readonly citations: ReadonlyArray<string>;
}

export interface MissionTask {
  readonly id: string;
  readonly label: string;
  readonly assignee?: string;
  readonly dependsOn: ReadonlyArray<string>;
  readonly etaHours: number;
  readonly status: "pending" | "in-progress" | "done" | "blocked";
}

export interface MissionResource {
  readonly kind:
    "patrol-vessel" | "aircraft" | "inspection-team" | "analyst" | "legal" | "port-authority";
  readonly label: string;
  readonly quantity: number;
  readonly rationale: string;
}

export interface MissionTimelineEvent {
  readonly atHour: number;
  readonly label: string;
  readonly kind: "start" | "checkpoint" | "decision" | "handover" | "end";
}

export interface MissionRecommendation {
  readonly id: string;
  readonly label: string;
  readonly rationale: string;
  readonly confidence: EvidenceGrade;
  readonly factors: ReadonlyArray<{ label: string; weight: number }>;
  readonly citations: ReadonlyArray<string>;
  readonly humanApproved: boolean;
  readonly approvedBy?: string;
  readonly approvedAt?: string;
}

export interface MissionPlan {
  readonly id: string;
  readonly name: string;
  readonly type: MissionType;
  readonly subjects: ReadonlyArray<MissionSubject>;
  readonly status: MissionStatus;
  readonly objectives: ReadonlyArray<MissionObjective>;
  readonly tasks: ReadonlyArray<MissionTask>;
  readonly resources: ReadonlyArray<MissionResource>;
  readonly timeline: ReadonlyArray<MissionTimelineEvent>;
  readonly recommendations: ReadonlyArray<MissionRecommendation>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly approvedBy?: string;
  readonly rejectedReason?: string;
  readonly auditTrail: ReadonlyArray<{
    atISO: string;
    actor: string;
    action: string;
    note?: string;
  }>;
  /** Investigation this mission was bridged from — required for every plan created via the sanctioned bridge. */
  readonly sourceInvestigationId?: string;
  /** Canonical UIP id inherited from the source investigation. Provides the full pipeline trace UIP → Investigation → Mission. */
  readonly sourceUipId?: string;
}

export interface PlanMissionInput {
  readonly name: string;
  readonly type: MissionType;
  readonly subjects: ReadonlyArray<MissionSubject>;
  readonly predictions?: ReadonlyArray<Prediction>;
  readonly hints?: ReadonlyArray<string>;
  readonly sourceInvestigationId?: string;
  readonly sourceUipId?: string;
}

const OBJECTIVES_BY_TYPE: Record<MissionType, ReadonlyArray<string>> = {
  surveillance: ["Maintain continuous track", "Detect dark events", "Corroborate identity"],
  interdiction: ["Establish contact", "Board and inspect", "Secure evidence"],
  inspection: ["Verify manifest", "Inspect cargo holds", "Check crew documents"],
  "compliance-audit": [
    "Verify PSC record",
    "Check flag documentation",
    "Review class certificates",
  ],
  "revenue-audit": ["Reconcile manifests", "Verify port fees", "Match cargo declarations"],
  "search-and-rescue": ["Localize target", "Establish comms", "Recover persons"],
  escort: ["Rendezvous with subject", "Maintain protective posture", "Handover at destination"],
};

const RESOURCES_BY_TYPE: Record<MissionType, ReadonlyArray<Omit<MissionResource, "rationale">>> = {
  surveillance: [
    { kind: "aircraft", label: "MPA sortie", quantity: 1 },
    { kind: "analyst", label: "AIS analyst", quantity: 1 },
  ],
  interdiction: [
    { kind: "patrol-vessel", label: "OPV", quantity: 1 },
    { kind: "inspection-team", label: "Boarding team", quantity: 1 },
  ],
  inspection: [{ kind: "inspection-team", label: "PSC inspectors", quantity: 1 }],
  "compliance-audit": [
    { kind: "analyst", label: "Compliance analyst", quantity: 1 },
    { kind: "legal", label: "Legal advisor", quantity: 1 },
  ],
  "revenue-audit": [
    { kind: "analyst", label: "Revenue analyst", quantity: 1 },
    { kind: "port-authority", label: "Port liaison", quantity: 1 },
  ],
  "search-and-rescue": [
    { kind: "patrol-vessel", label: "SAR unit", quantity: 1 },
    { kind: "aircraft", label: "SAR helicopter", quantity: 1 },
  ],
  escort: [{ kind: "patrol-vessel", label: "Escort OPV", quantity: 1 }],
};

function planTimeline(type: MissionType): MissionTimelineEvent[] {
  const base: MissionTimelineEvent[] = [
    { atHour: 0, label: "Mission start", kind: "start" },
    { atHour: 2, label: "Situational picture confirmed", kind: "checkpoint" },
  ];
  const tail: Partial<Record<MissionType, MissionTimelineEvent[]>> = {
    interdiction: [
      { atHour: 6, label: "Approach & hail", kind: "checkpoint" },
      { atHour: 8, label: "Boarding decision", kind: "decision" },
      { atHour: 12, label: "Handover to port authority", kind: "handover" },
      { atHour: 14, label: "Mission end", kind: "end" },
    ],
    surveillance: [
      { atHour: 8, label: "Track review", kind: "checkpoint" },
      { atHour: 16, label: "Report to Ops", kind: "handover" },
      { atHour: 24, label: "Mission end", kind: "end" },
    ],
    "revenue-audit": [
      { atHour: 4, label: "Manifest reconciliation", kind: "checkpoint" },
      { atHour: 12, label: "Findings review", kind: "decision" },
      { atHour: 24, label: "Report issued", kind: "end" },
    ],
  };
  return [
    ...base,
    ...(tail[type] ?? [
      { atHour: 8, label: "Progress review", kind: "checkpoint" },
      { atHour: 24, label: "Mission end", kind: "end" },
    ]),
  ];
}

function deriveRecommendationsFromPredictions(
  preds: ReadonlyArray<Prediction>,
): MissionRecommendation[] {
  return preds
    .filter((p) => p.alert || p.severity === "elevated" || p.severity === "critical")
    .map((p, i) => ({
      id: `rec_pred_${p.id}_${i}`,
      label: `Address ${p.category}: ${p.headline}`,
      rationale: p.explanation,
      confidence: p.confidence,
      factors: p.factors.map((f) => ({ label: f.label, weight: f.weight })),
      citations: p.citations.map((c) => c.evidenceId),
      humanApproved: false,
    }));
}

export function planMission(input: PlanMissionInput, opts?: { now?: () => Date }): MissionPlan {
  const now = (opts?.now ?? (() => new Date()))();
  const iso = now.toISOString();
  const id = `mission_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const objectives: MissionObjective[] = OBJECTIVES_BY_TYPE[input.type].map((label, i) => ({
    id: `obj_${i}`,
    label,
    rationale: `Standard ${input.type} objective; scoped to ${input.subjects.map((s) => s.label).join(", ") || "declared subjects"}.`,
    citations: (input.predictions ?? [])
      .flatMap((p) => p.citations.map((c) => c.evidenceId))
      .slice(0, 3),
  }));

  const tasks: MissionTask[] = objectives.map((o, i) => ({
    id: `task_${i}`,
    label: `Execute — ${o.label}`,
    dependsOn: i === 0 ? [] : [`task_${i - 1}`],
    etaHours: 2 + i * 2,
    status: "pending",
  }));

  const resources: MissionResource[] = RESOURCES_BY_TYPE[input.type].map((r) => ({
    ...r,
    rationale: `Required for ${input.type} mission against ${input.subjects.length} subject(s).`,
  }));

  const recommendations = deriveRecommendationsFromPredictions(input.predictions ?? []);

  return {
    id,
    name: input.name,
    type: input.type,
    subjects: input.subjects,
    status: "draft",
    objectives,
    tasks,
    resources,
    timeline: planTimeline(input.type),
    recommendations,
    createdAt: iso,
    updatedAt: iso,
    sourceInvestigationId: input.sourceInvestigationId,
    sourceUipId: input.sourceUipId,
    auditTrail: [{ atISO: iso, actor: "system", action: "created" }],
  };
}

interface MissionState {
  plans: ReadonlyArray<MissionPlan>;
  create(input: PlanMissionInput): MissionPlan;
  submitForApproval(id: string, actor: string): void;
  approve(id: string, officer: string, note?: string): void;
  approveRecommendation(planId: string, recId: string, officer: string): void;
  reject(id: string, officer: string, reason: string): void;
  execute(id: string, officer: string): void;
  complete(id: string, officer: string): void;
  reset(): void;
}

function update(
  plans: ReadonlyArray<MissionPlan>,
  id: string,
  fn: (p: MissionPlan) => MissionPlan,
): ReadonlyArray<MissionPlan> {
  return plans.map((p) => (p.id === id ? fn(p) : p));
}

export const useMissionStore = create<MissionState>((set) => ({
  plans: [],
  create(input) {
    const plan = planMission(input);
    set((s) => ({ plans: [plan, ...s.plans] }));
    return plan;
  },
  submitForApproval(id, actor) {
    set((s) => ({
      plans: update(s.plans, id, (p) =>
        p.status === "draft"
          ? {
              ...p,
              status: "pending-approval",
              updatedAt: new Date().toISOString(),
              auditTrail: [
                ...p.auditTrail,
                { atISO: new Date().toISOString(), actor, action: "submitted" },
              ],
            }
          : p,
      ),
    }));
  },
  approve(id, officer, note) {
    set((s) => ({
      plans: update(s.plans, id, (p) =>
        p.status === "pending-approval"
          ? {
              ...p,
              status: "approved",
              approvedBy: officer,
              updatedAt: new Date().toISOString(),
              auditTrail: [
                ...p.auditTrail,
                { atISO: new Date().toISOString(), actor: officer, action: "approved", note },
              ],
            }
          : p,
      ),
    }));
  },
  approveRecommendation(planId, recId, officer) {
    set((s) => ({
      plans: update(s.plans, planId, (p) => ({
        ...p,
        recommendations: p.recommendations.map((r) =>
          r.id === recId
            ? {
                ...r,
                humanApproved: true,
                approvedBy: officer,
                approvedAt: new Date().toISOString(),
              }
            : r,
        ),
        updatedAt: new Date().toISOString(),
        auditTrail: [
          ...p.auditTrail,
          { atISO: new Date().toISOString(), actor: officer, action: `approved-rec:${recId}` },
        ],
      })),
    }));
  },
  reject(id, officer, reason) {
    set((s) => ({
      plans: update(s.plans, id, (p) => ({
        ...p,
        status: "rejected",
        rejectedReason: reason,
        updatedAt: new Date().toISOString(),
        auditTrail: [
          ...p.auditTrail,
          { atISO: new Date().toISOString(), actor: officer, action: "rejected", note: reason },
        ],
      })),
    }));
  },
  execute(id, officer) {
    set((s) => ({
      plans: update(s.plans, id, (p) => {
        // Golden Rule: execution requires explicit officer approval.
        if (p.status !== "approved") return p;
        return {
          ...p,
          status: "executing",
          updatedAt: new Date().toISOString(),
          auditTrail: [
            ...p.auditTrail,
            { atISO: new Date().toISOString(), actor: officer, action: "executing" },
          ],
        };
      }),
    }));
  },
  complete(id, officer) {
    set((s) => ({
      plans: update(s.plans, id, (p) =>
        p.status === "executing"
          ? {
              ...p,
              status: "completed",
              updatedAt: new Date().toISOString(),
              auditTrail: [
                ...p.auditTrail,
                { atISO: new Date().toISOString(), actor: officer, action: "completed" },
              ],
            }
          : p,
      ),
    }));
  },
  reset() {
    set({ plans: [] });
  },
}));
