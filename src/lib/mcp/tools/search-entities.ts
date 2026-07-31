import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_entities",
  title: "Search entities",
  description:
    "Search the Seaphore entity registry (vessels, companies, persons, ports, cargo) by name or alias. Returns id, type, confidence grade and risk score.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Name or partial name to search for."),
    limit: z.number().int().min(1).max(50).optional().describe("Max rows (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("entities")
      .select("id, type, name, aliases, confidence, risk_score, source_name, updated_at")
      .ilike("name", `%${query}%`)
      .limit(limit ?? 10);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    return {
      content: [
        {
          type: "text",
          text: rows.length
            ? JSON.stringify(rows, null, 2)
            : `No entities matched "${query}". This is an evidence gap, not a confirmation of absence.`,
        },
      ],
      structuredContent: { entities: rows },
    };
  },
});
