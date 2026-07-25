import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/lib/api/handler";
import { IdParamSchema } from "@/lib/api/schemas";
import { Errors } from "@/lib/api/errors";

/**
 * Relationship lookup — production reads flow through the Maritime
 * Knowledge Graph (services/mkg). Unresolved ids return 404 rather
 * than demo data.
 */
export const Route = createFileRoute("/api/relationship/$id")({
  server: {
    handlers: {
      GET: apiHandler({
        paramsSchema: IdParamSchema,
        handler: async ({ params }) => {
          throw Errors.notFound("Relationship", params.id);
        },
      }),
    },
  },
});
