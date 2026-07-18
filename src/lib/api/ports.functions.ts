import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { envelope } from "./envelope";

/**
 * GET /api/ports/congestion — INFERRED per spec.
 * Returns empty list until real port telemetry is ingested.
 */
export const portsCongestion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ports } = await context.supabase.from("ports").select("id, name");
    const rows = (ports ?? []).map((p) => ({
      port_id: p.id,
      name: p.name,
      congestion_index: null,
    }));
    return envelope(rows, { confidence: "inferred", sources: ["ports"] });
  });
