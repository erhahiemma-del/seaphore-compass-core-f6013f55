/**
 * ─────────────────────────────────────────────────────────────────────
 *  INT-01A — MIC · Container (Dependency Injection)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  The MicContainer owns the eight registry instances, ensures they are
 *  co-located, and exposes the unified `process(uip)` entry point.
 *
 *  The container is the ONLY place that wires registries together. No
 *  other module imports multiple registries — they receive the container
 *  and pull what they need through it.
 *
 *  Design choices:
 *    • Class-based DI. No framework. No decorators. Testable by
 *      construction — pass a container with pre-populated registries.
 *    • A process-wide singleton is exported for production use. Tests
 *      construct fresh instances so they never share state.
 *    • `process()` is synchronous and deterministic given the same UIP.
 * ─────────────────────────────────────────────────────────────────────
 */
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";
import { MaritimeKnowledgeGraph } from "@/services/mkg/graph";
import { ingestUnifiedPackage } from "@/services/mkg/ingest";
import { IntelligenceObjectRegistry } from "./entities/registry";
import { buildIntelligenceObjects } from "./entities/builder";

import {
  MicConfidenceRegistry,
  MicEntityRegistry,
  MicEvidenceRegistry,
  MicGraphRegistry,
  MicReasoningRegistry,
  MicRelationshipRegistry,
  MicRiskRegistry,
  MicTimelineRegistry,
} from "./registries";
import type {
  MicConfidenceTier,
  MicCitation,
  MicProcessResult,
  MicRiskRegistryEntry,
  MicTimelineEvent,
} from "./types";
import {
  citationFromEvidence,
  micBandFromScore,
  micScoreFromGrade,
  micTierFromScore,
} from "./types";
import type { NormalizedEvidence, EvidenceGrade } from "@/services/ial/types";
import type { MkgEdge, MkgNode } from "@/services/mkg/types";

export interface MicContainerOptions {
  readonly clock?: () => string;   // injectable for tests
}

export class MicContainer {
  // ── Eight registries ────────────────────────────────────────────────
  readonly entities:      MicEntityRegistry;
  readonly relationships: MicRelationshipRegistry;
  readonly evidence:      MicEvidenceRegistry;
  readonly confidence:    MicConfidenceRegistry;
  readonly timeline:      MicTimelineRegistry;
  readonly graph:         MicGraphRegistry;
  readonly risk:          MicRiskRegistry;
  readonly reasoning:     MicReasoningRegistry;

  // ── INT-01B: Typed Intelligence Object registry ──────────────────────
  readonly intelligenceObjects: IntelligenceObjectRegistry;

  // ── Shared graph (the MKG) — written by process(), read by all ──────
  readonly mkg: MaritimeKnowledgeGraph;

  private readonly clock: () => string;

  constructor(opts: MicContainerOptions = {}) {
    this.clock = opts.clock ?? (() => new Date().toISOString());
    this.entities      = new MicEntityRegistry();
    this.relationships = new MicRelationshipRegistry();
    this.evidence      = new MicEvidenceRegistry();
    this.confidence    = new MicConfidenceRegistry();
    this.timeline      = new MicTimelineRegistry();
    this.graph         = new MicGraphRegistry();
    this.risk          = new MicRiskRegistry();
    this.reasoning     = new MicReasoningRegistry();
    this.mkg                 = new MaritimeKnowledgeGraph();
    this.intelligenceObjects = new IntelligenceObjectRegistry();
  }

