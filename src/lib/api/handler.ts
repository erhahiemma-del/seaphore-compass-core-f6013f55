/**
 * Shared HTTP handler wrapper: auth → rate-limit → validation → log → respond.
 * Applies to all /api/* endpoints (Sprint 5 · Layer 5.2).
 */
import type { ZodTypeAny, z } from "zod";
import { requireAuth, type AuthContext } from "./auth";
import { logger } from "./logger";
import { DEFAULT_POLICY, enforceRateLimit } from "./rate-limit";
import { ApiError, Errors, errorResponse } from "./errors";
import { envelope, type ApiEnvelope } from "./envelope";

interface HandlerCtx<TBody, TParams> {
  auth: AuthContext;
  body: TBody;
  params: TParams;
  requestId: string;
  request: Request;
}

interface HandlerConfig<
  TBodySchema extends ZodTypeAny | undefined,
  TParamsSchema extends ZodTypeAny | undefined,
  TResp,
> {
  bodySchema?: TBodySchema;
  paramsSchema?: TParamsSchema;
  handler: (
    ctx: HandlerCtx<
      TBodySchema extends ZodTypeAny ? z.infer<TBodySchema> : undefined,
      TParamsSchema extends ZodTypeAny ? z.infer<TParamsSchema> : Record<string, string>
    >,
  ) => Promise<{ data: TResp; sources?: string[]; confidence?: ApiEnvelope<TResp>["confidence"] }>;
}

function safeParse<T extends ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw Errors.validation(result.error.flatten());
  return result.data;
}

export function apiHandler<
  TBodySchema extends ZodTypeAny | undefined,
  TParamsSchema extends ZodTypeAny | undefined,
  TResp,
>(config: HandlerConfig<TBodySchema, TParamsSchema, TResp>) {
  type TBody = TBodySchema extends ZodTypeAny ? z.infer<TBodySchema> : undefined;
  type TParams = TParamsSchema extends ZodTypeAny ? z.infer<TParamsSchema> : Record<string, string>;
  return async ({ request, params }: { request: Request; params: Record<string, string> }) => {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    const log = logger.child({
      requestId,
      path: new URL(request.url).pathname,
      method: request.method,
    });
    log.info("request.received");

    try {
      const auth = await requireAuth(request);
      enforceRateLimit(auth.userId, DEFAULT_POLICY);

      const parsedParams = (
        config.paramsSchema ? safeParse(config.paramsSchema, params) : params
      ) as TParams;
      let parsedBody = undefined as unknown as TBody;
      if (config.bodySchema) {
        const raw = request.headers.get("content-type")?.includes("application/json")
          ? await request.json().catch(() => {
              throw Errors.validation("Body is not valid JSON");
            })
          : {};
        parsedBody = safeParse(config.bodySchema, raw) as TBody;
      }

      const result = await config.handler({
        auth,
        body: parsedBody,
        params: parsedParams as TParams,
        requestId,
        request,
      });

      const env: ApiEnvelope<TResp> = {
        ...envelope(result.data, { sources: result.sources, confidence: result.confidence }),
        requestId,
      };
      log.info({ status: 200, durationMs: Date.now() - started }, "request.completed");
      return Response.json(env, {
        status: 200,
        headers: { "X-Request-Id": requestId },
      });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 500;
      log.warn(
        {
          status,
          durationMs: Date.now() - started,
          error: err instanceof Error ? err.message : String(err),
        },
        "request.failed",
      );
      const res = errorResponse(err, requestId);
      res.headers.set("X-Request-Id", requestId);
      return res;
    }
  };
}
