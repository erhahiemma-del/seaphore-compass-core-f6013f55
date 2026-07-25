/**
 * IAL Runtime Bridge.
 *
 * Slice 3 boundary between the orchestration retrieval agents and the canonical
 * IAL / IFE pipeline. Every specialist agent already returns provenance-tagged
 * evidence; this module normalises that stream into the Seaphore-canonical
 * `NormalizedEvidence` contract so the Intelligence Fusion Engine (IFE) can
 * run identity resolution and canonical fusion against real runtime data.
 *
 * The bridge is intentionally the *only* runtime seam between the orchestration
 * scheduler and the IFE. Adding a first-class ConnectorManager driver later is
 * a matter of swapping this normaliser — nothing downstream changes because the
 * output shape is already `NormalizedEvidence[]` + `SourceAttribution[]`.
 */
import type {
  CanonicalEntityRef,
  ConnectorId,
  EvidenceGrade as IalEvidenceGrade,
  NormalizedEvidence,
  SourceAttribution,
} from "@/services/ial/types";
import type { EvidenceItem, RetrievalResult } from "./types";

const GRADE_ORDER: Record<IalEvidenceGrade, number> = {
  VERIFIED: 5,
  CORROBORATED: 4,
  OBSERVED: 3,
  REPORTED: 2,
  INFERRED: 1,
  UNKNOWN: 0,
};

function pickStrongestGrade(grades: ReadonlyArray<IalEvidenceGrade>): IalEvidenceGrade {
  return grades.reduce<IalEvidenceGrade>(
    (best, g) => (GRADE_ORDER[g] > GRADE_ORDER[best] ? g : best),
    "UNKNOWN",
  );
}

function inferEntityKind(entityId: string): CanonicalEntityRef["kind"] {
  if (entityId.startsWith("vessel")) return "vessel";
  if (entityId.startsWith("port")) return "port";
  if (entityId.startsWith("person")) return "person";
  if (entityId.startsWith("cargo")) return "cargo";
  if (entityId.startsWith("voyage")) return "voyage";
  return "company";
}

function normaliseItem(
  item: EvidenceItem,
  connectorId: ConnectorId,
  sourceName: string,
  retrievedAt: string,
): NormalizedEvidence {
  const entityId = item.entity_ids?.[0] ?? "unknown";
  const entity: CanonicalEntityRef = { kind: inferEntityKind(entityId), id: entityId };
  const observedAt = item.collected_at ?? retrievedAt;
  const freshness = Math.max(
    0,
    Math.floor((Date.now() - new Date(observedAt).getTime()) / 1000),
  );
  return {
    id: item.id,
    source: connectorId,
    sourceName,
    grade: item.grade as IalEvidenceGrade,
    entity,
    kind: "other",
    fields: { content: item.content, entity_ids: item.entity_ids ?? [] },
    observedAt,
    retrievedAt,
    freshnessSeconds: Number.isFinite(freshness) ? freshness : 0,
    hash: item.hash_sha256 ?? item.id,
    providerRecordId: item.id,
    excerpt: (item.content ?? "").slice(0, 240),
  };
}

export interface IalBridgeOutput {
  readonly records: NormalizedEvidence[];
  readonly sources: SourceAttribution[];
}

/**
 * Fan RetrievalResults into the IAL evidence contract. One
 * `SourceAttribution` per responding agent so the IFE can compute
 * per-connector agreement scores against real runtime provenance.
 */
export function bridgeToIal(results: ReadonlyArray<RetrievalResult>): IalBridgeOutput {
  const retrievedAt = new Date().toISOString();
  const records: NormalizedEvidence[] = [];
  const sources: SourceAttribution[] = [];

  for (const r of results) {
    // Each agent is treated as a distinct connector at the runtime boundary.
    // This keeps provenance intact even when multiple agents draw from the
    // same underlying store — the officer sees WHO retrieved WHAT.
    const connectorId: ConnectorId = r.agent as ConnectorId;
    const sourceName = r.source_name ?? r.agent;

    for (const item of r.evidence) {
      records.push(normaliseItem(item, connectorId, sourceName, retrievedAt));
    }

    if (r.responded) {
      sources.push({
        connectorId,
        sourceName,
        records: r.evidence.length,
        grade: pickStrongestGrade(
          r.evidence.map((e) => e.grade as IalEvidenceGrade),
        ),
        latencyMs: r.latency_ms,
      });
    }
  }

  return { records, sources };
}
