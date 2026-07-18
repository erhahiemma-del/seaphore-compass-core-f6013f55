/**
 * generate-brief — assemble investigation data + evidence into a formatted
 * brief. Called by POST /api/briefings. Returns a signed URL to a stored
 * artefact in the `exports` bucket.
 *
 * NOTE: PDF/Word rendering is PLANNED — this scaffold returns a placeholder
 * payload so the endpoint contract is honoured until a rendering pipeline
 * is wired in.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        investigation_id: z.string().uuid(),
        format: z.enum(["pdf", "docx"]).default("pdf"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return {
      status: "planned",
      investigation_id: data.investigation_id,
      format: data.format,
      artefact_url: null,
      message:
        "Brief renderer not yet wired. Endpoint stubbed per Engineering Law 1: reality over assumption.",
    };
  });
