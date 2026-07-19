/**
 * Data-source health monitor — server function.
 * Iterates every registered adapter, runs its healthCheck(), and writes the
 * result to public.data_source_health. Only administrators may trigger it.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listAdapters } from "@/adapters/matrix-registry";

export const runDataSourceHealthChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden — administrator role required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adapters = listAdapters();
    const rows: Array<{
      source_id: string;
      state: string;
      latency_ms: number | null;
      error_code: string | null;
      error_message: string | null;
      checked_at: string;
    }> = [];

    for (const { id, adapter } of adapters) {
      try {
        const report = await adapter.healthCheck();
        rows.push({
          source_id: id,
          state: report.state,
          latency_ms: report.latencyMs ?? null,
          error_code: report.errorCode ?? null,
          error_message: report.errorMessage ?? null,
          checked_at: report.checkedAt,
        });
      } catch (err) {
        rows.push({
          source_id: id,
          state: "DOWN",
          latency_ms: null,
          error_code: "ADAPTER_THREW",
          error_message: err instanceof Error ? err.message : String(err),
          checked_at: new Date().toISOString(),
        });
      }
    }

    const { error } = await supabaseAdmin.from("data_source_health").insert(rows);
    if (error) throw new Error(error.message);
    return { checked: rows.length, at: new Date().toISOString() };
  });
