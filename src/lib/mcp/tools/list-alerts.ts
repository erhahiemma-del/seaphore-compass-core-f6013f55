import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_alerts",
  title: "List alerts",
  description:
    "List recent Seaphore alerts with severity, status and confidence grade. Optionally filter by status or severity.",
  inputSchema: {
    status: z.string().trim().min(1).optional().describe("Filter by alert status."),
    severity: z.string().trim().min(1).optional().describe("Filter by severity."),
    limit: z.number().int().min(1).max(50).optional().describe("Max rows (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, severity, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("alerts")
      .select("id, raised_at, entity_id, signal_id, severity, status, confidence")
      .order("raised_at", { ascending: false })
      .limit(limit ?? 20);
    if (status) q = q.eq("status", status);
    if (severity) q = q.eq("severity", severity);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    return {
      content: [
        { type: "text", text: rows.length ? JSON.stringify(rows, null, 2) : "No alerts matched." },
      ],
      structuredContent: { alerts: rows },
    };
  },
});
