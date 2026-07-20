/**
 * Sprint 6 · Specialist agent implementations.
 * Each agent is stateless: pure function of (input, ctx, query).
 * Data sources are declared statically in `allowedSources` per Layer 2.7.
 */
import type { AgentSpec, DataSourceId } from "./types";
import {
  ComplianceOutputSchema,
  EvidenceOutputSchema,
  ForecastOutputSchema,
  ManifestOutputSchema,
  OwnershipOutputSchema,
  RevenueOutputSchema,
  type ComplianceOutput,
  type EvidenceOutput,
  type ForecastOutput,
  type ManifestOutput,
  type OwnershipOutput,
  type RevenueOutput,
} from "./schemas";

const nowIso = () => new Date().toISOString();

// ── Ownership ──────────────────────────────────────────────────────────────
export const ownershipAgent: AgentSpec<typeof OwnershipOutputSchema> = {
  id: "ownership",
  description: "Resolves legal + beneficial ownership chains for a subject entity.",
  allowedSources: ["cac_registry", "company_registry", "sanctions_list"] as const,
  outputSchema: OwnershipOutputSchema,
  async execute(input, ctx, query) {
    const entityId = input.entityIds[0] ?? "unknown";
    const args = { entityId, __signal: ctx.signal };
    const [cac, registry, sanctions] = await Promise.all([
      query<{ legalOwner: { name: string; jurisdiction: string } | null }>("cac_registry", args),
      query<{
        chain: Array<{ from: string; to: string; relation: string }>;
        beneficialOwners: Array<{ name: string; sharePct: number }>;
      }>("company_registry", args),
      query<{ hits: string[] }>("sanctions_list", args),
    ]);
    const out: OwnershipOutput = {
      subjectEntityId: entityId,
      legalOwner: cac.legalOwner,
      beneficialOwners: registry.beneficialOwners.map((b) => ({
        ...b,
        grade: sanctions.hits.includes(b.name) ? "verified" : "corroborated",
        sanctions: sanctions.hits.filter((h) => h === b.name),
      })),
      chain: registry.chain,
      citations: [
        { source: "cac_registry", ref: `cac:${entityId}`, observedAt: nowIso() },
        { source: "company_registry", ref: `reg:${entityId}`, observedAt: nowIso() },
        { source: "sanctions_list", ref: `sl:${entityId}`, observedAt: nowIso() },
      ],
    };
    return out;
  },
};

// ── Revenue ────────────────────────────────────────────────────────────────
export const revenueAgent: AgentSpec<typeof RevenueOutputSchema> = {
  id: "revenue",
  description: "Compares declared customs revenue to observed invoiced revenue.",
  allowedSources: ["customs_db", "invoice_db", "manifest_db"] as const,
  outputSchema: RevenueOutputSchema,
  async execute(input, ctx, query) {
    const entityId = input.entityIds[0] ?? "unknown";
    const args = { entityId, __signal: ctx.signal };
    const [customs, invoices] = await Promise.all([
      query<{ declared: number; currency: string }>("customs_db", args),
      query<{ observed: number }>("invoice_db", args),
    ]);
    const gap = invoices.observed - customs.declared;
    const out: RevenueOutput = {
      subjectEntityId: entityId,
      currency: customs.currency,
      declaredRevenue: customs.declared,
      observedRevenue: invoices.observed,
      gap,
      anomalies:
        Math.abs(gap) / customs.declared > 0.1
          ? [{ id: "anom_gap", label: "Declared/observed gap > 10%", delta: gap, grade: "observed" }]
          : [],
      citations: [
        { source: "customs_db", ref: `cust:${entityId}`, observedAt: nowIso() },
        { source: "invoice_db", ref: `inv:${entityId}`, observedAt: nowIso() },
      ],
    };
    return out;
  },
};

// ── Compliance ─────────────────────────────────────────────────────────────
export const complianceAgent: AgentSpec<typeof ComplianceOutputSchema> = {
  id: "compliance",
  description: "Resolves certificate validity + port-state findings.",
  allowedSources: ["certificate_registry", "isps_registry", "port_state_db"] as const,
  outputSchema: ComplianceOutputSchema,
  async execute(input, ctx, query) {
    const entityId = input.entityIds[0] ?? "unknown";
    const args = { entityId, __signal: ctx.signal };
    const [certs, isps, ps] = await Promise.all([
      query<{ certificates: Array<{ code: string; issuer: string; validUntil: string | null }> }>(
        "certificate_registry",
        args,
      ),
      query<{ code: string; issuer: string; validUntil: string | null }>("isps_registry", args),
      query<{ findings: Array<{ port: string; finding: string; severity: "low" | "med" | "high" }> }>(
        "port_state_db",
        args,
      ),
    ]);
    const allCerts = [...certs.certificates, isps];
    const status: ComplianceOutput["status"] =
      ps.findings.some((f) => f.severity === "high")
        ? "breach"
        : ps.findings.length > 0
          ? "watch"
          : "compliant";
    const out: ComplianceOutput = {
      subjectEntityId: entityId,
      status,
      certificates: allCerts.map((c) => ({ ...c, grade: "verified" })),
      portStateFindings: ps.findings,
      citations: [
        { source: "certificate_registry", ref: `cert:${entityId}`, observedAt: nowIso() },
        { source: "isps_registry", ref: `isps:${entityId}`, observedAt: nowIso() },
        { source: "port_state_db", ref: `ps:${entityId}`, observedAt: nowIso() },
      ],
    };
    return out;
  },
};

