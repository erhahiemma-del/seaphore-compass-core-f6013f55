import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_investigation",
  title: "Get investigation dossier",
  description:
    "Retrieve one Seaphore investigation with its evidence records and recorded officer decisions. Decisions are immutable — this tool only reads them.",
  inputSchema: {
    investigation_id: z.string().uuid().describe("Investigation UUID from list_investigations."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ investigation_id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);

    const [caseRes, evidenceRes, decisionsRes] = await Promise.all([
      supabase
        .from("investigations")
        .select("id, case_number, scenario, status, opened_at, closed_at")
        .eq("id", investigation_id)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("evidence")
        .select("id, evidence_type, source, collected_at, content_hash, provenance")
        .eq("investigation_id", investigation_id)
        .order("collected_at", { ascending: false })
        .limit(100),
      supabase
        .from("decisions")
        .select("id, decision, reason, notes, decided_at, immutable")
        .eq("investigation_id", investigation_id)
        .order("decided_at", { ascending: false })
        .limit(50),
    ]);

    const error = caseRes.error ?? evidenceRes.error ?? decisionsRes.error;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!caseRes.data)
      return {
        content: [{ type: "text", text: `No investigation found for id ${investigation_id}.` }],
        isError: true,
      };

    const dossier = {
      investigation: caseRes.data,
      evidence: evidenceRes.data ?? [],
      decisions: decisionsRes.data ?? [],
      gaps: [
        ...(evidenceRes.data?.length ? [] : ["No evidence attached to this investigation."]),
        ...(decisionsRes.data?.length ? [] : ["No officer decision recorded yet."]),
      ],
    };
    return {
      content: [{ type: "text", text: JSON.stringify(dossier, null, 2) }],
      structuredContent: dossier,
    };
  },
});
