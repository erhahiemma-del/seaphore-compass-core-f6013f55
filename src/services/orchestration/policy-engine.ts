/**
 * LAYER 2.14 — Policy Engine (delegating adapter).
 *
 * CONSOLIDATION: this module used to hold its own RBAC + escalation logic.
 * It now delegates permission and escalation checks to the canonical
 * Sprint 10 `PolicyEngine` (`@/services/policy`), keeping the DB-backed
 * daily rate limiter as-is so persisted counters continue to work.
 *
 * The `evaluatePolicy` / `recordActionUsage` signatures are preserved so
 * every existing caller (server functions, override gate, UI probes) keeps
 * working unchanged.
 */
import { supabase as browserSupabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PERMISSIONS,
  WORKFLOW_PERMISSION,
  defaultPolicyEngine,
  roleHas,
  escalationFor,
  type Permission,
  type Role,
} from "@/services/policy";
import type { WorkflowId } from "@/services/workflows";

export type { Permission } from "@/services/policy";

/** Inverse of `WORKFLOW_PERMISSION` — permission → the workflow it gates. */
const PERMISSION_WORKFLOW: Readonly<Record<Permission, WorkflowId>> = Object.freeze(
  Object.fromEntries(
    Object.entries(WORKFLOW_PERMISSION).map(([w, p]) => [p, w as WorkflowId]),
  ) as Record<Permission, WorkflowId>,
);

/** Daily DB-backed rate limit per permission. Preserved from the previous impl. */
const DAILY_LIMIT: Record<Permission, number> = {
  CAN_CREATE_CASE: 40,
  CAN_NOTIFY_CUSTOMS: 60,
  CAN_REQUEST_DOCUMENTS: 200,
  CAN_ASSIGN_OFFICERS: 50,
  CAN_FREEZE_CLEARANCE: 10,
};

export interface PolicyRequest {
  officer_id: string;
  permission: Permission;
  workspace?: string;
  investigation_id?: string;
  /** Authenticated Supabase client from a server-fn context. Preferred. */
  supabase?: SupabaseClient;
}

export interface PolicyDecision {
  allow: boolean;
  reasons: string[];
  requiresEscalation: boolean;
}

function clientOf(req: { supabase?: SupabaseClient }): SupabaseClient {
  return req.supabase ?? (browserSupabase as unknown as SupabaseClient);
}

async function fetchOfficerRole(
  client: SupabaseClient,
  officer_id: string,
): Promise<Role | null> {
  const { data } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", officer_id);
  const rolesRaw = (data ?? []).map((r: { role: string }) => r.role);
  const order: Role[] = ["administrator", "director", "officer", "analyst"];
  for (const r of order) if (rolesRaw.includes(r)) return r;
  return null;
}

export async function evaluatePolicy(req: PolicyRequest): Promise<PolicyDecision> {
  if (!PERMISSIONS.includes(req.permission)) {
    return { allow: false, reasons: [`Unknown permission: ${req.permission}`], requiresEscalation: false };
  }

  const client = clientOf(req);
  const reasons: string[] = [];
  const workflow = PERMISSION_WORKFLOW[req.permission];
  const role = await fetchOfficerRole(client, req.officer_id);

  // 1. RBAC via canonical role matrix.
  if (!role || !roleHas(role, req.permission)) {
    reasons.push(`Missing permission: ${req.permission}`);
  }

  // 2. Escalation via canonical rules.
  const requiresEscalation = role ? escalationFor(workflow, role) !== null : false;

  // 3. Daily DB rate limit (preserved for auditability of long windows).
  const today = new Date().toISOString().slice(0, 10);
  const { data: counter } = await client
    .from("officer_action_counters")
    .select("count")
    .eq("officer_id", req.officer_id)
    .eq("action_key", req.permission)
    .eq("window_day", today)
    .maybeSingle();
  const used = (counter as { count?: number } | null)?.count ?? 0;
  if (used >= DAILY_LIMIT[req.permission]) {
    reasons.push(`Daily rate limit reached (${used}/${DAILY_LIMIT[req.permission]})`);
  }

  return { allow: reasons.length === 0, reasons, requiresEscalation };
}

export async function recordActionUsage(
  officer_id: string,
  permission: Permission,
  deps: { supabase?: SupabaseClient } = {},
): Promise<void> {
  const client = clientOf(deps);
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await client
    .from("officer_action_counters")
    .select("count")
    .eq("officer_id", officer_id)
    .eq("action_key", permission)
    .eq("window_day", today)
    .maybeSingle();
  const existingRow = existing as { count: number } | null;
  if (existingRow) {
    await client
      .from("officer_action_counters")
      .update({ count: existingRow.count + 1 })
      .eq("officer_id", officer_id)
      .eq("action_key", permission)
      .eq("window_day", today);
  } else {
    await client.from("officer_action_counters").insert({
      officer_id,
      action_key: permission,
      window_day: today,
      count: 1,
    });
  }
}

/** Re-exported helper so callers can resolve a permission back to a workflow. */
export function workflowForPermission(p: Permission): WorkflowId {
  return PERMISSION_WORKFLOW[p];
}

/** Escape hatch — expose the canonical engine for probe-style UI checks. */
export const canonicalPolicyEngine = defaultPolicyEngine;
