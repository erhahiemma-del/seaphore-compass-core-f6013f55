/**
 * Administrator role management — server functions.
 *
 * SECURITY MODEL
 *  - Caller MUST be authenticated (`requireSupabaseAuth`).
 *  - Caller MUST have the `admin` role — verified via the
 *    `has_role` security-definer function using the caller's own
 *    Supabase client (RLS-scoped). Only after that check do we load
 *    the admin client for privileged reads/writes.
 *  - All mutations write to `audit_log` for HR-9 traceability.
 *
 * Never call `supabaseAdmin` before confirming the caller's role —
 * it BYPASSES RLS. See Part E of the Permissions Matrix.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Role } from "@/lib/permissions";

const ROLE_VALUES = ["analyst", "officer", "director", "admin"] as const;
const roleSchema = z.enum(ROLE_VALUES);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertCallerIsAdmin(context: { supabase: any; userId: string }): Promise<void> {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("Unable to verify caller role");
  if (data !== true) throw new Error("Forbidden — admin role required");
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  fullName: string | null;
  rank: string | null;
  agencyId: string | null;
  roles: Role[];
  createdAt: string | null;
}

export const listUsersWithRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertCallerIsAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profilesRes, rolesRes] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, rank, agency_id, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (rolesRes.error) throw rolesRes.error;

    const rolesByUser = new Map<string, Role[]>();
    for (const r of rolesRes.data ?? []) {
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(r.role as Role);
      rolesByUser.set(r.user_id, list);
    }

    return (profilesRes.data ?? []).map((p) => ({
      id: p.id,
      email: p.email ?? null,
      fullName: p.full_name ?? null,
      rank: p.rank ?? null,
      agencyId: p.agency_id ?? null,
      roles: rolesByUser.get(p.id) ?? [],
      createdAt: p.created_at ?? null,
    }));
  });

const setRolesInput = z.object({
  userId: z.string().uuid(),
  roles: z.array(roleSchema).max(4),
});

export const setUserRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => setRolesInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context);

    if (data.userId === context.userId && !data.roles.includes("admin")) {
      throw new Error("You cannot revoke your own Administrator role");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: readErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    if (readErr) throw readErr;

    const current = new Set((existing ?? []).map((r) => r.role as Role));
    const next = new Set<Role>(data.roles);

    const toAdd = [...next].filter((r) => !current.has(r));
    const toRemove = [...current].filter((r) => !next.has(r));

    if (toAdd.length > 0) {
      const { error } = await supabaseAdmin.from("user_roles").insert(
        toAdd.map((role) => ({
          user_id: data.userId,
          role,
          granted_by: context.userId,
        })),
      );
      if (error) throw error;
    }

    if (toRemove.length > 0) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .in("role", toRemove);
      if (error) throw error;
    }

    // HR-9 audit trail — inserted directly so the caller's identity is preserved.
    await supabaseAdmin.from("audit_log").insert({
      action: "role.manage",
      entity: "user_roles",
      entity_id: data.userId,
      module: "administration",
      rule_refs: ["PERM-1", "HR-9"],
      metadata: { added: toAdd, removed: toRemove },
      actor_id: context.userId,
    });

    return { added: toAdd, removed: toRemove };
  });
