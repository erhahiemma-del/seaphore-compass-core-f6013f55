/**
 * LAYER 2.14 — Policy Engine.
 * Every workflow action passes through this gate BEFORE execution.
 * Never executes — pure validation.
 */
import { supabase } from "@/integrations/supabase/client";

export type Permission =
  | "CAN_CREATE_CASE"
  | "CAN_NOTIFY_CUSTOMS"
  | "CAN_REQUEST_DOCUMENTS"
  | "CAN_ASSIGN_OFFICERS"
  | "CAN_FREEZE_CLEARANCE";

const PERMISSION_ROLES: Record<Permission, string[]> = {
  CAN_CREATE_CASE: ["officer", "director", "admin"],
  CAN_NOTIFY_CUSTOMS: ["officer", "director", "admin"],
  CAN_REQUEST_DOCUMENTS: ["analyst", "officer", "director", "admin"],
  CAN_ASSIGN_OFFICERS: ["director", "admin"],
  CAN_FREEZE_CLEARANCE: ["director", "admin"],
};

const DAILY_LIMIT: Record<Permission, number> = {
  CAN_CREATE_CASE: 40,
  CAN_NOTIFY_CUSTOMS: 60,
  CAN_REQUEST_DOCUMENTS: 200,
  CAN_ASSIGN_OFFICERS: 50,
  CAN_FREEZE_CLEARANCE: 10,
};

const ESCALATION_REQUIRED: Permission[] = ["CAN_FREEZE_CLEARANCE"];

export interface PolicyRequest {
  officer_id: string;
  permission: Permission;
  workspace?: string;
  investigation_id?: string;
}

export interface PolicyDecision {
  allow: boolean;
  reasons: string[];
  requiresEscalation: boolean;
}

export async function evaluatePolicy(req: PolicyRequest): Promise<PolicyDecision> {
  const reasons: string[] = [];

  // 1. Permission: does the officer hold a role that grants this capability?
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", req.officer_id);
  const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
  const permitted = PERMISSION_ROLES[req.permission].some((r) => roles.includes(r));
  if (!permitted) reasons.push(`Missing permission: ${req.permission}`);

  // 2. Scope — for now, workspace is informational only. Placeholder for
  //    future per-workspace scoping without breaking the contract.

  // 3. Escalation
  const requiresEscalation = ESCALATION_REQUIRED.includes(req.permission);

  // 4. Rate limit
  const today = new Date().toISOString().slice(0, 10);
  const { data: counter } = await supabase
    .from("officer_action_counters")
    .select("count")
    .eq("officer_id", req.officer_id)
    .eq("action_key", req.permission)
    .eq("window_day", today)
    .maybeSingle();
  const used = counter?.count ?? 0;
  if (used >= DAILY_LIMIT[req.permission]) {
    reasons.push(`Daily rate limit reached (${used}/${DAILY_LIMIT[req.permission]})`);
  }

  // 5. Conflict — placeholder: caller supplies investigation_id for future
  //    conflict detection between concurrent workflows.

  return {
    allow: reasons.length === 0,
    reasons,
    requiresEscalation,
  };
}

export async function recordActionUsage(officer_id: string, permission: Permission): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("officer_action_counters")
    .select("count")
    .eq("officer_id", officer_id)
    .eq("action_key", permission)
    .eq("window_day", today)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("officer_action_counters")
      .update({ count: existing.count + 1 })
      .eq("officer_id", officer_id)
      .eq("action_key", permission)
      .eq("window_day", today);
  } else {
    await supabase.from("officer_action_counters").insert({
      officer_id,
      action_key: permission,
      window_day: today,
      count: 1,
    });
  }
}
