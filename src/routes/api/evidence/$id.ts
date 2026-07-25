import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/lib/api/handler";
import { IdParamSchema } from "@/lib/api/schemas";
import { Errors } from "@/lib/api/errors";

/**
 * Evidence lookup — production reads flow through the Evidence Library
 * repository, not fabricated fixtures. Until that repository is wired in,
 * unresolved ids return a 404 rather than demo data.
 */
export const Route = createFileRoute("/api/evidence/$id")({
  server: {
    handlers: {
      GET: apiHandler({
        paramsSchema: IdParamSchema,
        handler: async ({ params }) => {
          throw Errors.notFound("Evidence", params.id);
        },
      }),
    },
  },
});
