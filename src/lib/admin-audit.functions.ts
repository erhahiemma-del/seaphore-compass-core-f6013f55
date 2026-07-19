/**
 * Administration audit trail — server functions.
 *
 * Reads immutable role.manage entries from `public.audit_log` and
 * enriches them with actor + target profile metadata so administrators
 * can see WHO changed WHAT for WHOM and WHEN.
 *
 * Caller MUST be an administrator. RLS on audit_log already restricts
 * reads, but we double-check with `has_role` before loading the admin
 * client for the profile join (HR-9 / PERM-1).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { Role } from "@/lib/permissions";

type AuthedContext = { supabase: SupabaseClient<Database>; userId: string };

async function assertCallerIsAdmin(context: AuthedContext): Promise<void> {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("Unable to verify caller role");
  if (data !== true) throw new Error("Forbidden — admin role required");
}

export interface RoleAuditEntry {
  id: string;
  at: string;
  action: string;
  ruleRefs: string[];
  ipAddress: string | null;
  actor: {
    id: string | null;
    email: string | null;
    fullName: string | null;
  };
  target: {
    id: string;
    email: string | null;
    fullName: string | null;
  };
  added: Role[];
  removed: Role[];
}

const listInput = z
  .object({
    targetUserId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .optional();

export const listRoleAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listInput.parse(data) ?? {})
  .handler(async ({ data, context }): Promise<RoleAuditEntry[]> => {
    await assertCallerIsAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("audit_log")
      .select("id, at, action, rule_refs, ip_address, metadata, officer_id, entity_id")
      .eq("action", "role.manage")
      .eq("entity", "user_roles")
      .order("at", { ascending: false })
      .limit(data.limit ?? 200);

    if (data.targetUserId) q = q.eq("entity_id", data.targetUserId);

    const { data: rows, error } = await q;
    if (error) throw error;

    const userIds = new Set<string>();
    for (const r of rows ?? []) {
      if (r.officer_id) userIds.add(r.officer_id);
      if (r.entity_id) userIds.add(r.entity_id);
    }

    let profilesById = new Map<string, { email: string | null; fullName: string | null }>();
    if (userIds.size > 0) {
      const { data: profiles, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name")
        .in("id", [...userIds]);
      if (pErr) throw pErr;
      profilesById = new Map(
        (profiles ?? []).map((p) => [
          p.id,
          { email: p.email ?? null, fullName: p.full_name ?? null },
        ]),
      );
    }

    const roleArray = (v: unknown): Role[] =>
      Array.isArray(v)
        ? (v.filter((x) => typeof x === "string") as Role[])
        : [];

    return (rows ?? []).map((r) => {
      const meta = (r.metadata ?? {}) as { added?: unknown; removed?: unknown };
      const actorProfile = r.officer_id ? profilesById.get(r.officer_id) : undefined;
      const targetProfile = r.entity_id ? profilesById.get(r.entity_id) : undefined;
      return {
        id: r.id as string,
        at: r.at as string,
        action: r.action as string,
        ruleRefs: (r.rule_refs ?? []) as string[],
        ipAddress: (r.ip_address as string | null) ?? null,
        actor: {
          id: (r.officer_id as string | null) ?? null,
          email: actorProfile?.email ?? null,
          fullName: actorProfile?.fullName ?? null,
        },
        target: {
          id: (r.entity_id as string) ?? "",
          email: targetProfile?.email ?? null,
          fullName: targetProfile?.fullName ?? null,
        },
        added: roleArray(meta.added),
        removed: roleArray(meta.removed),
      };
    });
  });
