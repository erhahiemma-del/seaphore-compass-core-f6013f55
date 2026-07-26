/**
 * ─────────────────────────────────────────────────────────────────────
 *  SPRINT DIAG-02 — Intelligence Coverage & Readiness (server gather)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  Gathers the three honest inputs the pure coverage model needs:
 *    1. the Evidence Provider Catalog (read-only projection),
 *    2. live provider health (existing frozen healthCheck() probe),
 *    3. observed evidence counts from the durable store.
 *
 *  It modifies nothing: no provider, IAL, IFE, UIP, OKL, OIE or MIBC
 *  behaviour is touched, and nothing is written back.
 * ─────────────────────────────────────────────────────────────────────
 */
import { buildEvidenceProviderCatalog } from "@/connectors/catalog";
import { probeAllProviders } from "@/lib/server/providers/health.server";
import { PROJECTION_CONTRACT } from "@/lib/projection-contract/registry";
import {
  buildIntelligenceCoverage,
  DASHBOARD_KPI_FIELDS,
  type CoverageCatalogRow,
  type CoverageHealthRow,
  type DomainEvidence,
  type IntelligenceCoverageReport,
  type KpiDomainKey,
} from "@/lib/intelligence/coverage-model";

/** Credential presence, read inside the handler chain (never at module scope). */
function credentialsFor(catalog: ReadonlyArray<CoverageCatalogRow>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const row of catalog) {
    out[row.providerId] =
      row.credentialEnv.length === 0 ||
      row.credentialEnv.every((name) => {
        const v = process.env[name];
        return typeof v === "string" && v.trim().length > 0;
      });
  }
  return out;
}

async function measureEvidence(): Promise<Record<KpiDomainKey, DomainEvidence>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const countOf = async (table: string): Promise<number> => {
    const { count, error } = await supabaseAdmin
      .from(table as never)
      .select("*", { count: "exact", head: true });
    return error ? 0 : (count ?? 0);
  };

  const [manifests, vessels, containers, riskRes, earliestRes, revenueRes] = await Promise.all([
    countOf("manifests"),
    countOf("vessels"),
    countOf("containers"),
    supabaseAdmin.from("risk_scores").select("score").limit(1000),
    supabaseAdmin
      .from("signals")
      .select("observed_at")
      .order("observed_at", { ascending: true })
      .limit(1),
    // Domain values are stored Title Case in some rows and lower case in
    // others; match both so the count cannot silently return zero.
    supabaseAdmin
      .from("signals")
      .select("metadata,domain")
      .in("domain", ["revenue", "Revenue", "manifest", "Manifest"]),
  ]);

  const riskRows = riskRes.data ?? [];
  const risk =
    riskRows.length > 0
      ? Math.round((riskRows.reduce((s, r) => s + (r.score ?? 0), 0) / riskRows.length) * 10) / 10
      : null;

  const revenueRows = revenueRes.data ?? [];
  const revenue = revenueRows.reduce((sum, r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const v = Number(meta.revenue_at_risk ?? 0);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);

  let historical: number | null = null;
  const earliestAt = earliestRes.data?.[0]?.observed_at;
  if (earliestAt) {
    const years = (Date.now() - new Date(earliestAt).getTime()) / (365.25 * 86_400_000);
    historical = Math.max(0, Math.round(years * 10) / 10);
  }

  return {
    manifest: { evidenceCount: manifests, value: manifests || null, uipPopulated: manifests > 0 },
    vessel: { evidenceCount: vessels, value: vessels || null, uipPopulated: vessels > 0 },
    container: {
      evidenceCount: containers,
      value: containers || null,
      uipPopulated: containers > 0,
    },
    revenue: {
      evidenceCount: revenue > 0 ? revenueRows.length : 0,
      value: revenue > 0 ? revenue : null,
      uipPopulated: revenue > 0,
      confidence: "inferred",
    },
    risk: {
      evidenceCount: riskRows.length,
      value: risk,
      uipPopulated: riskRows.length > 0,
      confidence: "inferred",
    },
    historical: {
      evidenceCount: historical === null ? 0 : 1,
      value: historical,
      uipPopulated: historical !== null,
    },
  };
}

export async function getIntelligenceCoverageReport(): Promise<IntelligenceCoverageReport> {
  const catalog: CoverageCatalogRow[] = buildEvidenceProviderCatalog().map((row) => ({
    providerId: row.providerId,
    providerName: row.providerName,
    capabilities: [...row.capabilities].map(String),
    credentialEnv: [...row.credentialEnv],
    certification: row.certification,
    lastValidationDate: row.lastValidationDate,
    projectionContractId: row.projectionContractId,
  }));

  const [snapshots, evidence] = await Promise.all([
    probeAllProviders().catch(() => []),
    measureEvidence().catch(
      () =>
        ({
          manifest: { evidenceCount: 0, value: null, uipPopulated: false },
          vessel: { evidenceCount: 0, value: null, uipPopulated: false },
          container: { evidenceCount: 0, value: null, uipPopulated: false },
          revenue: { evidenceCount: 0, value: null, uipPopulated: false },
          risk: { evidenceCount: 0, value: null, uipPopulated: false },
          historical: { evidenceCount: 0, value: null, uipPopulated: false },
        }) as Record<KpiDomainKey, DomainEvidence>,
    ),
  ]);

  const health: CoverageHealthRow[] = snapshots.map((s) => ({
    id: s.id,
    state: s.state,
    checkedAt: s.checkedAt,
    lastSuccessAt: s.lastSuccessAt,
    lastError: s.lastError,
    quotaRemaining: s.quotaRemaining,
    failureRate: s.failureRate,
  }));

  return buildIntelligenceCoverage({
    generatedAt: new Date().toISOString(),
    catalog,
    health,
    credentials: credentialsFor(catalog),
    evidence,
    mappedProjectionIds: PROJECTION_CONTRACT.map((e) => e.id),
    mappedDashboardFields: DASHBOARD_KPI_FIELDS,
  });
}
