/**
 * HR-9 — immutable audit log. Every data-changing action MUST write an entry
 * through `writeAuditLog`. The underlying table has no UPDATE/DELETE policy,
 * so entries cannot be modified or removed by any user role. Reads are
 * restricted to authorised roles via RLS.
 */

import { createServerFn } from "@tanstack/react-start";
import {
  getRequestHeader,
  getRequestIP,
} from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

const auditInput = z.object({
  action: z.string().min(1).max(120),
  entity: z.string().min(1).max(200),
  entityId: z.string().max(200).optional(),
  module: z.string().min(1).max(80),
  ruleRefs: z.array(z.string().max(20)).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AuditInput = z.infer<typeof auditInput>;

export const writeAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => auditInput.parse(data))
  .handler(async ({ data, context }) => {
    const ip =
      getRequestIP({ xForwardedFor: true }) ??
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";

    const { data: row, error } = await context.supabase
      .from("audit_log")
      .insert({
        officer_id: context.userId,
        action: data.action,
        entity: data.entity,
        entity_id: data.entityId ?? null,
        module: data.module,
        rule_refs: data.ruleRefs ?? [],
        metadata: (data.metadata ?? {}) as Json,
        ip_address: ip,
      })
      .select("id, at")
      .single();

    if (error) throw error;
    return { id: row.id as string, at: row.at as string };
  });
