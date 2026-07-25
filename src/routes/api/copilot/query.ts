import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/lib/api/handler";
import { CopilotQueryBodySchema } from "@/lib/api/schemas";
import { Errors } from "@/lib/api/errors";
import { getUipByQueryHash, hashQuery } from "@/services/ife/registry";

/**
 * Copilot query endpoint — resolves against the canonical UIP registry
 * populated by the live orchestration pipeline. No demo/mock data is
 * returned in production paths; unresolved queries yield a 404.
 */
export const Route = createFileRoute("/api/copilot/query")({
  server: {
    handlers: {
      POST: apiHandler({
        bodySchema: CopilotQueryBodySchema,
        handler: async ({ body }) => {
          const uip = getUipByQueryHash(hashQuery(body.query));
          if (!uip) throw Errors.notFound("UnifiedIntelligencePackage", body.query);
          return {
            data: { unifiedPackageId: uip.id, fused: uip.fused, provenance: uip.provenance },
            sources: uip.provenance.map((p) => p.sourceName),
            confidence: uip.hasContradictions ? "observed" : "verified",
          };
        },
      }),
    },
  },
});
