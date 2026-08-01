import { describe, expect, it, vi, beforeEach } from "vitest";

// Auth is stubbed so we can unit-test the handler chain end-to-end without a real Supabase session.
vi.mock("@/lib/api/auth", () => ({
  requireAuth: vi.fn(async (req: Request) => {
    const h = req.headers.get("authorization");
    if (!h) throw (await import("@/lib/api/errors")).Errors.unauthorized();
    return { userId: "usr_officer_01", email: "o@x", role: "officer", token: "t" };
  }),
}));

import { apiHandler } from "@/lib/api/handler";
import { CopilotQueryBodySchema, IdParamSchema } from "@/lib/api/schemas";
import { mockDb } from "@/lib/api/mock-dataset";

function req(url: string, init?: RequestInit) {
  return new Request(url, {
    ...init,
    headers: {
      authorization: "Bearer test",
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

describe("intelligence API handlers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects missing auth with 401", async () => {
    const handler = apiHandler({
      paramsSchema: IdParamSchema,
      handler: async () => ({ data: {} }),
    });
    const res = await handler({
      request: new Request("http://x/api/entity/abc"),
      params: { id: "abc" },
    });
    expect(res.status).toBe(401);
  });

  it("validates body and returns 400 on bad input", async () => {
    const handler = apiHandler({
      bodySchema: CopilotQueryBodySchema,
      handler: async () => ({ data: {} }),
    });
    const res = await handler({
      request: req("http://x/api/copilot/query", {
        method: "POST",
        body: JSON.stringify({ query: "x" }),
      }),
      params: {},
    });
    expect(res.status).toBe(400);
  });

  it("returns briefing envelope on POST /copilot/query", async () => {
    const handler = apiHandler({
      bodySchema: CopilotQueryBodySchema,
      handler: async ({ body }) => ({ data: mockDb.buildBriefing(body.query), sources: ["mock"] }),
    });
    const res = await handler({
      request: req("http://x/api/copilot/query", {
        method: "POST",
        body: JSON.stringify({ query: "Summarise ownership risk" }),
      }),
      params: {},
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { executiveAssessment: { grade: string } };
      requestId: string;
    };
    expect(json.requestId).toBeTruthy();
    expect(json.data.executiveAssessment.grade).toBe("verified");
  });

  it("returns 404 for unknown entity", async () => {
    const handler = apiHandler({
      paramsSchema: IdParamSchema,
      handler: async ({ params }) => {
        const e = mockDb.entity(params.id);
        if (!e) throw (await import("@/lib/api/errors")).Errors.notFound("Entity", params.id);
        return { data: e };
      },
    });
    const res = await handler({
      request: req("http://x/api/entity/nope"),
      params: { id: "nope" },
    });
    expect(res.status).toBe(404);
  });
});
