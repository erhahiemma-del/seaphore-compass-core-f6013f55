import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { envelope } from "./envelope";

const Input = z.object({
  officerId: z.string().uuid().optional(),
  entityId: z.string().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("audit_log")
      .select("*")
      .order("at", { ascending: false })
      .limit(500);
    if (data.officerId) q = q.eq("officer_id", data.officerId);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    if (data.action) q = q.eq("action", data.action);
    if (data.from) q = q.gte("at", data.from);
    if (data.to) q = q.lte("at", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    return envelope(rows ?? []);
  });
