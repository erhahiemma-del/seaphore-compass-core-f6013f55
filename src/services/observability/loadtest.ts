/**
 * Sprint 11 · Load-test harness.
 *
 * Drives synthetic queries through the tracer under controlled concurrency
 * and returns a metrics snapshot plus a pass/fail report against the
 * Sprint 5.4 performance budget.
 */
import type { Tracer } from "./tracer";
import type { MetricsRegistry, MetricsSnapshot } from "./metrics";
import type { PipelineStage } from "./types";

export interface LoadTestOptions {
  readonly totalQueries: number;
  readonly concurrency: number;
  readonly failureRate?: number; // 0..1, default 0
  readonly stageDelays?: Partial<Record<PipelineStage, [number, number]>>; // [minMs, maxMs]
}

export interface LoadTestReport {
  readonly totalQueries: number;
  readonly completed: number;
  readonly errors: number;
  readonly wallMs: number;
  readonly snapshot: MetricsSnapshot;
  readonly budget: {
    readonly totalP95Ms: number;
    readonly targetTotalP95Ms: number;
    readonly passed: boolean;
  };
}

function rand([min, max]: [number, number]): number {
  return Math.floor(min + Math.random() * (max - min));
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runLoadTest(
  tracer: Tracer,
  registry: MetricsRegistry,
  opts: LoadTestOptions,
  targetTotalP95Ms = 3000,
): Promise<LoadTestReport> {
  const stageDelays: Record<PipelineStage, [number, number]> = {
    classification: [2, 8],
    retrieval: [10, 40],
    fusion: [5, 20],
    reasoning: [20, 120],
    rendering: [1, 5],
    total: [0, 0],
    ...(opts.stageDelays ?? {}),
  };
  const failureRate = opts.failureRate ?? 0;

  const started = Date.now();
  let completed = 0,
    errors = 0;
  const inFlight: Promise<void>[] = [];

  async function one(i: number): Promise<void> {
    const trace = tracer.startQuery({
      officerId: `officer_${i % 8}`,
      intent: ["revenue", "compliance", "ownership", "forecast"][i % 4],
      queryText: `Synthetic query ${i} — IMO 9837456 for user@example.com`,
    });
    let ok = true;
    try {
      for (const stage of [
        "classification",
        "retrieval",
        "fusion",
        "reasoning",
        "rendering",
      ] as PipelineStage[]) {
        await trace.stage(stage, async () => {
          await sleep(rand(stageDelays[stage]));
          if (stage === "reasoning" && Math.random() < failureRate) {
            throw new Error(`synthetic ${stage} failure`);
          }
        });
      }
      trace.recordModel({
        stage: "reasoning",
        model: "google/gemini-2.5-flash",
        tier: 1,
        promptTokens: 512,
        completionTokens: 128,
        costCredits: 0.4,
      });
      trace.recordEvidence({ evidenceId: `ev_${i}`, grade: "SIGINT_VERIFIED", weight: 0.92 });
      completed++;
    } catch {
      ok = false;
      errors++;
    } finally {
      trace.finish({ ok });
    }
  }

  let i = 0;
  const workers = Math.max(1, opts.concurrency);
  async function worker(): Promise<void> {
    while (i < opts.totalQueries) {
      const idx = i++;
      await one(idx);
    }
  }
  for (let w = 0; w < workers; w++) inFlight.push(worker());
  await Promise.all(inFlight);

  const wallMs = Date.now() - started;
  const snapshot = registry.snapshot();
  const totalP95Ms = snapshot.histograms['pipeline_stage_ms{stage="total"}']?.p95 ?? 0;

  return {
    totalQueries: opts.totalQueries,
    completed,
    errors,
    wallMs,
    snapshot,
    budget: { totalP95Ms, targetTotalP95Ms, passed: totalP95Ms <= targetTotalP95Ms },
  };
}
