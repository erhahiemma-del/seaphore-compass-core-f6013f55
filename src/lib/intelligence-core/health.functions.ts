/**
 * ─────────────────────────────────────────────────────────────────────
 *  INT-01A.1 — MIC Health Endpoints (Server Functions)
 *
 *  /admin/intelligence-core/health   — liveness + readiness
 *  /admin/intelligence-core/status   — registry counts + flag state
 *  /admin/intelligence-core/metrics  — telemetry summary + performance
 *
 *  All endpoints:
 *    • Admin-only (requireSupabaseAuth)
 *    • No sensitive intelligence data exposed
 *    • No entity labels, evidence contents, or officer queries returned
 *    • Structural / numeric metrics only
 * ─────────────────────────────────────────────────────────────────────
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mic } from "@/services/mic/container";
import { mioCaptureSink } from "@/services/mic/telemetry-registry";
import { getMicFlagState, isMicEnabled } from "@/services/mic/feature-flag";

const MIC_VERSION = "INT-01A.1";
const PROCESS_START = Date.now();

// ── /admin/intelligence-core/health ───────────────────────────────────

export const getMicHealthFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const flag = getMicFlagState();
    const latest = mioCaptureSink.latest;
    const stats = mic.stats();
    const uptimeSeconds = Math.floor((Date.now() - PROCESS_START) / 1000);

    const status = !flag.enabled
      ? "disabled"
      : latest === null
        ? "idle"
        : latest.outcome === "failed"
          ? "degraded"
          : latest.outcome === "degraded"
            ? "warning"
            : "healthy";

    return {
      version: MIC_VERSION,
      status,
      enabled: flag.enabled,
      flagSource: flag.source,
      uptimeSeconds,
      lastExecution: latest
        ? { executionId: latest.executionId, timestamp: latest.timestamp, outcome: latest.outcome }
        : null,
      graphLive: stats.mkgNodes > 0,
      registriesLive: stats.entities > 0 || stats.evidence > 0,
      timestamp: new Date().toISOString(),
    };
  });

// ── /admin/intelligence-core/status ──────────────────────────────────

export const getMicStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const flag = getMicFlagState();
    const stats = mic.stats();
    const summary = mioCaptureSink.summary();
    const latest = mioCaptureSink.latest;

    return {
      version: MIC_VERSION,
      enabled: flag.enabled,
      flagSource: flag.source,
      flagRaw: flag.rawValue,
      registries: {
        entities: stats.entities,
        relationships: stats.relationships,
        evidence: stats.evidence,
        confidence: stats.confidence,
        timelineEvents: stats.timelineEvents,
        graphs: stats.graphs,
        riskProfiles: stats.riskProfiles,
        reasoningLogs: stats.reasoningLogs,
      },
      graph: {
        nodes: stats.mkgNodes,
        edges: stats.mkgEdges,
      },
      executions: {
        total: summary?.totalExecutions ?? 0,
        success: summary?.successCount ?? 0,
        degraded: summary?.degradedCount ?? 0,
        failed: summary?.failedCount ?? 0,
      },
      lastExecution: latest
        ? {
            executionId: latest.executionId,
            timestamp: latest.timestamp,
            outcome: latest.outcome,
            durationMs: latest.totalDurationMs,
            entities: latest.entitiesRegistered,
            evidence: latest.evidenceRegistered,
            risk: latest.riskProfilesComputed,
            warnings: latest.warnings.length,
            errors: latest.errors.length,
          }
        : null,
      timestamp: new Date().toISOString(),
    };
  });

// ── /admin/intelligence-core/metrics ─────────────────────────────────

export const getMicMetricsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const summary = mioCaptureSink.summary();
    const executions = mioCaptureSink.executions;

    // Memory from latest execution
    const latest = mioCaptureSink.latest;
    const heapMb =
      latest?.heapUsedBytes != null ? +(latest.heapUsedBytes / 1_048_576).toFixed(1) : null;

    // Percentile calculation (P50, P95) from captured window
    const durations = executions.map((e) => e.totalDurationMs).sort((a, b) => a - b);
    const p50 = durations.length > 0 ? durations[Math.floor(durations.length * 0.5)] : null;
    const p95 = durations.length > 0 ? durations[Math.floor(durations.length * 0.95)] : null;

    // Scaling thresholds
    const thresholds = [
      { evidenceCount: 100, recommendedAction: "Current: nominal" },
      { evidenceCount: 500, recommendedAction: "Monitor: approaching 600ms threshold" },
      { evidenceCount: 1000, recommendedAction: "Consider: async chunking (INT-01G)" },
      { evidenceCount: 5000, recommendedAction: "Required: async chunking + batching" },
      { evidenceCount: 10000, recommendedAction: "Required: database-backed registries" },
    ];

    return {
      version: MIC_VERSION,
      performance: {
        avgDurationMs: summary?.avgDurationMs ?? null,
        minDurationMs: summary?.minDurationMs ?? null,
        maxDurationMs: summary?.maxDurationMs ?? null,
        p50DurationMs: p50,
        p95DurationMs: p95,
      },
      memory: {
        heapUsedMb: heapMb,
        capturedAt: latest?.timestamp ?? null,
        note: "Measured at last MIC execution. Reflects full Node.js process heap.",
      },
      throughput: {
        totalExecutions: summary?.totalExecutions ?? 0,
        totalEntities: summary?.totalEntities ?? 0,
        totalEvidence: summary?.totalEvidence ?? 0,
        capturedWindowSize: executions.length,
        windowCapacity: 500,
      },
      reliability: {
        successRate: summary
          ? +((summary.successCount / summary.totalExecutions) * 100).toFixed(1)
          : null,
        warningRate: summary
          ? +((summary.degradedCount / summary.totalExecutions) * 100).toFixed(1)
          : null,
        failureRate: summary
          ? +((summary.failedCount / summary.totalExecutions) * 100).toFixed(1)
          : null,
        totalWarnings: summary?.warningCount ?? 0,
        totalErrors: summary?.errorCount ?? 0,
      },
      scalingThresholds: thresholds,
      timestamp: new Date().toISOString(),
    };
  });
