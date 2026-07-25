import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/lib/api/handler";
import { IdParamSchema } from "@/lib/api/schemas";
import { Errors } from "@/lib/api/errors";

/**
 * Investigation lookup — production reads flow through the Investigation
 * Workspace repository. Unresolved ids return 404 rather than demo data.
 */
export const Route = createFileRoute("/api/investigation/$id")({
  server: {
    handlers: {
      GET: apiHandler({
        paramsSchema: IdParamSchema,
        handler: async ({ params }) => {
          throw Errors.notFound("Investigation", params.id);
        },
      }),
    },
  },
});
