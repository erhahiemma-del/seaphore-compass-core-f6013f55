import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/lib/api/handler";
import { IdParamSchema } from "@/lib/api/schemas";
import { mockDb } from "@/lib/api/mock-dataset";
import { Errors } from "@/lib/api/errors";

export const Route = createFileRoute("/api/entity/$id")({
  server: {
    handlers: {
      GET: apiHandler({
        paramsSchema: IdParamSchema,
        handler: async ({ params }) => {
          const entity = mockDb.entityWithGraph(params.id);
          if (!entity) throw Errors.notFound("Entity", params.id);
          return { data: entity, sources: ["mock:knowledge-graph"], confidence: "verified" };
        },
      }),
    },
  },
});
