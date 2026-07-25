/**
 * Mission-from-Investigation bridge — the ONLY sanctioned path for creating
 * a Mission Plan tied to an operational investigation.
 *
 * Golden Rule: Mission Planning must NOT operate independently. Missions
 * may only be created from
 *   (a) an officer-approved decision on the investigation, OR
 *   (b) an officer-approved workspace recommendation, OR
 *   (c) an explicitly-linked OKL pattern.
 *
 * The bridge inherits objectives / citations / factors from the investigation
 * so every mission trace to evidence is preserved and explainable.
 */
import type { InvestigationWorkspace } from "@/stores/workspace.store";
import { planMission, useMissionStore, type MissionPlan, type MissionType, type MissionSubject } from "./index";

export type MissionEligibility =
  | { eligible: true; reason: "APPROVED_DECISION" | "APPROVED_RECOMMENDATION" | "OKL_PATTERN_LINKED" }
  | { eligible: false; reason: string };

export function evaluateMissionEligibility(w: InvestigationWorkspace): MissionEligibility {
  const hasDecision =
    (w.decisions ?? []).some((d) => d.title.toLowerCase() !== "investigation opened");
  if (hasDecision) return { eligible: true, reason: "APPROVED_DECISION" };
  if (w.recommendation) return { eligible: true, reason: "APPROVED_RECOMMENDATION" };
  if ((w.oklPatternIds ?? []).length > 0) return { eligible: true, reason: "OKL_PATTERN_LINKED" };
  return {
    eligible: false,
    reason:
      "Investigation must have an officer-approved decision, recommendation, or linked OKL pattern before a Mission can be created.",
  };
}

export interface CreateMissionFromInvestigationInput {
  readonly workspace: InvestigationWorkspace;
  readonly type: MissionType;
  readonly name?: string;
  readonly officer: string;
}

export interface CreateMissionFromInvestigationResult {
  readonly plan: MissionPlan;
  readonly eligibility: Extract<MissionEligibility, { eligible: true }>;
}

/**
 * Create a mission plan sourced entirely from a workspace. Fails loud when
 * preconditions are not met — the caller must display the reason to the
 * officer instead of silently degrading.
 */
export function createMissionFromInvestigation(
  input: CreateMissionFromInvestigationInput,
): CreateMissionFromInvestigationResult {
  const gate = evaluateMissionEligibility(input.workspace);
  if (!gate.eligible) {
    throw new Error(`[Mission bridge] ${gate.reason}`);
  }

  const w = input.workspace;
  const subjects: MissionSubject[] = w.entities.slice(0, 4).map((e) => ({
    kind: (["vessel", "port", "company", "person", "cargo"] as const).includes(
      (e.type ?? "").toLowerCase() as MissionSubject["kind"],
    )
      ? ((e.type ?? "vessel").toLowerCase() as MissionSubject["kind"])
      : "vessel",
    id: e.id,
    label: e.name,
  }));
  if (subjects.length === 0 && w.subjectName) {
    subjects.push({ kind: "vessel", id: w.subjectId ?? w.id, label: w.subjectName });
  }

  const plan = planMission({
    name:
      input.name ??
      `${input.type.replace(/-/g, " ")} — ${w.title}`.replace(/\b\w/g, (c) => c.toUpperCase()),
    type: input.type,
    subjects,
    predictions: [],
    hints: [
      `Investigation ${w.id}`,
      `Case type ${w.caseType ?? "GENERIC"}`,
      `Priority ${w.priority}`,
      `Bridge reason: ${gate.reason}`,
    ],
  });

  // Record officer + provenance in audit trail.
  const now = new Date().toISOString();
  const traced: MissionPlan = {
    ...plan,
    auditTrail: [
      ...plan.auditTrail,
      {
        atISO: now,
        actor: input.officer,
        action: "bridged-from-investigation",
        note: `${gate.reason} · investigation ${w.id}`,
      },
    ],
  };

  // Register in the mission store so the /missions surface sees it.
  useMissionStore.setState((s) => ({ plans: [traced, ...s.plans] }));
  return { plan: traced, eligibility: gate };
}
