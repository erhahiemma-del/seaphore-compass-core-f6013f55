import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/lib/api/handler";
import { IdParamSchema } from "@/lib/api/schemas";
import { Errors } from "@/lib/api/errors";

/**
 * Session lookup — production reads flow through public.sessions
 * (RLS-scoped to the owner). Unresolved ids return 404 rather than
 * fabricated fixtures.
 */
export const Route = createFileRoute("/api/session/$id")({
  server: {
    handlers: {
      GET: apiHandler({
        paramsSchema: IdParamSchema,
        handler: async ({ params }) => {
          throw Errors.notFound("Session", params.id);
        },
      }),
    },
  },
});