  // ─────────────────────────────────────────────────────────────────────
  //  MAIN ENTRY POINT
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Process a UnifiedIntelligencePackage through the full MIC pipeline:
   *   1. Ingest into the MKG.
   *   2. Register all entities from the graph.
   *   3. Register all relationships from the graph.
   *   4. Register all evidence records.
   *   5. Compute and register confidence for every entity.
   *   6. Extract and register timeline events.
   *   7. Compute and register risk profiles.
   *   8. Snapshot the graph and record in the graph registry.
   *
   * Returns a MicProcessResult carrying all produced entries. The caller
   * (the OIE server function or the UIP store) can attach this to the UIP
   * before delivery to the Canonical UIP consumers.
   *
   * Deterministic: same UIP → same result. Idempotent: re-processing the
   * same UIP strengthens corroboration but never duplicates entries.
   */
  process(uip: UnifiedIntelligencePackage): MicProcessResult {
    const t0 = Date.now();

    // ── Step 1: Ingest UIP into the MKG ────────────────────────────────
    ingestUnifiedPackage(this.mkg, uip, { evidence: uip.rawEvidence });
    const snapshot = this.mkg.toSnapshot();

    // Compute alias node ids once — shared by registerEntities and buildIntelligenceObjects.
    // A node is an alias-only node if it is the fromId of an ALIAS_OF edge.
    const aliasNodeIds = new Set(
      snapshot.edges.filter((e) => e.type === "ALIAS_OF").map((e) => e.fromId),
    );

    // ── Step 2: Register entities ────────────────────────────────────────
    const entityEntries = this.registerEntities(uip, snapshot.nodes, aliasNodeIds);

    // ── Step 3: Register relationships ──────────────────────────────────
    const relEntries = this.registerRelationships(snapshot.edges, uip.id);

    // ── Step 4: Register evidence ────────────────────────────────────────
    const evEntries = this.registerEvidence(uip);

    // ── Step 5: Compute confidence ───────────────────────────────────────
    const confEntries = this.computeConfidence(snapshot.nodes, uip);

    // ── Step 6: Extract timeline events ─────────────────────────────────
    const timelineEvents = this.extractTimeline(uip);

    // ── Step 7: Compute risk profiles ───────────────────────────────────
    const riskEntries = this.computeRisk(snapshot.nodes, uip);

    // ── Step 8: Graph registry entry ────────────────────────────────────
    const primaryEntityId = this.inferPrimaryEntityId(uip);
    this.graph.register({
      uipId: uip.id,
      nodes: snapshot.nodes.length,
      edges: snapshot.edges.length,
      primaryEntityId,
    });

    // ── Step 9: Build typed Intelligence Objects (INT-01B) ───────────────
    buildIntelligenceObjects(uip, snapshot.nodes, aliasNodeIds, this.intelligenceObjects);

    return {
      uip,
      graphSnapshot: snapshot,
      entities:      entityEntries,
      relationships: relEntries,
      evidence:      evEntries,
      confidence:    confEntries,
      timeline:      timelineEvents,
      risk:          riskEntries,
      stats: {
        entitiesRegistered:      entityEntries.length,
        relationshipsRegistered: relEntries.length,
        evidenceRegistered:      evEntries.length,
        timelineEvents:          timelineEvents.length,
        riskProfilesComputed:    riskEntries.length,
        processingMs:            Date.now() - t0,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  STEP IMPLEMENTATIONS
  // ─────────────────────────────────────────────────────────────────────

  private registerEntities(
    uip: UnifiedIntelligencePackage,
    nodes: ReadonlyArray<MkgNode>,
    aliasNodeIds: Set<string>,
  ) {
    const evByEntity = groupByEntity(uip.rawEvidence);
    return nodes
      .filter((n) => !aliasNodeIds.has(n.id))
      .filter((n) => n.kind !== "sanction" && n.kind !== "manifest" && n.kind !== "incident" && n.kind !== "inspection")
      .map((node) => {
        const nodeEvidence = evByEntity.get(node.id) ?? [];
        const citations: MicCitation[] = nodeEvidence.map(citationFromEvidence);
        const grade = bestGrade(nodeEvidence.map((e) => e.grade));
        const score = micScoreFromGrade(grade);

        return this.entities.register({
          kind:         node.kind,
          canonicalId:  node.id,
          label:        node.label,
          aliases:      node.aliases.slice(),
          confidence:   micTierFromScore(score),
          grade,
          citations,
          sourceUipIds: [uip.id],
        });
      });
  }

  private registerRelationships(
    edges: ReadonlyArray<MkgEdge>,
    uipId: string,
  ) {
    return edges
      .filter((e) => e.type !== "ALIAS_OF")   // ALIAS_OF is identity bookkeeping, not intelligence
      .map((edge) => {
        const citations: MicCitation[] = edge.provenance.map((p) => ({
          evidenceId:  p.evidenceId,
          connectorId: p.connectorId,
          sourceName:  p.sourceName,
          grade:       p.grade,
          observedAt:  p.observedAt,
          excerpt:     `${edge.type} relationship (${p.sourceName})`,
        }));

        return this.relationships.register({
          edgeId:         edge.id,
          type:           edge.type,
          fromEntityId:   edge.fromId,
          toEntityId:     edge.toId,
          confidence:     micTierFromScore(edge.weight),
          grade:          edge.grade,
          citations,
          explanation:    edge.explanation,
        });
      });
  }

  private registerEvidence(uip: UnifiedIntelligencePackage) {
    return uip.rawEvidence.map((ev) =>
      this.evidence.register({
        evidenceId:   ev.id,
        connectorId:  ev.source,
        sourceName:   ev.sourceName,
        grade:        ev.grade,
        kind:         ev.kind,
        entityId:     ev.entity.id,
        observedAt:   ev.observedAt,
        uipId:        uip.id,
      }),
    );
  }

  private computeConfidence(
    nodes: ReadonlyArray<MkgNode>,
    uip: UnifiedIntelligencePackage,
  ) {
    const evByEntity = groupByEntity(uip.rawEvidence);
    return nodes
      .filter((n) => !["sanction", "manifest", "incident", "inspection"].includes(n.kind))
      .map((node) => {
        const nodeEv = evByEntity.get(node.id) ?? [];
        const grade = bestGrade(nodeEv.map((e) => e.grade));
        const authorityScore = micScoreFromGrade(grade);

        // Freshness: 0..1 — evidence within 24h scores 1.0, degrades to 0.3 at 30d
        const freshestAgeHours = nodeEv.length > 0
          ? Math.min(...nodeEv.map((e) => hoursAgo(e.observedAt)))
          : 9999;
        const freshnessScore = Math.max(0.3, 1 - (freshestAgeHours / (30 * 24)));

        // Cross-source agreement: unique connectors / 3 (capped at 1)
        const connectors = new Set(nodeEv.map((e) => e.source));
        const agreementScore = Math.min(1, connectors.size / 3);

        // Identity certainty from cluster
        const cluster = uip.identity.find((c) => c.canonicalId === node.id);
        const identityScore = cluster ? micScoreFromGrade(cluster.confidence.tier === "VERIFIED" ? "VERIFIED" : cluster.confidence.tier === "OBSERVED" ? "OBSERVED" : "REPORTED") : 0.5;

        // Composite (weighted average)
        const score = (
          authorityScore  * 0.35 +
          freshnessScore  * 0.25 +
          agreementScore  * 0.25 +
          identityScore   * 0.15
        );

        return this.confidence.register({
          subjectId:   node.id,
          subjectKind: "entity",
          score,
          tier:        micTierFromScore(score),
          components: [
            { factor: "Provider authority",     contribution: authorityScore * 0.35,  explanation: `Best grade: ${grade}` },
            { factor: "Evidence freshness",     contribution: freshnessScore * 0.25,  explanation: `Freshest evidence: ${Math.round(freshestAgeHours)}h ago` },
            { factor: "Cross-source agreement", contribution: agreementScore * 0.25,  explanation: `${connectors.size} connector(s) cited` },
            { factor: "Identity certainty",     contribution: identityScore  * 0.15,  explanation: cluster ? `Cluster confidence: ${cluster.confidence.tier}` : "No cluster" },
          ],
        });
      });
  }

  private extractTimeline(uip: UnifiedIntelligencePackage): MicTimelineEvent[] {
    const events: MicTimelineEvent[] = [];
    for (const ev of uip.rawEvidence) {
      const kind = timelineKindFromEvidence(ev);
      if (!kind) continue;
      const citation = citationFromEvidence(ev);
      const significance = significanceFromGrade(ev.grade);
      events.push(
        this.timeline.register({
          kind,
          label:            timelineLabelFromEvidence(ev),
          description:      ev.excerpt ?? `${ev.kind} event (${ev.sourceName})`,
          entityId:         ev.entity.id,
          relatedEntityIds: relatedEntityIdsFromEvidence(ev),
          occurredAt:       ev.observedAt,
          citations:        [citation],
          grade:            ev.grade,
          significance,
        }),
      );
    }
    return events;
  }

  private computeRisk(
    nodes: ReadonlyArray<MkgNode>,
    uip: UnifiedIntelligencePackage,
  ): MicRiskRegistryEntry[] {
    const evByEntity = groupByEntity(uip.rawEvidence);
    return nodes
      .filter((n) => n.kind === "vessel" || n.kind === "company" || n.kind === "person")
      .map((node) => {
        const nodeEv = evByEntity.get(node.id) ?? [];
        const indicators = computeRiskIndicators(node, nodeEv, this.mkg);
        const totalPoints = indicators.reduce((s, i) => s + i.points, 0);
        const maxPoints = indicators.reduce((s, i) => s + i.weight * 100, 0);
        const score = maxPoints > 0 ? Math.min(100, (totalPoints / maxPoints) * 100) : 0;
        const grade = bestGrade(nodeEv.map((e) => e.grade));
        const tier = micTierFromScore(micScoreFromGrade(grade));
        const band = micBandFromScore(score);
        const narrative = buildRiskNarrative(node, indicators, band, tier);

        return this.risk.register({
          entityId:    node.id,
          entityLabel: node.label,
          entityKind:  node.kind,
          score,
          band,
          confidence:  tier,
          indicators,
          narrative,
          computedAt:  this.clock(),
        });
      });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  HELPERS
  // ─────────────────────────────────────────────────────────────────────

  private inferPrimaryEntityId(uip: UnifiedIntelligencePackage): string | null {
    // Primary = the entity with the most evidence records
    const counts = new Map<string, number>();
    for (const ev of uip.rawEvidence) {
      counts.set(ev.entity.id, (counts.get(ev.entity.id) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [id, count] of counts) {
      if (count > bestCount) { best = id; bestCount = count; }
    }
    return best;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  QUERY API  (downstream consumers call these)
  // ─────────────────────────────────────────────────────────────────────

  /** Resolve any id (canonical or alias) to a registered entity. */
  resolveEntity(id: string) {
    const canonical = this.entities.resolveAlias(id) ?? id;
    return this.entities.get(canonical);
  }

  /** Everything the Copilot needs to answer a question about an entity. */
  buildReasoningContext(entityId: string, uipId: string, sessionId: string) {
    const canonical = this.entities.resolveAlias(entityId) ?? entityId;
    const entity = this.entities.get(canonical);
    const relationships = this.relationships.getForEntity(canonical);
    const evidenceEntries = this.evidence.getForEntity(canonical);
    const conf = this.confidence.getForSubject("entity", canonical);
    const risk = this.risk.getForEntity(canonical);
    const timelineEvents = this.timeline.getForEntity(canonical);

    return {
      entity,
      relationships,
      evidenceCount: evidenceEntries.length,
      confidence: conf,
      risk,
      timeline: timelineEvents,
      registryId: this.reasoning.register({
        sessionId,
        query: `entity:${canonical}`,
        primaryEntityId: canonical,
        statements: [],    // populated by Copilot layer (INT-01I)
        confidence: conf?.tier ?? "LOW",
        grade: entity?.grade ?? "UNKNOWN",
        uipId,
      }),
    };
  }

  /** Stats snapshot for the admin / health dashboard. */
  stats() {
    const snap = this.mkg.toSnapshot();
    const ioStats = this.intelligenceObjects.stats();
    return {
      entities:           this.entities.size,
      relationships:      this.relationships.size,
      evidence:           this.evidence.size,
      confidence:         this.confidence.size,
      timelineEvents:     this.timeline.size,
      graphs:             this.graph.size,
      riskProfiles:       this.risk.size,
      reasoningLogs:      this.reasoning.size,
      mkgNodes:           snap.nodes.length,
      mkgEdges:           snap.edges.length,
      intelligenceObjects:this.intelligenceObjects.size,
      intelligenceObjectsByKind: ioStats,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
//  PRIVATE PURE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────

function groupByEntity(records: ReadonlyArray<NormalizedEvidence>): Map<string, NormalizedEvidence[]> {
  const m = new Map<string, NormalizedEvidence[]>();
  for (const r of records) {
    const list = m.get(r.entity.id) ?? [];
    list.push(r);
    m.set(r.entity.id, list);
  }
  return m;
}

const GRADE_RANK: Record<EvidenceGrade, number> = {
  VERIFIED: 5, CORROBORATED: 4, OBSERVED: 3, REPORTED: 2, INFERRED: 1, UNKNOWN: 0,
};
const GRADE_BY_RANK: EvidenceGrade[] = ["UNKNOWN","INFERRED","REPORTED","OBSERVED","CORROBORATED","VERIFIED"];

function bestGrade(grades: ReadonlyArray<EvidenceGrade>): EvidenceGrade {
  if (!grades.length) return "UNKNOWN";
  return GRADE_BY_RANK[Math.max(...grades.map((g) => GRADE_RANK[g] ?? 0))];
}

function hoursAgo(iso: string): number {
  const ms = Date.now() - Date.parse(iso);
  return ms > 0 ? ms / 3_600_000 : 0;
}

function significanceFromGrade(grade: EvidenceGrade): MicTimelineEvent["significance"] {
  if (grade === "VERIFIED" || grade === "CORROBORATED") return "high";
  if (grade === "OBSERVED") return "medium";
  return "low";
}

function timelineKindFromEvidence(ev: NormalizedEvidence): MicTimelineEvent["kind"] | null {
  const kind = ev.kind;
  if (kind === "position")    return "port-visit";
  if (kind === "port-call")   return "port-visit";
  if (kind === "voyage")      return "voyage-start";
  if (kind === "sanctions")   return ev.fields.status === "delisted" ? "sanctions-removal" : "sanctions-listing";
  if (kind === "inspection")  return ev.fields.result === "fail" ? "inspection-fail" : "inspection";
  if (kind === "incident")    return "incident";
  if (kind === "other" && String(ev.fields.platform ?? "").toUpperCase().startsWith("SENTINEL")) return "satellite-observation";
  if (kind === "identity" && ev.fields.flag)       return "flag-change";
  if (kind === "identity" && ev.fields.owner)      return "ownership-change";
  return null;
}

function timelineLabelFromEvidence(ev: NormalizedEvidence): string {
  const k = ev.kind;
  if (k === "position" || k === "port-call") {
    const port = ev.fields.portName ?? ev.fields.port ?? "Unknown port";
    return `Port visit — ${port}`;
  }
  if (k === "sanctions") {
    const name = ev.fields.entityName ?? ev.entity.label ?? "";
    return ev.fields.status === "delisted"
      ? `Sanctions removed — ${name}`
      : `Sanctions listing — ${name}`;
  }
  if (k === "inspection") return `Inspection — ${ev.fields.result === "fail" ? "FAILED" : "passed"}`;
  if (k === "other" && String(ev.fields.platform ?? "").toUpperCase().startsWith("SENTINEL")) {
    return `Satellite observation — ${ev.fields.platform ?? "Copernicus"}`;
  }
  if (k === "identity" && ev.fields.flag) return `Flag: ${ev.fields.flag}`;
  if (k === "identity" && ev.fields.owner) return `Owner: ${ev.fields.owner}`;
  return `${ev.kind} (${ev.sourceName})`;
}

function relatedEntityIdsFromEvidence(ev: NormalizedEvidence): string[] {
  const ids: string[] = [];
  if (ev.fields.ownerId && typeof ev.fields.ownerId === "string") ids.push(ev.fields.ownerId);
  if (ev.fields.portId  && typeof ev.fields.portId  === "string") ids.push(ev.fields.portId);
  return ids;
}

function computeRiskIndicators(
  node: MkgNode,
  evidence: ReadonlyArray<NormalizedEvidence>,
  mkg: MaritimeKnowledgeGraph,
): import("./types").MicRiskIndicator[] {
  const indicators: import("./types").MicRiskIndicator[] = [];

  // Sanctions hit — direct
  const sanctionsHits = evidence.filter((e) => e.kind === "sanctions" && e.fields.status !== "delisted");
  if (sanctionsHits.length > 0) {
    indicators.push({
      kind:        "sanctions-hit",
      label:       "Active Sanctions Listing",
      score:       1.0,
      weight:      0.30,
      points:      30,
      rationale:   `${sanctionsHits.length} active sanctions listing(s) detected`,
      citations:   sanctionsHits.map(citationFromEvidence),
      nodeIds:     [node.id],
      confidence:  micTierFromScore(micScoreFromGrade(bestGrade(sanctionsHits.map((e) => e.grade)))),
    });
  }

  // AIS dark activity
  const aisGaps = evidence.filter((e) => e.kind === "position" && Number(e.fields.gapHours ?? 0) > 12);
  if (aisGaps.length > 0) {
    const maxGap = Math.max(...aisGaps.map((e) => Number(e.fields.gapHours ?? 0)));
    const score = Math.min(1, maxGap / 72);
    indicators.push({
      kind:        "ais-dark-activity",
      label:       "AIS Dark Activity",
      score,
      weight:      0.20,
      points:      Math.round(score * 20),
      rationale:   `AIS gap of ${maxGap.toFixed(0)}h detected across ${aisGaps.length} event(s)`,
      citations:   aisGaps.map(citationFromEvidence),
      nodeIds:     [node.id],
      confidence:  micTierFromScore(score),
    });
  }

  // Inspection failures
  const failedInspections = evidence.filter((e) => e.kind === "inspection" && e.fields.result === "fail");
  if (failedInspections.length > 0) {
    const score = Math.min(1, failedInspections.length / 3);
    indicators.push({
      kind:        "repeated-inspection-fail",
      label:       "Repeated Inspection Failures",
      score,
      weight:      0.15,
      points:      Math.round(score * 15),
      rationale:   `${failedInspections.length} failed inspection(s)`,
      citations:   failedInspections.map(citationFromEvidence),
      nodeIds:     [node.id],
      confidence:  "MEDIUM",
    });
  }

  // Satellite anomaly (Copernicus evidence in area with AIS dark)
  const satObs = evidence.filter((e) => e.kind === "other" && String(e.fields.platform ?? "").toUpperCase().startsWith("SENTINEL"));
  if (satObs.length > 0 && aisGaps.length > 0) {
    indicators.push({
      kind:        "satellite-anomaly",
      label:       "Satellite Observation During AIS Gap",
      score:       0.7,
      weight:      0.15,
      points:      11,
      rationale:   `${satObs.length} satellite observation(s) correlated with AIS gap period`,
      citations:   satObs.map(citationFromEvidence),
      nodeIds:     [node.id],
      confidence:  "HIGH",
    });
  }

  // Graph connectivity — shared directors / related sanctioned entities
  const neighbours = mkg.neighbors(node.id);
  const sanctionedNeighbours = neighbours.filter((n) => n.neighbor.kind === "sanction");
  if (sanctionedNeighbours.length > 0) {
    const score = Math.min(1, sanctionedNeighbours.length / 3);
    indicators.push({
      kind:        "sanctions-proximity",
      label:       "Sanctions Proximity via Graph",
      score,
      weight:      0.20,
      points:      Math.round(score * 20),
      rationale:   `${sanctionedNeighbours.length} sanctions-linked entity/entities in the intelligence graph`,
      citations:   [],
      nodeIds:     [node.id, ...sanctionedNeighbours.map((n) => n.neighbor.id)],
      confidence:  "MEDIUM",
    });
  }

  return indicators;
}

function buildRiskNarrative(
  node: MkgNode,
  indicators: import("./types").MicRiskIndicator[],
  band: import("./types").MicRiskBand,
  confidence: MicConfidenceTier,
): string {
  if (indicators.length === 0) {
    return `${node.label} — no risk indicators detected from available evidence. Risk: LOW (${confidence} confidence).`;
  }
  const topLines = indicators
    .filter((i) => i.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((i) => i.rationale);
  const bandLabel = band === "critical" ? "CRITICAL" : band === "high" ? "HIGH" : band === "elevated" ? "ELEVATED" : "LOW";
  return `${node.label} — operational risk: ${bandLabel} (${confidence} confidence). ${topLines.join("; ")}.`;
}

// ─────────────────────────────────────────────────────────────────────
//  PROCESS-WIDE SINGLETON
// ─────────────────────────────────────────────────────────────────────

/**
 * The single MicContainer instance used in production.
 * Tests always construct a fresh MicContainer to avoid state leakage.
 */
export const mic = new MicContainer();
