/**
 * MIBC dispatcher tick. Called by pg_cron (every 5 minutes).
 *
 * - Enqueues jobs from schedules whose next_run_at <= now, and advances the schedule.
 * - Resets jobs stuck in CLAIMED > 10 min with exponential backoff.
 *
 * Uses the service-role client because pg_cron authenticates via `apikey` header
 * and we operate on many owners' rows at once. The route is under
 * /api/public/*, which bypasses site auth on published builds — the tick body
 * is bounded, idempotent, and side-effect-free beyond the intended DB writes.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/mibc-tick")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          const { data, error } = await supabaseAdmin.rpc("mibc_dispatch_tick");
          if (error) {
            return Response.json(
              { ok: false, error: error.message },
              { status: 500 },
            );
          }
          return Response.json({ ok: true, result: data });
        } catch (err) {
          return Response.json(
            { ok: false, error: (err as Error).message },
            { status: 500 },
          );
        }
      },
      GET: async () =>
        Response.json({
          ok: true,
          hint: "POST this endpoint via pg_cron every 5 minutes.",
        }),
    },
  },
});
