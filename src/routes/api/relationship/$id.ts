import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/lib/api/handler";
import { IdParamSchema } from "@/lib/api/schemas";
import { mockDb } from "@/lib/api/mock-dataset";
import { Errors } from "@/lib/api/errors";

export const Route = createFileRoute("/api/relationship/$id")({
  server: {
    handlers: {
      GET: apiHandler({
        paramsSchema: IdParamSchema,
        handler: async ({ params }) => {
          const rel = mockDb.relationship(params.id);
          if (!rel) throw Errors.notFound("Relationship", params.id);
          return { data: rel, sources: ["mock:knowledge-graph"], confidence: rel.confidence === "verified" ? "verified" : "observed" };
        },
      }),
    },
  },
});
