/**
 * Operational Knowledge Layer (OKL) — engine.
 *
 * Consumes a Unified Intelligence Package (UIP) from the IFE and produces
 * an OperationalKnowledgePackage. Deterministic, evidence-backed, and
 * fully explainable — every pattern carries a Confidence Pyramid, source
 * connectors, contradictory evidence, alternatives, and recommendations.
 *
 * Backward compatible: the OKL is additive. Existing consumers of the
 * UIP, OSAE, MKG, PIE, Copilot, Executive Brief, and Investigation
 * Workspace continue to work unchanged.
 */
import type { UnifiedIntelligencePackage } from "@/services/ife";
import type { NormalizedEvidence, CanonicalEntityRef } from "@/services/ial/types";
import type { MaritimeKnowledgeGraph } from "@/services/mkg";

import {
  fusionToScore,
  tierFromScore,
  type ConfidencePyramid,
  type OklHistoricalHint,
  type OklInvestigationHint,
  type OklPatternKind,
  type OperationalKnowledgePackage,
  type OperationalPattern,
  type OperationalRecommendation,
  type RiskLevel,
} from "./types";

const uid = (p: string): string =>
  `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
const now = (): string => new Date().toISOString();

const RISK_ORDER: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export interface AnalyzeOklInput {
  readonly uip: UnifiedIntelligencePackage;
  /** Optional historical detections from prior OKL runs. */
  readonly historical?: ReadonlyArray<OklHistoricalHint>;
  /** Optional active-investigation entity map. */
  readonly investigations?: ReadonlyArray<OklInvestigationHint>;
  /** Optional raw evidence when the UIP fusion didn't retain full records. */
  readonly rawEvidence?: ReadonlyArray<NormalizedEvidence>;
  /** Optional Maritime Knowledge Graph for relationship enrichment. */
  readonly graph?: MaritimeKnowledgeGraph;
}

interface DetectorCtx {
  readonly uip: UnifiedIntelligencePackage;
  readonly historical: ReadonlyArray<OklHistoricalHint>;
  readonly investigations: ReadonlyArray<OklInvestigationHint>;
  readonly evidence: ReadonlyArray<NormalizedEvidence>;
  readonly graph?: MaritimeKnowledgeGraph;
  readonly identityScore: number;
  readonly evidenceScore: number;
  readonly fusionScore: number;
}

/** Compute the base confidence layers shared across all detectors. */
function baseConfidence(uip: UnifiedIntelligencePackage): {
  identity: number;
  evidence: number;
  fusion: number;
} {
  // Identity: agreement across the largest identity cluster + presence of
  // multiple aliasIds indicates cross-connector consensus.
  const cluster = uip.identity.reduce(
    (best, c) => (c.aliasIds.length > best.aliasIds.length ? c : best),
    uip.identity[0],
  );
  const identity = cluster
    ? Math.min(100, Math.round(50 + cluster.aliasIds.length * 15))
    : 40;

  // Evidence: freshness + source count.
  const freshDays = uip.freshestSeconds / 86_400;
  const freshnessScore =
    freshDays <= 1 ? 90 : freshDays <= 7 ? 75 : freshDays <= 30 ? 55 : freshDays <= 90 ? 40 : 25;
  const sourceScore = Math.min(30, uip.provenance.length * 8);
  const evidence = Math.min(100, Math.round(freshnessScore * 0.75 + sourceScore));

  // Fusion: from UIP.fused.confidence, discounted per contradiction.
  const fusionBase = fusionToScore(uip.fused.confidence);
  const contradictionDiscount = Math.min(30, uip.fused.contradictions.length * 8);
  const fusion = Math.max(15, fusionBase - contradictionDiscount);

  return { identity, evidence, fusion };
}

function pyramid(
  ctx: DetectorCtx,
  patternScore: number,
  reason: string,
): ConfidencePyramid {
  const { identityScore, evidenceScore, fusionScore } = ctx;
  const pattern = Math.max(0, Math.min(100, Math.round(patternScore)));
  // Recommendation confidence is the min of the pyramid layers, gently
  // penalised when contradictions exist.
  const min = Math.min(identityScore, evidenceScore, fusionScore, pattern);
  const contradictions = ctx.uip.fused.contradictions.length;
  const recommendation = Math.max(10, min - Math.min(15, contradictions * 5));
  return {
    identity: identityScore,
    evidence: evidenceScore,
    fusion: fusionScore,
    pattern,
    recommendation,
    tier: tierFromScore(recommendation),
    explanation: reason,
  };
}

function riskFromScore(score: number, boosts: number = 0): RiskLevel {
  const s = score + boosts;
  if (s >= 85) return "CRITICAL";
  if (s >= 65) return "HIGH";
  if (s >= 40) return "MEDIUM";
  return "LOW";
}

function collectEntityEvidence(
  ctx: DetectorCtx,
  entityIds: ReadonlyArray<string>,
): { ids: string[]; connectors: string[] } {
  const ids: string[] = [];
  const connectors = new Set<string>();
  for (const rec of ctx.evidence) {
    if (entityIds.includes(rec.entity.id)) {
      ids.push(rec.id);
      connectors.add(rec.source);
    }
  }
  return { ids, connectors: [...connectors] };
}

function investigationsFor(
  ctx: DetectorCtx,
  entityIds: ReadonlyArray<string>,
): string[] {
  const hits = new Set<string>();
  for (const inv of ctx.investigations) {
    if (inv.entityIds.some((e) => entityIds.includes(e))) hits.add(inv.investigationId);
  }
  return [...hits];
}

function makePattern(input: {
  ctx: DetectorCtx;
  kind: OklPatternKind;
  name: string;
  entities: ReadonlyArray<CanonicalEntityRef>;
  operationalImpact: string;
  patternScore: number;
  reason: string;
  reasoning: Array<{ step: string; detail?: string }>;
  alternatives?: OperationalPattern["alternatives"];
  recommendations: Array<Omit<OperationalRecommendation, "id" | "confidence">>;
  historicalContext?: string;
}): OperationalPattern {
  const { ctx, kind, name, entities, operationalImpact, patternScore, reason } = input;
  const entityIds = entities.map((e) => e.id);
  const { ids: supportingEvidenceIds, connectors } = collectEntityEvidence(ctx, entityIds);
  const contradictoryEvidenceIds = ctx.uip.fused.contradictions
    .filter((c) => entityIds.includes(c.entity.id))
    .flatMap((c) => c.values.map((v) => v.evidenceId));

  const confidence = pyramid(ctx, patternScore, reason);
  const boosts = confidence.recommendation >= 70 ? 5 : 0;
  const risk = riskFromScore(patternScore, boosts);

  const recommendations: OperationalRecommendation[] = input.recommendations.map((r) => ({
    id: uid("rec"),
    label: r.label,
    rationale: r.rationale,
    urgency: r.urgency,
    supportingEvidenceIds:
      r.supportingEvidenceIds.length > 0 ? r.supportingEvidenceIds : supportingEvidenceIds,
    requiresOfficerApproval: r.requiresOfficerApproval,
    confidence: Math.max(10, Math.round(confidence.recommendation * 0.95)),
  }));

  const investigationIds = investigationsFor(ctx, entityIds);

  return {
    id: uid("okl"),
    kind,
    name,
    operationalImpact,
    riskLevel: risk,
    confidence,
    entities,
    supportingEvidenceIds,
    sourceConnectors: connectors,
    contradictoryEvidenceIds,
    historicalContext: input.historicalContext,
    alternatives: input.alternatives ?? [],
    recommendations,
    reasoning: input.reasoning,
    investigationIds: investigationIds.length ? investigationIds : undefined,
    detectedAt: now(),
    provenance: {
      uipId: ctx.uip.id,
      fusedPackageId: ctx.uip.fused.id,
      detector: kind,
    },
  };
}

// ─── Detectors ─────────────────────────────────────────────────────────

function detectRepeatOffender(ctx: DetectorCtx): OperationalPattern[] {
  const out: OperationalPattern[] = [];
  for (const rec of ctx.uip.fused.canonical) {
    const priors = ctx.historical.filter(
      (h) => h.entityId === rec.entity.id && h.count >= 2,
    );
    if (priors.length === 0) continue;
    const total = priors.reduce((s, p) => s + p.count, 0);
    const patternScore = Math.min(95, 45 + total * 8);
    out.push(
      makePattern({
        ctx,
        kind: "REPEAT_OFFENDER",
        name: `Repeat offender: ${rec.entity.label ?? rec.entity.id}`,
        entities: [rec.entity],
        operationalImpact:
          "Subject has been flagged in prior OKL detections; escalate enforcement posture.",
        patternScore,
        reason: `${total} prior OKL detections across ${priors.length} pattern kinds`,
        reasoning: [
          { step: "Historical lookup", detail: `${priors.length} recurring kinds` },
          { step: "Threshold: ≥2 prior detections per kind" },
        ],
        alternatives: [
          {
            label: "Coincidental overlap with unrelated cases",
            likelihood: "LOW",
            rationale: "Multiple pattern kinds against the same canonical id.",
          },
        ],
        recommendations: [
          {
            label: "Open dedicated investigation",
            rationale: "Persistent behavioural signal warrants case ownership.",
            urgency: "PRIORITY",
            supportingEvidenceIds: [],
            requiresOfficerApproval: true,
          },
        ],
        historicalContext: `${total} detections since ${priors
          .map((p) => p.lastSeen)
          .sort()[0]}`,
      }),
    );
  }
  return out;
}

function detectSuspiciousRouting(ctx: DetectorCtx): OperationalPattern[] {
  const out: OperationalPattern[] = [];
  const positions = ctx.evidence.filter((e) => e.kind === "position" || e.kind === "voyage");
  const byEntity = new Map<string, NormalizedEvidence[]>();
  for (const p of positions) {
    const list = byEntity.get(p.entity.id) ?? [];
    list.push(p);
    byEntity.set(p.entity.id, list);
  }
  for (const [entityId, records] of byEntity) {
    if (records.length < 2) continue;
    const flagPorts = records.filter((r) =>
      String(r.fields.port ?? r.fields.destination ?? "")
        .toString()
        .match(/IR|KP|SY|CU|VE/i),
    );
    const detour = records.some(
      (r) => Number(r.fields.deviationKm ?? 0) > 200 || r.excerpt?.match(/deviation|detour/i),
    );
    if (flagPorts.length === 0 && !detour) continue;
    const patternScore =
      Math.min(90, 40 + flagPorts.length * 12 + (detour ? 15 : 0));
    const entity = records[0]?.entity;
    if (!entity) continue;
    out.push(
      makePattern({
        ctx,
        kind: "SUSPICIOUS_ROUTING",
        name: `Suspicious routing: ${entity.label ?? entityId}`,
        entities: [entity],
        operationalImpact:
          "Deviation or transit through sanctioned/watch jurisdictions increases interdiction priority.",
        patternScore,
        reason: `${flagPorts.length} port(s) in watch jurisdictions${detour ? " + detour signal" : ""}`,
        reasoning: [
          { step: "Position/voyage evidence scanned" },
          { step: "Flag-jurisdiction lookup" },
          { step: "Deviation heuristic (>200km or explicit note)" },
        ],
        alternatives: [
          {
            label: "Weather routing or humanitarian call",
            likelihood: "MEDIUM",
            rationale: "Legitimate diversions occur; corroborate with weather + charter.",
          },
        ],
        recommendations: [
          {
            label: "Request port-of-call justification",
            rationale: "Formal Q&A with operator establishes intent.",
            urgency: "PRIORITY",
            supportingEvidenceIds: [],
            requiresOfficerApproval: true,
          },
        ],
      }),
    );
  }
  return out;
}

function detectAisDarkPattern(ctx: DetectorCtx): OperationalPattern[] {
  const out: OperationalPattern[] = [];
  for (const { entityId, assessment } of ctx.uip.osae.map((a) => ({
    entityId: a.entityId,
    assessment: a.assessment,
  }))) {
    const darkEvents = assessment.eventAssessments?.filter((e) =>
      /dark|gap|off/i.test(e.kind ?? ""),
    );
    if (!darkEvents || darkEvents.length === 0) continue;
    const totalHours = darkEvents.reduce((s, e) => s + (e.durationHours ?? 0), 0);
    if (totalHours < 4) continue;
    const patternScore = Math.min(95, 40 + Math.round(totalHours) + darkEvents.length * 5);
    const entity =
      ctx.uip.fused.canonical.find((r) => r.entity.id === entityId)?.entity ??
      ({ kind: "vessel", id: entityId } as CanonicalEntityRef);
    out.push(
      makePattern({
        ctx,
        kind: "AIS_DARK_PATTERN",
        name: `AIS dark pattern: ${entity.label ?? entityId}`,
        entities: [entity],
        operationalImpact:
          "Recurring transponder silence is inconsistent with declared voyage — interdiction or vessel-status query indicated.",
        patternScore,
        reason: `${darkEvents.length} dark event(s), ~${Math.round(totalHours)}h total`,
        reasoning: [
          { step: "OSAE AIS event assessments consumed" },
          { step: "Total dark hours ≥ 4h threshold" },
        ],
        alternatives: [
          {
            label: "Equipment failure",
            likelihood: "LOW",
            rationale: "Isolated failures rarely repeat across voyages.",
          },
          {
            label: "Poor coverage area",
            likelihood: "MEDIUM",
            rationale: "Verify against terrestrial + satellite AIS overlap.",
          },
        ],
        recommendations: [
          {
            label: "Cross-check with satellite imagery windows",
            rationale: "Visual confirmation resolves equipment-vs-intent.",
            urgency: "IMMEDIATE",
            supportingEvidenceIds: [],
            requiresOfficerApproval: false,
          },
        ],
      }),
    );
  }
  return out;
}

function detectOwnershipLink(ctx: DetectorCtx): OperationalPattern[] {
  const out: OperationalPattern[] = [];
  const ownershipRecs = ctx.evidence.filter((e) => e.kind === "ownership");
  const byBeneficiary = new Map<string, NormalizedEvidence[]>();
  for (const r of ownershipRecs) {
    const key = String(r.fields.beneficialOwner ?? r.fields.parent ?? "").trim();
    if (!key) continue;
    const list = byBeneficiary.get(key) ?? [];
    list.push(r);
    byBeneficiary.set(key, list);
  }
  for (const [owner, records] of byBeneficiary) {
    if (records.length < 2) continue;
    const entities = Array.from(
      new Map(records.map((r) => [r.entity.id, r.entity])).values(),
    );
    const patternScore = Math.min(90, 45 + entities.length * 10);
    out.push(
      makePattern({
        ctx,
        kind: "OWNERSHIP_LINK",
        name: `Shared beneficial ownership: ${owner}`,
        entities,
        operationalImpact:
          "Common beneficial ownership across multiple entities suggests network coordination.",
        patternScore,
        reason: `${entities.length} entities share owner "${owner}"`,
        reasoning: [
          { step: "Ownership evidence grouped by beneficialOwner" },
          { step: "Threshold: ≥2 entities per owner" },
        ],
        alternatives: [
          {
            label: "Conglomerate structure",
            likelihood: "HIGH",
            rationale: "Large groups own many subsidiaries — corroborate with CAC/registry.",
          },
        ],
        recommendations: [
          {
            label: "Run ownership graph traversal in MKG",
            rationale: "Reveal hidden layers of intermediaries.",
            urgency: "PRIORITY",
            supportingEvidenceIds: [],
            requiresOfficerApproval: false,
          },
        ],
      }),
    );
  }
  return out;
}

function detectCargoAnomaly(ctx: DetectorCtx): OperationalPattern[] {
  const out: OperationalPattern[] = [];
  const cargo = ctx.evidence.filter((e) => e.kind === "cargo");
  for (const r of cargo) {
    const declared = Number(r.fields.declaredWeightTonnes ?? 0);
    const observed = Number(r.fields.observedWeightTonnes ?? 0);
    const declaredValue = Number(r.fields.declaredValueUsd ?? 0);
    const marketValue = Number(r.fields.marketValueUsd ?? 0);
    const weightGap =
      declared > 0 && observed > 0 ? Math.abs(observed - declared) / declared : 0;
    const valueGap =
      declaredValue > 0 && marketValue > 0
        ? Math.abs(marketValue - declaredValue) / marketValue
        : 0;
    if (weightGap < 0.1 && valueGap < 0.15) continue;
    const patternScore = Math.min(95, 40 + Math.round((weightGap + valueGap) * 100));
    out.push(
      makePattern({
        ctx,
        kind: "CARGO_ANOMALY",
        name: `Cargo anomaly: ${r.entity.label ?? r.entity.id}`,
        entities: [r.entity],
        operationalImpact:
          "Declared vs. observed cargo divergence points to under-declaration or misclassification.",
        patternScore,
        reason: `weight gap ${Math.round(weightGap * 100)}%, value gap ${Math.round(valueGap * 100)}%`,
        reasoning: [
          { step: "Compared declared vs. observed weight/value" },
          { step: "Threshold: weight >10% or value >15%" },
        ],
        alternatives: [
          {
            label: "Measurement/units drift",
            likelihood: "MEDIUM",
            rationale: "Unit conversion errors and tare weight can inflate gaps.",
          },
        ],
        recommendations: [
          {
            label: "Trigger cargo re-inspection",
            rationale: "Physical verification resolves the divergence.",
            urgency: "PRIORITY",
            supportingEvidenceIds: [],
            requiresOfficerApproval: true,
          },
        ],
      }),
    );
  }
  return out;
}

function detectManifestInconsistency(ctx: DetectorCtx): OperationalPattern[] {
  const out: OperationalPattern[] = [];
  // A manifest inconsistency shows up in IFE as a field contradiction on
  // cargo/voyage/identity for a vessel.
  const relevant = ctx.uip.fused.contradictions.filter((c) =>
    ["cargo", "voyage", "identity", "port"].includes(c.field.toLowerCase()) ||
    c.field.match(/manifest|cargo|voyage|port|destination/i),
  );
  for (const cx of relevant) {
    const patternScore = cx.severity === "critical" ? 80 : cx.severity === "warn" ? 60 : 45;
    out.push(
      makePattern({
        ctx,
        kind: "MANIFEST_INCONSISTENCY",
        name: `Manifest inconsistency on ${cx.field}`,
        entities: [cx.entity],
        operationalImpact:
          "Conflicting values across sources on a manifest field breaks provenance — hold cargo release.",
        patternScore,
        reason: cx.explanation,
        reasoning: [
          { step: "IFE contradiction consumed" },
          { step: `Severity: ${cx.severity}` },
        ],
        alternatives: [
          {
            label: "Late amendment not yet propagated",
            likelihood: "MEDIUM",
            rationale: "Amended manifests can lag connector caches.",
          },
        ],
        recommendations: [
          {
            label: "Freeze manifest release until reconciled",
            rationale: "Prevents duty leakage from mis-declared consignments.",
            urgency: "IMMEDIATE",
            supportingEvidenceIds: cx.values.map((v) => v.evidenceId),
            requiresOfficerApproval: true,
          },
        ],
      }),
    );
  }
  return out;
}

function detectRevenueLeakage(ctx: DetectorCtx): OperationalPattern[] {
  const out: OperationalPattern[] = [];
  const cargoLeaks = ctx.evidence.filter(
    (e) =>
      e.kind === "cargo" &&
      Number(e.fields.declaredValueUsd ?? 0) > 0 &&
      Number(e.fields.marketValueUsd ?? 0) > Number(e.fields.declaredValueUsd ?? 0) * 1.2,
  );
  for (const r of cargoLeaks) {
    const gap =
      Number(r.fields.marketValueUsd ?? 0) - Number(r.fields.declaredValueUsd ?? 0);
    const patternScore = Math.min(95, 55 + Math.min(30, Math.round(gap / 100_000)));
    out.push(
      makePattern({
        ctx,
        kind: "REVENUE_LEAKAGE",
        name: `Revenue leakage: ${r.entity.label ?? r.entity.id}`,
        entities: [r.entity],
        operationalImpact: `Estimated duty shortfall on this consignment ≈ $${Math.round(
          gap,
        ).toLocaleString()}.`,
        patternScore,
        reason: "Declared value materially below market value",
        reasoning: [
          { step: "Compared declared vs. market value" },
          { step: "Under-declaration threshold: >20%" },
        ],
        alternatives: [
          {
            label: "Legitimate bulk-discount pricing",
            likelihood: "MEDIUM",
            rationale: "Long-term contracts can price below spot.",
          },
        ],
        recommendations: [
          {
            label: "Refer to revenue recovery team",
            rationale: "Recover duty on the under-declared consignment.",
            urgency: "PRIORITY",
            supportingEvidenceIds: [r.id],
            requiresOfficerApproval: true,
          },
        ],
      }),
    );
  }
  return out;
}

function detectComplianceViolation(ctx: DetectorCtx): OperationalPattern[] {
  const out: OperationalPattern[] = [];
  const sanctionsHits = ctx.evidence.filter(
    (e) =>
      (e.kind === "sanctions" || e.kind === "compliance") &&
      (String(e.fields.status ?? "").match(/listed|match|hit|violation/i) ||
        Number(e.fields.score ?? 0) >= 70),
  );
  for (const r of sanctionsHits) {
    const score = Number(r.fields.score ?? 75);
    const patternScore = Math.min(98, Math.round(score));
    out.push(
      makePattern({
        ctx,
        kind: "COMPLIANCE_VIOLATION",
        name: `Compliance/sanctions signal: ${r.entity.label ?? r.entity.id}`,
        entities: [r.entity],
        operationalImpact:
          "Listed or high-scoring sanctions signal — enforcement risk to Nigeria and correspondent banks.",
        patternScore,
        reason: `${r.sourceName} · score ${score}`,
        reasoning: [
          { step: "Sanctions/compliance evidence read from UIP" },
          { step: "Match/listed status or score ≥70" },
        ],
        alternatives: [
          {
            label: "False positive on similar name",
            likelihood: "MEDIUM",
            rationale: "Confirm identity via IMO/registry cross-reference.",
          },
        ],
        recommendations: [
          {
            label: "Block clearance pending review",
            rationale: "Prevent exposure while identity is confirmed.",
            urgency: "IMMEDIATE",
            supportingEvidenceIds: [r.id],
            requiresOfficerApproval: true,
          },
        ],
      }),
    );
  }
  return out;
}

function detectPortCongestion(ctx: DetectorCtx): OperationalPattern[] {
  const out: OperationalPattern[] = [];
  const portCalls = ctx.evidence.filter((e) => e.kind === "port-call");
  const byPort = new Map<string, NormalizedEvidence[]>();
  for (const r of portCalls) {
    const key = String(r.fields.port ?? r.entity.id);
    const list = byPort.get(key) ?? [];
    list.push(r);
    byPort.set(key, list);
  }
  for (const [port, recs] of byPort) {
    if (recs.length < 5) continue;
    const avgWait =
      recs.reduce((s, r) => s + Number(r.fields.waitHours ?? 0), 0) / recs.length;
    if (avgWait < 24) continue;
    const patternScore = Math.min(90, 40 + Math.round(avgWait));
    const entity: CanonicalEntityRef = {
      kind: "port",
      id: recs[0]?.entity.id ?? `port:${port}`,
      label: port,
    };
    out.push(
      makePattern({
        ctx,
        kind: "PORT_CONGESTION",
        name: `Port congestion: ${port}`,
        entities: [entity],
        operationalImpact:
          "Elevated waiting time is disrupting operations and creating queue-jumping incentives.",
        patternScore,
        reason: `avg wait ${Math.round(avgWait)}h across ${recs.length} calls`,
        reasoning: [
          { step: "Port-call evidence grouped by port" },
          { step: "Threshold: ≥5 calls with avg wait ≥24h" },
        ],
        alternatives: [
          {
            label: "Scheduled maintenance",
            likelihood: "MEDIUM",
            rationale: "Berth outages can raise average waits temporarily.",
          },
        ],
        recommendations: [
          {
            label: "Notify port ops for queue management",
            rationale: "Restore throughput and reduce leakage risk from side deals.",
            urgency: "ROUTINE",
            supportingEvidenceIds: [],
            requiresOfficerApproval: false,
          },
        ],
      }),
    );
  }
  return out;
}

function detectCrossInvestigationLink(ctx: DetectorCtx): OperationalPattern[] {
  if (ctx.investigations.length === 0) return [];
  const out: OperationalPattern[] = [];
  const entitiesByInv = ctx.investigations;
  for (const rec of ctx.uip.fused.canonical) {
    const linked = entitiesByInv.filter((inv) => inv.entityIds.includes(rec.entity.id));
    if (linked.length < 2) continue;
    const patternScore = Math.min(90, 55 + linked.length * 10);
    out.push(
      makePattern({
        ctx,
        kind: "CROSS_INVESTIGATION_LINK",
        name: `Entity spans ${linked.length} investigations`,
        entities: [rec.entity],
        operationalImpact:
          "The same subject anchors multiple open investigations — consolidate to prevent duplicated effort.",
        patternScore,
        reason: `${linked.length} investigations share this entity`,
        reasoning: [
          { step: "Cross-referenced entity ids against active investigations" },
          { step: "Threshold: ≥2 investigations" },
        ],
        alternatives: [
          {
            label: "Independent officer workstreams",
            likelihood: "LOW",
            rationale: "Coincidental focus rarely persists across cases.",
          },
        ],
        recommendations: [
          {
            label: "Merge or coordinate investigations",
            rationale: "Prevents evidence fragmentation and conflicting decisions.",
            urgency: "PRIORITY",
            supportingEvidenceIds: [],
            requiresOfficerApproval: true,
          },
        ],
      }),
    );
  }
  return out;
}

function detectHistoricalBehaviour(ctx: DetectorCtx): OperationalPattern[] {
  const out: OperationalPattern[] = [];
  const byEntityKind = new Map<string, OklHistoricalHint[]>();
  for (const h of ctx.historical) {
    const list = byEntityKind.get(h.entityId) ?? [];
    list.push(h);
    byEntityKind.set(h.entityId, list);
  }
  for (const [entityId, hits] of byEntityKind) {
    const kinds = new Set(hits.map((h) => h.patternKind));
    if (kinds.size < 2) continue; // covered by REPEAT_OFFENDER logic
    const patternScore = Math.min(90, 40 + kinds.size * 10);
    const entity =
      ctx.uip.fused.canonical.find((r) => r.entity.id === entityId)?.entity ??
      ({ kind: "vessel", id: entityId } as CanonicalEntityRef);
    out.push(
      makePattern({
        ctx,
        kind: "HISTORICAL_BEHAVIOUR",
        name: `Recurring behavioural profile: ${entity.label ?? entityId}`,
        entities: [entity],
        operationalImpact:
          "Subject exhibits multiple distinct pattern kinds over time — treat as programmatic actor.",
        patternScore,
        reason: `${kinds.size} distinct pattern kinds observed historically`,
        reasoning: [
          { step: "Historical hints scanned for diverse patternKinds" },
          { step: "Threshold: ≥2 distinct kinds" },
        ],
        alternatives: [
          {
            label: "Aggregation artefact across unrelated cases",
            likelihood: "LOW",
            rationale: "Diverse kinds against one canonical id is unlikely coincidental.",
          },
        ],
        recommendations: [
          {
            label: "Establish long-running surveillance file",
            rationale: "Programmatic actors need continuous coverage, not case-by-case work.",
            urgency: "PRIORITY",
            supportingEvidenceIds: [],
            requiresOfficerApproval: true,
          },
        ],
        historicalContext: `${hits.length} prior detections across ${kinds.size} kinds`,
      }),
    );
  }
  return out;
}

// ─── Orchestrator ──────────────────────────────────────────────────────

export function analyzeOperationalKnowledge(
  input: AnalyzeOklInput,
): OperationalKnowledgePackage {
  const base = baseConfidence(input.uip);
  const ctx: DetectorCtx = {
    uip: input.uip,
    historical: input.historical ?? [],
    investigations: input.investigations ?? [],
    evidence: input.rawEvidence ?? [],
    graph: input.graph,
    identityScore: base.identity,
    evidenceScore: base.evidence,
    fusionScore: base.fusion,
  };

  const patterns: OperationalPattern[] = [
    ...detectRepeatOffender(ctx),
    ...detectSuspiciousRouting(ctx),
    ...detectAisDarkPattern(ctx),
    ...detectOwnershipLink(ctx),
    ...detectCargoAnomaly(ctx),
    ...detectManifestInconsistency(ctx),
    ...detectRevenueLeakage(ctx),
    ...detectComplianceViolation(ctx),
    ...detectPortCongestion(ctx),
    ...detectCrossInvestigationLink(ctx),
    ...detectHistoricalBehaviour(ctx),
  ].sort((a, b) => RISK_ORDER[b.riskLevel] - RISK_ORDER[a.riskLevel]);

  // MKG enrichment — attach graph neighbours as related entities on each
  // pattern without inventing new evidence.
  const enriched: OperationalPattern[] = ctx.graph
    ? patterns.map((p) => {
        const seen = new Set(p.entities.map((e) => e.id));
        const related: CanonicalEntityRef[] = [];
        for (const e of p.entities) {
          const nbrs = ctx.graph!.neighbors(e.id).slice(0, 3);
          for (const n of nbrs) {
            if (seen.has(n.neighbor.id)) continue;
            seen.add(n.neighbor.id);
            related.push({
              kind: (n.neighbor.kind ?? "vessel") as CanonicalEntityRef["kind"],
              id: n.neighbor.id,
              label: n.neighbor.label,
            });
          }
        }
        return related.length
          ? { ...p, entities: [...p.entities, ...related] }
          : p;
      })
    : patterns;

  const byRisk: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const byKind: Partial<Record<OklPatternKind, number>> = {};
  for (const p of enriched) {
    byRisk[p.riskLevel] += 1;
    byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
  }

  const topRecommendation = enriched
    .flatMap((p) => p.recommendations)
    .sort((a, b) => {
      const u = { IMMEDIATE: 0, PRIORITY: 1, ROUTINE: 2 } as const;
      return u[a.urgency] - u[b.urgency] || b.confidence - a.confidence;
    })[0];

  const overallConfidence: ConfidencePyramid = {
    identity: base.identity,
    evidence: base.evidence,
    fusion: base.fusion,
    pattern: enriched.length
      ? Math.round(
          enriched.reduce((s, p) => s + p.confidence.pattern, 0) / enriched.length,
        )
      : 0,
    recommendation: topRecommendation?.confidence ?? 0,
    tier: tierFromScore(topRecommendation?.confidence ?? 0),
    explanation:
      enriched.length === 0
        ? "No operational patterns detected in the current UIP."
        : `Composite of ${enriched.length} pattern(s); top recommendation drives overall tier.`,
  };

  return {
    id: uid("okpkg"),
    createdAt: now(),
    uipId: input.uip.id,
    patterns: enriched,
    summary: {
      total: enriched.length,
      byRisk,
      byKind,
      topRecommendation,
      overallConfidence,
    },
  };
}
