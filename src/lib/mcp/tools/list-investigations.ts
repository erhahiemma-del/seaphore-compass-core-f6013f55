import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_investigations",
  title: "List investigations",
  description:
    "List Seaphore investigations visible to the signed-in officer, newest first. Optionally filter by status.",
  inputSchema: {
    status: z.string().trim().min(1).optional().describe("Filter by investigation status."),
    limit: z.number().int().min(1).max(50).optional().describe("Max rows (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("investigations")
      .select("id, case_number, scenario, status, opened_at, closed_at")
      .is("deleted_at", null)
      .order("opened_at", { ascending: false })
      .limit(limit ?? 20);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    return {
      content: [
        {
          type: "text",
          text: rows.length
            ? JSON.stringify(rows, null, 2)
            : "No investigations visible to this officer.",
        },
      ],
      structuredContent: { investigations: rows },
    };
  },
});
