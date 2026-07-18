import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { envelope } from "./envelope";

const ListInput = z.object({
  domain: z.string().optional(),
  riskLevel: z.string().optional(),
  status: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const listSignals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("signals")
      .select("*")
      .order("observed_at", { ascending: false })
      .limit(200);
    if (data.domain) q = q.eq("domain", data.domain);
    if (data.from) q = q.gte("observed_at", data.from);
    if (data.to) q = q.lte("observed_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    return envelope(rows ?? []);
  });
