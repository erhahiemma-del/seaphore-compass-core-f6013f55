/**
 * detect-duplicates — compare incoming manifest against stored manifests.
 * Returns match candidates with confidence.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const detectDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        voyage_id: z.string().uuid(),
        submitted_by_id: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("manifests")
      .select("id, voyage_id, submitted_by_id, submitted_at")
      .eq("voyage_id", data.voyage_id)
      .order("submitted_at", { ascending: false })
      .limit(10);
    const candidates = (rows ?? []).map((r) => ({
      manifest_id: r.id,
      voyage_id: r.voyage_id,
      confidence: "observed",
      reason: "same voyage_id",
    }));
    return { candidates };
  });
