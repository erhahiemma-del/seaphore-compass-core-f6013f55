import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/lib/api/handler";
import { IdParamSchema } from "@/lib/api/schemas";
import { mockDb } from "@/lib/api/mock-dataset";
import { Errors } from "@/lib/api/errors";

export const Route = createFileRoute("/api/investigation/$id")({
  server: {
    handlers: {
      GET: apiHandler({
        paramsSchema: IdParamSchema,
        handler: async ({ params }) => {
          const inv = mockDb.investigation(params.id);
          if (!inv) throw Errors.notFound("Investigation", params.id);
          return { data: inv, sources: ["mock:case-management"], confidence: "verified" };
        },
      }),
    },
  },
});
