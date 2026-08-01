/**
 * INT-01B — Entity Intelligence Server Functions
 *
 * All data sourced from the live MicContainer — never from fixtures.
 * Auth-gated via requireSupabaseAuth.
 *
 * getEntityFn            — full entity profile by id
 * searchEntitiesFn       — search by kind and/or label fragment
 * getEntityRelationshipsFn — direct + indirect relationships from MKG
 * getEntityTimelineFn    — chronological events from MicTimelineRegistry
 * getEntityEvidenceFn    — evidence citations from MicEvidenceRegistry
 * getEntityResolutionLogFn — merge decisions from resolution engine
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mic } from "@/services/mic/container";
import type { IntelligenceObjectKind } from "@/services/mic/entities/types";

// ── getEntityFn ───────────────────────────────────────────────────────

export const getEntityFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { id } = data;

    // Resolve alias to canonical
    const canonicalId = mic.entities.resolveAlias(id) ?? id;
    const baseEntry = mic.entities.get(canonicalId);
    const ioEntry = mic.intelligenceObjects.get(canonicalId);
    const confidence = mic.confidence.getForSubject("entity", canonicalId);
    const risk = mic.risk.getForEntity(canonicalId);
    const timeline = mic.timeline.getForEntity(canonicalId);
    const evidence = mic.evidence.getForEntity(canonicalId);
    const relationships = mic.relationships.getForEntity(canonicalId);

    if (!baseEntry && !ioEntry) {
      return { found: false, id: canonicalId, timestamp: new Date().toISOString() };
    }

    return {
      found: true,
      id: canonicalId,
      entity: {
        canonicalId,
        label: baseEntry?.label ?? ioEntry?.label ?? canonicalId,
        kind: baseEntry?.kind ?? ioEntry?.objectKind ?? "unknown",
        aliases: baseEntry?.aliases ?? ioEntry?.aliases ?? [],
        confidence: confidence?.tier ?? "LOW",
        confidenceScore: confidence?.score ?? 0,
        confidenceComponents: confidence?.components ?? [],
        grade: baseEntry?.grade ?? "UNKNOWN",
        citations: baseEntry?.citations ?? [],
        sourceUipIds: baseEntry?.sourceUipIds ?? [],
        firstSeenAt: ioEntry?.firstSeenAt ?? null,
        lastSeenAt: ioEntry?.lastSeenAt ?? null,
        revision: baseEntry?.revision ?? ioEntry?.revision ?? 1,
        // Typed attributes from Intelligence Object layer
        attributes: ioEntry ? (ioEntry.attributes as unknown as Record<string, unknown>) : {},
      },
      risk: risk
        ? {
            score: risk.score,
            band: risk.band,
            confidence: risk.confidence,
            indicators: risk.indicators.map((i) => ({
              kind: i.kind,
              label: i.label,
              points: i.points,
              rationale: i.rationale,
              confidence: i.confidence,
            })),
            narrative: risk.narrative,
            computedAt: risk.computedAt,
          }
        : null,
      timeline: timeline.map((e) => ({
        id: e.id,
        kind: e.kind,
        label: e.label,
        description: e.description,
        occurredAt: e.occurredAt,
        significance: e.significance,
        grade: e.grade,
        relatedEntityIds: e.relatedEntityIds,
        citationCount: e.citations.length,
      })),
      relationships: relationships.map((r) => ({
        edgeId: r.edgeId,
        type: r.type,
        fromEntityId: r.fromEntityId,
        toEntityId: r.toEntityId,
        confidence: r.confidence,
        grade: r.grade,
        explanation: r.explanation,
        citationCount: r.citations.length,
      })),
      evidenceSummary: {
        total: evidence.length,
        byConnector: groupCount(evidence, (e) => e.connectorId),
        byGrade: groupCount(evidence, (e) => e.grade),
        byKind: groupCount(evidence, (e) => e.kind),
        records: evidence.slice(0, 50).map((e) => ({
          evidenceId: e.evidenceId,
          connectorId: e.connectorId,
          sourceName: e.sourceName,
          grade: e.grade,
          kind: e.kind,
          observedAt: e.observedAt,
        })),
      },
      timestamp: new Date().toISOString(),
    };
  });

// ── searchEntitiesFn ──────────────────────────────────────────────────

export const searchEntitiesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ kind: z.string().optional(), query: z.string().optional(), limit: z.number().optional() })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const { kind, query, limit = 50 } = data;

    const allEntities = kind
      ? mic.intelligenceObjects.getByKind(kind as IntelligenceObjectKind)
      : mic.intelligenceObjects.getAll();

    const lowerQuery = query?.toLowerCase().trim();
    const filtered = lowerQuery
      ? allEntities.filter(
          (e) =>
            e.label?.toLowerCase().includes(lowerQuery) ||
            e.aliases?.some((a) => a.toLowerCase().includes(lowerQuery)) ||
            e.objectId.toLowerCase().includes(lowerQuery),
        )
      : allEntities;

    return {
      results: filtered.slice(0, limit).map((e) => ({
        id: e.objectId,
        label: e.label,
        kind: e.objectKind,
        confidence: e.confidence,
        grade: e.grade,
        aliases: e.aliases,
        firstSeenAt: e.firstSeenAt,
        lastSeenAt: e.lastSeenAt,
      })),
      total: filtered.length,
      query: query ?? null,
      kind: kind ?? null,
      timestamp: new Date().toISOString(),
    };
  });

// ── getEntityRelationshipsFn ──────────────────────────────────────────

export const getEntityRelationshipsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ id: z.string(), depth: z.number().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const { id, depth = 2 } = data;
    const canonicalId = mic.entities.resolveAlias(id) ?? id;

    // BFS up to `depth` hops through the MKG
    const paths = mic.mkg.traverse(canonicalId, { maxHops: depth, maxResults: 200 });
    const nodeIds = new Set<string>([canonicalId]);
    const edgeIds = new Set<string>();

    for (const path of paths) {
      for (const step of path.steps) {
        nodeIds.add(step.toId);
        edgeIds.add(step.edge.id);
      }
    }

    const snapshot = mic.mkg.toSnapshot();
    const nodes = snapshot.nodes
      .filter((n) => nodeIds.has(n.id))
      .map((n) => ({
        id: n.id,
        kind: n.kind,
        label: n.label,
        grade: n.grade,
        aliases: n.aliases,
      }));
    const edges = snapshot.edges
      .filter((e) => edgeIds.has(e.id) && e.type !== "ALIAS_OF")
      .map((e) => ({
        id: e.id,
        type: e.type,
        fromId: e.fromId,
        toId: e.toId,
        grade: e.grade,
        weight: e.weight,
        explanation: e.explanation,
      }));

    return { nodes, edges, rootId: canonicalId, depth, timestamp: new Date().toISOString() };
  });

// ── getEntityTimelineFn ───────────────────────────────────────────────

export const getEntityTimelineFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const canonicalId = mic.entities.resolveAlias(data.id) ?? data.id;
    const events = mic.timeline.getForEntity(canonicalId);
    return {
      entityId: canonicalId,
      events: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        label: e.label,
        description: e.description,
        occurredAt: e.occurredAt,
        significance: e.significance,
        grade: e.grade,
        relatedEntityIds: e.relatedEntityIds,
        citations: e.citations.map((c) => ({
          evidenceId: c.evidenceId,
          sourceName: c.sourceName,
          grade: c.grade,
          observedAt: c.observedAt,
        })),
      })),
      total: events.length,
      firstEvent: events.length > 0 ? events[0].occurredAt : null,
      lastEvent: events.length > 0 ? events[events.length - 1].occurredAt : null,
      timestamp: new Date().toISOString(),
    };
  });

// ── getEntityResolutionLogFn ──────────────────────────────────────────

export const getEntityResolutionLogFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const log = mic.resolutionLog;
    const totalMerges = log.reduce((s, r) => s + r.mergesPerformed, 0);
    const allDecisions = log.flatMap((r) => r.decisions);

    return {
      totalRuns: log.length,
      totalMerges,
      decisions: allDecisions.slice(0, 100).map((d) => ({
        canonicalId: d.canonicalId,
        mergedId: d.mergedId,
        method: d.method,
        confidence: d.confidence,
        explanation: d.explanation,
        decidedAt: d.decidedAt,
        signalCount: d.signals.length,
      })),
      byMethod: groupCount(allDecisions, (d) => d.method),
      timestamp: new Date().toISOString(),
    };
  });

// ── helpers ───────────────────────────────────────────────────────────

function groupCount<T>(arr: readonly T[], key: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of arr) {
    const k = key(item);
    result[k] = (result[k] ?? 0) + 1;
  }
  return result;
}
