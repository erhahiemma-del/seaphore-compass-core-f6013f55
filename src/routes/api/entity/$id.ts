import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/lib/api/handler";
import { IdParamSchema } from "@/lib/api/schemas";
import { Errors } from "@/lib/api/errors";
import { listUipIds, getUip } from "@/services/ife/registry";

export const Route = createFileRoute("/api/entity/$id")({
  server: {
    handlers: {
      GET: apiHandler({
        paramsSchema: IdParamSchema,
        handler: async ({ params }) => {
          for (const uipId of listUipIds()) {
            const uip = getUip(uipId);
            const rec = uip?.fused.records.find((r) => r.entityRef.id === params.id);
            if (rec) {
              return {
                data: { entity: rec, unifiedPackageId: uip!.id },
                sources: uip!.provenance.map((p) => p.sourceName),
                confidence: "verified",
              };
            }
          }
          throw Errors.notFound("Entity", params.id);
        },
      }),
    },
  },
});
