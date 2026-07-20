/**
 * Sprint 6 · Agent Scheduler.
 *
 * Responsibilities (Layer 2.2):
 *   1. Fan out agent invocations in parallel with a concurrency cap.
 *   2. Enforce per-agent timeout via AbortController, returning a `timeout`
 *      result rather than throwing.
 *   3. Catch and normalise agent errors into `AgentResult.error`.
 *   4. Validate every output against its Zod schema; on validation failure
 *      the result is downgraded to `partial: true, status: "partial"`.
 *
 * The scheduler is decoupled from agent logic — it never knows what sources
 * an agent queries, only its `AgentSpec`.
 */
import type { AgentInput, AgentResult, AgentSpec, AgentId } from "./types";
import { queryFactory } from "./data-sources";
import type { z } from "zod";

export interface ScheduleOptions {
  /** Max concurrent agents. Default 4 — Layer 2.7 mock-source protection. */
  concurrency?: number;
  /** Per-agent timeout in ms. Default 3_000. */
  timeoutMs?: number;
  /** Parent signal — if aborted, cancels every in-flight agent. */
  signal?: AbortSignal;
}

interface Task {
  spec: AgentSpec<z.ZodTypeAny>;
}

export async function runAgents(
  specs: Array<AgentSpec<z.ZodTypeAny>>,
  input: AgentInput,
  opts: ScheduleOptions = {},
): Promise<Array<AgentResult<unknown>>> {
  const { concurrency = 4, timeoutMs = 3_000, signal: parentSignal } = opts;
  const requestId = crypto.randomUUID();
  const dispatchedAt = Date.now();

  const queue: Task[] = specs.map((spec) => ({ spec }));
  const results: Array<AgentResult<unknown>> = new Array(specs.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= queue.length) return;
      const { spec } = queue[index];
      results[index] = await runOne(spec, input, {
        requestId,
        dispatchedAt,
        timeoutMs,
        parentSignal,
      });
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

interface RunOneCtx {
  requestId: string;
  dispatchedAt: number;
  timeoutMs: number;
  parentSignal?: AbortSignal;
}

async function runOne<TSchema extends z.ZodTypeAny>(
  spec: AgentSpec<TSchema>,
  input: AgentInput,
  ctx: RunOneCtx,
): Promise<AgentResult<z.infer<TSchema>>> {
  const controller = new AbortController();
  const startedAt = Date.now();

  const forwardAbort = () => controller.abort();
  ctx.parentSignal?.addEventListener("abort", forwardAbort, { once: true });
  const timeoutHandle = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), ctx.timeoutMs);

  const base = {
    agent: spec.id,
    sourcesQueried: [...spec.allowedSources],
    latencyMs: 0,
  };

  try {
    const query = queryFactory(spec.id, spec.allowedSources);
    const raw = await spec.execute(
      input,
      { signal: controller.signal, requestId: ctx.requestId, dispatchedAt: ctx.dispatchedAt },
      query,
    );
    const parsed = spec.outputSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ...base,
        status: "partial",
        data: raw as z.infer<TSchema>,
        partial: true,
        latencyMs: Date.now() - startedAt,
        error: { code: "SCHEMA_VALIDATION", message: parsed.error.issues[0]?.message ?? "invalid output" },
      };
    }
    return { ...base, status: "ok", data: parsed.data, partial: false, latencyMs: Date.now() - startedAt };
  } catch (err) {
    const isAbort = err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError");
    const isTimeout = isAbort && controller.signal.reason instanceof DOMException && controller.signal.reason.name === "TimeoutError";
    return {
      ...base,
      status: isTimeout ? "timeout" : isAbort ? "partial" : "error",
      data: null,
      partial: isAbort,
      latencyMs: Date.now() - startedAt,
      error: {
        code: isTimeout ? "TIMEOUT" : isAbort ? "ABORTED" : "AGENT_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  } finally {
    clearTimeout(timeoutHandle);
    ctx.parentSignal?.removeEventListener("abort", forwardAbort);
  }
}

/** Convenience: run all registered agents. */
export function summariseRun(results: Array<AgentResult<unknown>>): {
  total: number;
  ok: number;
  partial: number;
  timeout: number;
  error: number;
} {
  const acc = { total: results.length, ok: 0, partial: 0, timeout: 0, error: 0 };
  for (const r of results) acc[r.status === "ok" ? "ok" : r.status] += 1;
  return acc;
}

export type { AgentId };
