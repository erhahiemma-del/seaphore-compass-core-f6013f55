/**
 * Public intelligence metrics for the Mission Control ribbon and
 * auth-page KPI cards. Values are derived from the live database so
 * the UI never lies about what has actually been indexed.
 *
 * Public endpoint — returns only aggregate counts, no PII. Uses the
 * service-role client inside the handler for uniform counting across
 * RLS-protected tables. Follows HR-2 (never claim VERIFIED without a
 * source) by tagging direct counts as "observed" and aggregates as
 * "inferred".
 */
import { createServerFn } from "@tanstack/react-start";
import type { ConfidenceTier } from "@/components/intelligence/ConfidenceChip";

export interface IntelligenceMetric {
  key: string;
  value: number | null;
  display: string;
  confidence: ConfidenceTier;
}

export interface IntelligenceMetrics {
  manifest: IntelligenceMetric;
  vessel: IntelligenceMetric;
  container: IntelligenceMetric;
  revenue: IntelligenceMetric;
  risk: IntelligenceMetric;
  historical: IntelligenceMetric;
}

function formatCount(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function formatNaira(n: number | null): string {
  if (n === null || n === 0) return "—";
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${n}`;
}

export const getIntelligenceMetrics = createServerFn({ method: "GET" }).handler(
  async (): Promise<IntelligenceMetrics> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const countOf = async (table: string): Promise<number | null> => {
      const { count, error } = await supabaseAdmin
        .from(table as never)
        .select("*", { count: "exact", head: true });
      return error ? null : (count ?? 0);
    };

    const [
      manifests,
      vessels,
      containers,
      { data: riskRows },
      { data: earliestSignal },
      { data: revenueSignals },
    ] = await Promise.all([
      countOf("manifests"),
      countOf("vessels"),
      countOf("containers"),
      supabaseAdmin.from("risk_scores").select("score").limit(1000),
      supabaseAdmin
        .from("signals")
        .select("observed_at")
        .order("observed_at", { ascending: true })
        .limit(1),
      supabaseAdmin
        .from("signals")
        .select("metadata")
        .in("domain", ["revenue", "manifest"]),
    ]);

    // Risk: average score across observed risk rows.
    const risk =
      riskRows && riskRows.length > 0
        ? Math.round(
            (riskRows.reduce((sum, r) => sum + (r.score ?? 0), 0) / riskRows.length) * 10,
          ) / 10
        : null;

    // Revenue leakage: sum of numeric revenue_at_risk from signal metadata.
    const revenue =
      revenueSignals && revenueSignals.length > 0
        ? revenueSignals.reduce((sum, s) => {
            const meta = (s.metadata ?? {}) as Record<string, unknown>;
            const v = Number(meta.revenue_at_risk ?? 0);
            return sum + (Number.isFinite(v) ? v : 0);
          }, 0)
        : 0;

    // Historical coverage: years since earliest signal observed.
    let historical: number | null = null;
    const earliestAt = earliestSignal?.[0]?.observed_at;
    if (earliestAt) {
      const years = (Date.now() - new Date(earliestAt).getTime()) / (365.25 * 86_400_000);
      historical = Math.max(0, Math.round(years * 10) / 10);
    }

    return {
      manifest: {
        key: "manifest",
        value: manifests,
        display: formatCount(manifests),
        confidence: "observed",
      },
      vessel: {
        key: "vessel",
        value: vessels,
        display: formatCount(vessels),
        confidence: "observed",
      },
      container: {
        key: "container",
        value: containers,
        display: formatCount(containers),
        confidence: "observed",
      },
      revenue: {
        key: "revenue",
        value: revenue,
        display: formatNaira(revenue),
        confidence: "inferred",
      },
      risk: {
        key: "risk",
        value: risk,
        display: risk === null ? "—" : `${risk}%`,
        confidence: "inferred",
      },
      historical: {
        key: "historical",
        value: historical,
        display:
          historical === null
            ? "—"
            : historical < 1
              ? `${Math.round(historical * 12)} mo`
              : `${historical} yr`,
        confidence: "observed",
      },
    };
  },
);
