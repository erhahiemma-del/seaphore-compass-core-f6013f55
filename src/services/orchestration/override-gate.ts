/**
 * LAYER 3.3 #18 — Human Override Gate.
 *
 * CONSOLIDATED PIPELINE:
 *   captureOverride → (optional) Policy Engine → Workflow Engine → Audit Log
 *
 * The gate itself is unchanged: it persists the officer's Agree / Disagree /
 * Modify / Dismiss decision (DB-immutable). When the caller attaches a
 * `workflow` directive (e.g. from an Officer Action button), the gate now
 * hands off to the canonical Workflow Engine via the canonical Policy Engine.
 * Dismiss/Disagree never trigger workflows.
 */
import { supabase } from "@/integrations/supabase/client";
import { defaultPolicyEngine, type ApprovalToken } from "@/services/policy";
import {
  WorkflowEngine,
  type OfficerContext,
  type WorkflowId,
  type WorkflowRecord,
} from "@/services/workflows";
import { emitEvent } from "./event-bus";
import type { OverrideDecision } from "./types";

export interface OverrideWorkflowDirective {
  readonly workflow: WorkflowId;
  readonly input: Readonly<Record<string, unknown>>;
  readonly approval?: ApprovalToken;
}

export interface OverrideInput {
  briefing_id: string;
  officer_id: string;
  officer_name?: string;
  officer_role?: OfficerContext["role"];
  decision: OverrideDecision;
  justification?: string;
  modifications?: Record<string, unknown>;
  /** When present and decision ∈ {agree, modify}, dispatched via policy+workflow. */
  workflow?: OverrideWorkflowDirective;
}

export interface OverrideResult {
  id: string;
  workflow?: {
    dispatched: boolean;
    reason?: string;
    outcome?: string;
    record?: WorkflowRecord;
  };
}

const engine = new WorkflowEngine({ policy: defaultPolicyEngine });

export async function captureOverride(input: OverrideInput): Promise<OverrideResult> {
  const { data, error } = await supabase
    .from("briefing_overrides")
    .insert({
      briefing_id: input.briefing_id,
      officer_id: input.officer_id,
      decision: input.decision,
      justification: input.justification ?? null,
      modifications: (input.modifications ?? null) as never,
    })
    .select("id")
    .single();
  if (error) throw error;

  await emitEvent({
    event_type: "officer.actioned",
    payload: { briefing_id: input.briefing_id, decision: input.decision },
    emitted_by: input.officer_id,
  });

  const result: OverrideResult = { id: data.id as string };

  // Only agree / modify may execute a downstream workflow.
  const dispatchable = input.decision === "agree" || input.decision === "modify";
  if (!dispatchable || !input.workflow) return result;

  const officer: OfficerContext = {
    officerId: input.officer_id,
    officerName: input.officer_name ?? "officer",
    role: input.officer_role ?? "officer",
  };

  // 1. Policy validation — every officer action passes through the gate.
  const decision = defaultPolicyEngine.evaluate({
    workflow: input.workflow.workflow,
    officer,
    input: input.workflow.input,
    approval: input.workflow.approval,
  });
  if (!decision.allowed) {
    result.workflow = { dispatched: false, reason: decision.reason, outcome: decision.outcome };
    return result;
  }

  // 2. Workflow dispatch — canonical engine handles retries, state, audit.
  const record = await engine.trigger({
    workflow: input.workflow.workflow,
    officer,
    input: input.workflow.input,
    correlationId: input.briefing_id,
  });

  // 3. Audit hand-off — the workflow engine writes its own transitions; we
  //    add an orchestration-level event so briefing timelines line up.
  await emitEvent({
    event_type: "officer.actioned",
    payload: {
      briefing_id: input.briefing_id,
      workflow: input.workflow.workflow,
      run_id: record.id,
      status: record.status,
    },
    emitted_by: input.officer_id,
  });

  result.workflow = { dispatched: true, outcome: decision.outcome, record };
  return result;
}

/** Exposed so a single engine instance is reused for direct workflow triggers. */
export const overrideWorkflowEngine = engine;
