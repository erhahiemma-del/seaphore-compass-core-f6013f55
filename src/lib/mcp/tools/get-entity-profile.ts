import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_entity_profile",
  title: "Get entity profile",
  description:
    "Retrieve a Seaphore entity by id with its recent intelligence signals and open alerts. Every record carries its own confidence grade — the system reports, the officer decides.",
  inputSchema: {
    entity_id: z.string().uuid().describe("Entity UUID from search_entities."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ entity_id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);

    const [entityRes, signalsRes, alertsRes] = await Promise.all([
      supabase.from("entities").select("*").eq("id", entity_id).maybeSingle(),
      supabase
        .from("signals")
        .select("id, observed_at, domain, statement, confidence, severity")
        .eq("entity_id", entity_id)
        .order("observed_at", { ascending: false })
        .limit(25),
      supabase
        .from("alerts")
        .select("id, raised_at, severity, status, confidence")
        .eq("entity_id", entity_id)
        .order("raised_at", { ascending: false })
        .limit(25),
    ]);

    const error = entityRes.error ?? signalsRes.error ?? alertsRes.error;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!entityRes.data)
      return {
        content: [{ type: "text", text: `No entity found for id ${entity_id}.` }],
        isError: true,
      };

    const profile = {
      entity: entityRes.data,
      signals: signalsRes.data ?? [],
      alerts: alertsRes.data ?? [],
      gaps: [
        ...(signalsRes.data?.length ? [] : ["No dated signals recorded for this entity."]),
        ...(alertsRes.data?.length ? [] : ["No alerts raised against this entity."]),
      ],
    };
    return {
      content: [{ type: "text", text: JSON.stringify(profile, null, 2) }],
      structuredContent: profile,
    };
  },
});
