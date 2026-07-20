import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/lib/api/handler";
import { IdParamSchema } from "@/lib/api/schemas";
import { mockDb } from "@/lib/api/mock-dataset";
import { Errors } from "@/lib/api/errors";

export const Route = createFileRoute("/api/evidence/$id")({
  server: {
    handlers: {
      GET: apiHandler({
        paramsSchema: IdParamSchema,
        handler: async ({ params }) => {
          const ev = mockDb.evidence(params.id);
          if (!ev) throw Errors.notFound("Evidence", params.id);
          return { data: ev, sources: [ev.sourceSystem], confidence: "verified" };
        },
      }),
    },
  },
});
