/**
 * INT-01A.3 — IPEF Server Functions (Admin API)
 *
 * GET /admin/ipef/executions    — getMioIpefExecutionsFn
 * GET /admin/ipef/provenance    — getMioIpefProvenanceFn
 * GET /admin/ipef/contributors  — getMioIpefContributorsFn
 * GET /admin/ipef/confidence    — getMioIpefConfidenceFn
 * GET /admin/ipef/lineage       — getMioIpefLineageFn
 *
 * All endpoints: requireSupabaseAuth, no raw intelligence content.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ipefRegistry } from "@/services/ipef/registry";

// ── GET /admin/ipef/executions ────────────────────────────────────────

export const getMioIpefExecutionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const records = ipefRegistry.getAll().slice(0, 50);
    const summary = ipefRegistry.summary();
    return {
      executions: records.map((r) => ({
        correlationId: r.correlationId,
        createdAt: r.createdAt,
        overallStatus: r.overallStatus,
        totalDurationMs: r.totalDurationMs,
        contributorCount: r.contributors.length,
        gapCount: r.intelligenceGaps.length,
        confidenceEntities: r.confidenceDecompositions.length,
      })),
      summary,
      total: ipefRegistry.size,
      timestamp: new Date().toISOString(),
    };
  });

// ── GET /admin/ipef/provenance?correlationId=... ──────────────────────

export const getMioIpefProvenanceFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    // Returns the latest IPEF record's pipeline trace and contributor list
    const record = ipefRegistry.latest;
    if (!record) {
      return { record: null, timestamp: new Date().toISOString() };
    }
    return {
      record: {
        correlationId: record.correlationId,
        createdAt: record.createdAt,
        overallStatus: record.overallStatus,
        totalDurationMs: record.totalDurationMs,
        pipelineTrace: record.pipelineTrace,
        contributors: record.contributors,
        intelligenceGaps: record.intelligenceGaps,
      },
      timestamp: new Date().toISOString(),
    };
  });

// ── GET /admin/ipef/contributors ──────────────────────────────────────

export const getMioIpefContributorsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const records = ipefRegistry.getAll();
    if (records.length === 0) {
      return { contributors: [], timestamp: new Date().toISOString() };
    }

    // Aggregate per contributor across all executions
    const byContributor = new Map<
      string,
      {
        displayName: string;
        total: number;
        success: number;
        failed: number;
        avgDurationMs: number;
        totalFacts: number;
      }
    >();

    for (const record of records) {
      for (const c of record.contributors) {
        const existing = byContributor.get(c.contributorId);
        if (!existing) {
          byContributor.set(c.contributorId, {
            displayName: c.displayName,
            total: 1,
            success: c.status === "success" ? 1 : 0,
            failed: c.status === "failed" ? 1 : 0,
            avgDurationMs: c.durationMs,
            totalFacts: c.facts.length,
          });
        } else {
          existing.total++;
          if (c.status === "success") existing.success++;
          if (c.status === "failed") existing.failed++;
          existing.avgDurationMs = Math.round(
            (existing.avgDurationMs * (existing.total - 1) + c.durationMs) / existing.total,
          );
          existing.totalFacts += c.facts.length;
        }
      }
    }

    return {
      contributors: Array.from(byContributor.entries()).map(([id, stats]) => ({
        contributorId: id,
        ...stats,
      })),
      timestamp: new Date().toISOString(),
    };
  });

// ── GET /admin/ipef/confidence ────────────────────────────────────────

export const getMioIpefConfidenceFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const record = ipefRegistry.latest;
    if (!record) {
      return { decompositions: [], timestamp: new Date().toISOString() };
    }
    return {
      decompositions: record.confidenceDecompositions,
      correlationId: record.correlationId,
      timestamp: new Date().toISOString(),
    };
  });

// ── GET /admin/ipef/lineage ────────────────────────────────────────────

export const getMioIpefLineageFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const record = ipefRegistry.latest;
    if (!record) {
      return { chains: [], gaps: [], timestamp: new Date().toISOString() };
    }
    return {
      chains: record.recommendationProvenance,
      gaps: record.intelligenceGaps,
      correlationId: record.correlationId,
      timestamp: new Date().toISOString(),
    };
  });
