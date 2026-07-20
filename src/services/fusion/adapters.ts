/**
 * Sprint 7 · Agent Framework adapters.
 *
 * Converts each Sprint 6 `AgentResult<T>` into an array of `RawEvidence` atoms
 * the fusion pipeline can normalise. The adapters are the only place that
 * knows the shape of individual agent outputs — everything downstream is
 * shape-agnostic.
 */
import type {
  ComplianceOutput,
  EvidenceOutput,
  ForecastOutput,
  ManifestOutput,
  OwnershipOutput,
  RevenueOutput,
} from "@/services/agents/schemas";
import type { AgentResult } from "@/services/agents/types";
import type { RawEvidence } from "./schemas";

type AnyAgentResult = AgentResult<unknown>;

function nowIso(fallback?: string): string {
  return fallback ?? new Date().toISOString();
}

function fromOwnership(r: AgentResult<OwnershipOutput>): RawEvidence[] {
  const d = r.data;
  if (!d) return [];
  const stamp = d.citations[0]?.observedAt;
  const items: RawEvidence[] = [];
  if (d.legalOwner) {
    items.push({
      id: `${r.agent}:legal_owner:${d.subjectEntityId}`,
      agent: r.agent,
      sourceSystem: d.citations[0]?.source ?? "CAC",
      entityIds: [d.subjectEntityId],
      attribute: "ownership.legal_owner",
      value: d.legalOwner.name,
      unit: null,
      grade: "verified",
      collectedAt: nowIso(stamp),
    });
  }
  for (const ubo of d.beneficialOwners) {
    items.push({
      id: `${r.agent}:ubo:${d.subjectEntityId}:${ubo.name}`,
      agent: r.agent,
      sourceSystem: d.citations[0]?.source ?? "CAC",
      entityIds: [d.subjectEntityId],
      attribute: `ownership.ubo.${ubo.name}`,
      value: ubo.sharePct,
      unit: "PCT",
      grade: ubo.grade,
      collectedAt: nowIso(stamp),
    });
  }
  return items;
}

function fromRevenue(r: AgentResult<RevenueOutput>): RawEvidence[] {
  const d = r.data;
  if (!d) return [];
  const stamp = d.citations[0]?.observedAt;
  return [
    {
      id: `${r.agent}:declared:${d.subjectEntityId}`,
      agent: r.agent,
      sourceSystem: "CUSTOMS_DB",
      entityIds: [d.subjectEntityId],
      attribute: "revenue.declared",
      value: d.declaredRevenue,
      unit: d.currency,
      grade: "verified",
      collectedAt: nowIso(stamp),
    },
    {
      id: `${r.agent}:observed:${d.subjectEntityId}`,
      agent: r.agent,
      sourceSystem: "INVOICE_DB",
      entityIds: [d.subjectEntityId],
      attribute: "revenue.observed",
      value: d.observedRevenue,
      unit: d.currency,
      grade: "observed",
      collectedAt: nowIso(stamp),
    },
  ];
}

function fromCompliance(r: AgentResult<ComplianceOutput>): RawEvidence[] {
  const d = r.data;
  if (!d) return [];
  return d.certificates.map((c) => ({
    id: `${r.agent}:cert:${d.subjectEntityId}:${c.code}`,
    agent: r.agent,
    sourceSystem: "CERTIFICATE_REGISTRY",
    entityIds: [d.subjectEntityId],
    attribute: `compliance.cert.${c.code}`,
    value: c.validUntil ?? "unknown",
    unit: null,
    grade: c.grade,
    collectedAt: nowIso(d.citations[0]?.observedAt),
  }));
}

function fromManifest(r: AgentResult<ManifestOutput>): RawEvidence[] {
  const d = r.data;
  if (!d) return [];
  return [
    {
      id: `${r.agent}:declared:${d.manifestId}`,
      agent: r.agent,
      sourceSystem: "MANIFEST_DB",
      entityIds: [d.subjectEntityId],
      attribute: "manifest.container_count",
      value: d.declaredContainers,
      unit: "TEU",
      grade: "verified",
      collectedAt: nowIso(d.citations[0]?.observedAt),
    },
    {
      id: `${r.agent}:observed:${d.manifestId}`,
      agent: r.agent,
      sourceSystem: "CONTAINER_DB",
      entityIds: [d.subjectEntityId],
      attribute: "manifest.container_count",
      value: d.observedContainers,
      unit: "TEU",
      grade: "observed",
      collectedAt: nowIso(d.citations[0]?.observedAt),
    },
  ];
}

function fromEvidence(r: AgentResult<EvidenceOutput>): RawEvidence[] {
  const d = r.data;
  if (!d) return [];
  return d.items.map((it) => ({
    id: it.id,
    agent: r.agent,
    sourceSystem: it.sourceSystem,
    entityIds: [d.subjectEntityId],
    attribute: `evidence.${it.id}`,
    value: it.contentHash,
    unit: null,
    grade: it.grade,
    collectedAt: it.collectedAt,
  }));
}

function fromForecast(r: AgentResult<ForecastOutput>): RawEvidence[] {
  const d = r.data;
  if (!d) return [];
  return d.patterns.map((p) => ({
    id: `${r.agent}:${p.id}`,
    agent: r.agent,
    sourceSystem: "PATTERN_ENGINE",
    entityIds: [d.subjectEntityId],
    attribute: `forecast.pattern.${p.id}`,
    value: p.matchScore,
    unit: "SCORE",
    grade: p.grade,
    collectedAt: nowIso(d.citations[0]?.observedAt),
  }));
}

const ADAPTERS: Record<string, (r: AnyAgentResult) => RawEvidence[]> = {
  ownership: (r) => fromOwnership(r as AgentResult<OwnershipOutput>),
  revenue: (r) => fromRevenue(r as AgentResult<RevenueOutput>),
  compliance: (r) => fromCompliance(r as AgentResult<ComplianceOutput>),
  manifest: (r) => fromManifest(r as AgentResult<ManifestOutput>),
  evidence: (r) => fromEvidence(r as AgentResult<EvidenceOutput>),
  forecast: (r) => fromForecast(r as AgentResult<ForecastOutput>),
};

/** Convert an array of AgentResults into RawEvidence atoms for the fusion pipeline. */
export function agentResultsToRawEvidence(results: readonly AnyAgentResult[]): RawEvidence[] {
  const out: RawEvidence[] = [];
  for (const r of results) {
    if (r.status === "error" || r.status === "timeout" || !r.data) continue;
    const adapt = ADAPTERS[r.agent];
    if (!adapt) continue;
    out.push(...adapt(r));
  }
  return out;
}
