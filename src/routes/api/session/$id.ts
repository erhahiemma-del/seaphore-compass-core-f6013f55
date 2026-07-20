import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/lib/api/handler";
import { IdParamSchema } from "@/lib/api/schemas";
import { mockDb } from "@/lib/api/mock-dataset";
import { Errors } from "@/lib/api/errors";

export const Route = createFileRoute("/api/session/$id")({
  server: {
    handlers: {
      GET: apiHandler({
        paramsSchema: IdParamSchema,
        handler: async ({ auth, params }) => {
          const s = mockDb.session(params.id);
          if (!s) throw Errors.notFound("Session", params.id);
          // Sessions are user-scoped: only the owner (or elevated role) may read.
          if (s.userId !== auth.userId && !["admin", "director"].includes(auth.role)) {
            throw Errors.forbidden("Session belongs to another user");
          }
          return { data: s, sources: ["mock:session-store"], confidence: "verified" };
        },
      }),
    },
  },
});
