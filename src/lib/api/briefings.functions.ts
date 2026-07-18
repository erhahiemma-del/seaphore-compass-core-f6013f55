import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { envelope } from "./envelope";

/**
 * POST /api/briefings — assembles + optionally sends a briefing.
 * Delegates document assembly to the generate-brief edge function
 * (implemented as a server function in this project — see
 * `src/lib/api/edge-functions/generate-brief.functions.ts`).
 */
export const createBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        investigation_id: z.string().uuid(),
        audience: z.string().min(1),
        send: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("briefings")
      .insert({
        audience: data.audience,
        authorized_by: context.userId,
        authorized_at: new Date().toISOString(),
        export_envelope: { investigation_id: data.investigation_id, sent: data.send },
      } as never)
      .select("*")
      .single();
    if (error) throw error;
    return envelope(row);
  });
