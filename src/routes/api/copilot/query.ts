import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/lib/api/handler";
import { CopilotQueryBodySchema } from "@/lib/api/schemas";
import { mockDb } from "@/lib/api/mock-dataset";

export const Route = createFileRoute("/api/copilot/query")({
  server: {
    handlers: {
      POST: apiHandler({
        bodySchema: CopilotQueryBodySchema,
        handler: async ({ body }) => ({
          data: mockDb.buildBriefing(body.query),
          sources: ["mock:knowledge-graph", "mock:ais-stream"],
          confidence: "verified",
        }),
      }),
    },
  },
});
