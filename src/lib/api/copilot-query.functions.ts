/**
 * POST /api/copilot/query
 * Rate-limited per API-6: 60 requests per officer per hour.
 * Delegates to the existing askCopilot server function for parsing +
 * response synthesis.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { envelope } from "./envelope";
import { askCopilot } from "@/lib/ai/copilot.functions";

const RATE_LIMIT_PER_HOUR = 60;

const Input = z.object({
  instance: z.enum(["seaphore", "manifest", "cargo", "revenue", "memory"]).default("seaphore"),
  query: z.string().min(1).max(500),
});

export const copilotQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    // Bucket the window by hour to match the spec.
    const windowStart = new Date();
    windowStart.setMinutes(0, 0, 0);
    const iso = windowStart.toISOString();

    const { data: existing } = await context.supabase
      .from("copilot_rate_limit")
      .select("id, count")
      .eq("officer_id", context.userId)
      .eq("window_start", iso)
      .maybeSingle();

    const currentCount = existing?.count ?? 0;
    if (currentCount >= RATE_LIMIT_PER_HOUR) {
      throw new Error(
        `[API-6] Copilot rate limit reached (${RATE_LIMIT_PER_HOUR}/hour). Try again next hour.`,
      );
    }

    if (existing) {
      await context.supabase
        .from("copilot_rate_limit")
        .update({ count: currentCount + 1 })
        .eq("id", existing.id);
    } else {
      await context.supabase
        .from("copilot_rate_limit")
        .insert({ officer_id: context.userId, window_start: iso, count: 1 });
    }

    const response = await askCopilot({
      data: { instance: data.instance, query: data.query },
    });
    return envelope(response, { confidence: response.confidence });
  });
