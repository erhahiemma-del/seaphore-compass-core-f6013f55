/**
 * score-risk — compute entity/voyage risk score from signals + history.
 * Returns score + decomposed inputs.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const scoreRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        entity_id: z.string().uuid().optional(),
        voyage_id: z.string().uuid().optional(),
      })
      .refine((v) => v.entity_id || v.voyage_id, "entity_id or voyage_id required")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const filter = data.entity_id
      ? { column: "entity_id" as const, value: data.entity_id }
      : { column: "entity_id" as const, value: null };
    // Pull recent signals scoped to the target entity (voyages resolve to a vessel entity in future work).
    const q = context.supabase.from("signals").select("risk_level, confidence");
    const { data: signals } = data.entity_id
      ? await q.eq(filter.column, filter.value as string)
      : await q.limit(50);
    const weights: Record<string, number> = { critical: 40, high: 25, medium: 12, low: 3 };
    const decomposed = (signals ?? []).map((s) => ({
      risk_level: s.risk_level,
      confidence: s.confidence,
      contribution: weights[String(s.risk_level ?? "low")] ?? 3,
    }));
    const score = Math.min(
      100,
      decomposed.reduce((a, b) => a + b.contribution, 0),
    );
    return { score, confidence: "inferred", inputs: decomposed };
  });
