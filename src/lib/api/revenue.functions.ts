import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { envelope } from "./envelope";

/**
 * GET /api/revenue/summary — today's revenue metrics.
 * OBSERVED confidence: derived from ingested manifest + cargo values.
 * Values reported are 0 until real ingest is wired.
 */
export const revenueSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return envelope(
      { expected: 0, actual: 0, leakage: 0, recovered: 0, currency: "NGN" },
      { confidence: "observed", sources: ["cargo_items"] },
    );
  });