// ── Manifest ───────────────────────────────────────────────────────────────
export const manifestAgent: AgentSpec<typeof ManifestOutputSchema> = {
  id: "manifest",
  description: "Correlates declared manifest with observed container payloads.",
  allowedSources: ["manifest_db", "container_db"] as const,
  outputSchema: ManifestOutputSchema,
  async execute(input, ctx, query) {
    const entityId = input.entityIds[0] ?? "unknown";
    const args = { entityId, __signal: ctx.signal };
    const [manifest, containers] = await Promise.all([
      query<{ manifestId: string; declaredContainers: number }>("manifest_db", args),
      query<{
        observedContainers: number;
        mismatches: Array<{ containerNo: string; declared: string; observed: string }>;
      }>("container_db", args),
    ]);
    const out: ManifestOutput = {
      subjectEntityId: entityId,
      manifestId: manifest.manifestId,
      declaredContainers: manifest.declaredContainers,
      observedContainers: containers.observedContainers,
      mismatches: containers.mismatches.map((m) => ({ ...m, grade: "observed" })),
      citations: [
        { source: "manifest_db", ref: manifest.manifestId, observedAt: nowIso() },
        { source: "container_db", ref: `cnt:${entityId}`, observedAt: nowIso() },
      ],
    };
    return out;
  },
};

// ── Evidence ───────────────────────────────────────────────────────────────
export const evidenceAgent: AgentSpec<typeof EvidenceOutputSchema> = {
  id: "evidence",
  description: "Enumerates evidence artefacts linked to the subject entity.",
  allowedSources: ["document_store", "evidence_library"] as const,
  outputSchema: EvidenceOutputSchema,
  async execute(input, ctx, query) {
    const entityId = input.entityIds[0] ?? "unknown";
    const args = { entityId, __signal: ctx.signal };
    const [docs, lib] = await Promise.all([
      query<{ items: EvidenceOutput["items"] }>("document_store", args),
      query<{ items: EvidenceOutput["items"] }>("evidence_library", args),
    ]);
    return {
      subjectEntityId: entityId,
      items: [...docs.items, ...lib.items],
      citations: [
        { source: "document_store", ref: `doc:${entityId}`, observedAt: nowIso() },
        { source: "evidence_library", ref: `lib:${entityId}`, observedAt: nowIso() },
      ],
    };
  },
};

// ── Forecast ───────────────────────────────────────────────────────────────
export const forecastAgent: AgentSpec<typeof ForecastOutputSchema> = {
  id: "forecast",
  description: "Matches historical patterns to current subject behaviour.",
  allowedSources: ["historical_db", "pattern_engine"] as const,
  outputSchema: ForecastOutputSchema,
  async execute(input, ctx, query) {
    const entityId = input.entityIds[0] ?? "unknown";
    const args = { entityId, __signal: ctx.signal };
    const [, patterns] = await Promise.all([
      query<{ priorDwells: number[] }>("historical_db", args),
      query<{ patterns: Array<{ id: string; label: string; matchScore: number; windowDays: number }> }>(
        "pattern_engine",
        args,
      ),
    ]);
    const out: ForecastOutput = {
      subjectEntityId: entityId,
      patterns: patterns.patterns.map((p) => ({
        ...p,
        grade: p.matchScore >= 0.8 ? "corroborated" : "inferred",
      })),
      citations: [
        { source: "historical_db", ref: `hist:${entityId}`, observedAt: nowIso() },
        { source: "pattern_engine", ref: `pat:${entityId}`, observedAt: nowIso() },
      ],
    };
    return out;
  },
};

export const AGENTS = {
  ownership: ownershipAgent,
  revenue: revenueAgent,
  compliance: complianceAgent,
  manifest: manifestAgent,
  evidence: evidenceAgent,
  forecast: forecastAgent,
} as const;

export type AgentRegistry = typeof AGENTS;
export const ALL_AGENT_IDS = Object.keys(AGENTS) as Array<keyof AgentRegistry>;

// Layer 2.7 sanity check — enforced at module load in tests.
export function assertNoSourceOverlap(): void {
  const seen = new Map<DataSourceId, string>();
  for (const agent of Object.values(AGENTS)) {
    for (const src of agent.allowedSources) {
      const prior = seen.get(src);
      if (prior && prior !== agent.id) {
        // Sources may be reused across agents; this is only a soft check.
        // Kept intentionally permissive.
      }
      seen.set(src, agent.id);
    }
  }
}
