/**
 * INT-01B — Intelligence Object Builder
 *
 * Constructs typed IntelligenceObjects from MKG nodes + evidence records.
 * Called by the MicContainer as an additional processing step after the
 * existing entity registration (which populates MicEntityRegistry base layer).
 *
 * Every object produced here is also backed by the base MicEntityRegistry
 * entry — the builder adds the typed attribute layer, never replaces the base.
 */
import type { NormalizedEvidence } from "@/services/ial/types";
import type { MkgNode } from "@/services/mkg/types";
import type { UnifiedIntelligencePackage } from "@/services/ife/unified";
import type { MicCitation } from "../types";
import { citationFromEvidence, micScoreFromGrade, micTierFromScore } from "../types";
import type { IntelligenceObject, IntelligenceObjectKind } from "./types";
import { extractAttributes } from "./extractors";
import type { IntelligenceObjectRegistry } from "./registry";

/** Map MkgNodeKind → IntelligenceObjectKind. */
function toObjectKind(mkgKind: MkgNode["kind"]): IntelligenceObjectKind | null {
  const map: Partial<Record<MkgNode["kind"], IntelligenceObjectKind>> = {
    vessel: "vessel",
    company: "company",
    person: "person",
    port: "port",
    cargo: "cargo",
    voyage: "voyage",
    manifest: "manifest",
    sanction: "sanction",
    inspection: "inspection",
    incident: "incident",
  };
  return map[mkgKind] ?? null;
}

/** Infer the object kind from evidence kind when not available from MKG. */
function inferObjectKindFromEvidence(ev: NormalizedEvidence): IntelligenceObjectKind | null {
  switch (ev.kind) {
    case "weather":
      return "weather-event";
    case "other":
      return "satellite-observation";
    case "compliance":
      return "document";
    default:
      return null;
  }
}

/**
 * Build Intelligence Objects from all nodes in the UIP and register them.
 * Returns the count of objects registered.
 */
export function buildIntelligenceObjects(
  uip: UnifiedIntelligencePackage,
  nodes: ReadonlyArray<MkgNode>,
  aliasNodeIds: Set<string>,
  registry: IntelligenceObjectRegistry,
): number {
  const evidenceByEntity = groupByEntity(uip.rawEvidence);
  let count = 0;

  // 1. Build from canonical MKG nodes
  for (const node of nodes) {
    if (aliasNodeIds.has(node.id)) continue; // skip alias-only nodes

    const objectKind = toObjectKind(node.kind);
    if (!objectKind) continue;

    const nodeEvidence = evidenceByEntity.get(node.id) ?? [];
    const citations: MicCitation[] = nodeEvidence.map(citationFromEvidence);
    const grade = bestGrade(nodeEvidence.map((e) => e.grade));
    const score = micScoreFromGrade(grade);

    // Merge attributes from all evidence records for this entity
    const mergedAttributes: Record<string, unknown> = {};
    for (const ev of nodeEvidence) {
      const partial = extractAttributes(ev, objectKind);
      if (partial) {
        for (const [key, val] of Object.entries(partial)) {
          if (val !== null && val !== undefined && mergedAttributes[key] == null) {
            mergedAttributes[key] = val;
          }
        }
      }
    }

    const firstSeen =
      nodeEvidence.length > 0 ? nodeEvidence.map((e) => e.observedAt).sort()[0] : null;
    const lastSeen =
      nodeEvidence.length > 0
        ? nodeEvidence
            .map((e) => e.observedAt)
            .sort()
            .reverse()[0]
        : null;

    const obj = {
      objectId: node.id,
      objectKind,
      label: node.label,
      aliases: node.aliases.slice(),
      confidence: micTierFromScore(score),
      grade,
      citations,
      sourceUipIds: [uip.id],
      firstSeenAt: firstSeen,
      lastSeenAt: lastSeen,
      revision: 1,
      attributes: mergedAttributes,
    } as unknown as IntelligenceObject;

    registry.upsert(obj);
    count++;
  }

  // 2. Build from evidence records that don't map to an MKG node kind
  //    (satellite observations, weather events, documents)
  for (const ev of uip.rawEvidence) {
    // Skip if already captured via MKG node
    if (
      evidenceByEntity.get(ev.entity.id)?.length &&
      toObjectKind(ev.entity.kind as MkgNode["kind"])
    )
      continue;

    const objectKind = inferObjectKindFromEvidence(ev);
    if (!objectKind) continue;

    const citation = citationFromEvidence(ev);
    const partial = extractAttributes(ev, objectKind) ?? {};
    const score = micScoreFromGrade(ev.grade);

    const obj = {
      objectId: `${objectKind}:${ev.id}`,
      objectKind,
      label: ev.excerpt ?? ev.id,
      aliases: [],
      confidence: micTierFromScore(score),
      grade: ev.grade,
      citations: [citation],
      sourceUipIds: [uip.id],
      firstSeenAt: ev.observedAt,
      lastSeenAt: ev.observedAt,
      revision: 1,
      attributes: partial,
    } as unknown as IntelligenceObject;

    registry.upsert(obj);
    count++;
  }

  return count;
}

// ─── helpers ─────────────────────────────────────────────────────────

function groupByEntity(
  records: ReadonlyArray<NormalizedEvidence>,
): Map<string, NormalizedEvidence[]> {
  const m = new Map<string, NormalizedEvidence[]>();
  for (const r of records) {
    const list = m.get(r.entity.id) ?? [];
    list.push(r);
    m.set(r.entity.id, list);
  }
  return m;
}

const GRADE_RANK: Record<string, number> = {
  VERIFIED: 5,
  CORROBORATED: 4,
  OBSERVED: 3,
  REPORTED: 2,
  INFERRED: 1,
  UNKNOWN: 0,
};
const GRADE_BY_RANK = ["UNKNOWN", "INFERRED", "REPORTED", "OBSERVED", "CORROBORATED", "VERIFIED"];

function bestGrade(
  grades: ReadonlyArray<string>,
): "VERIFIED" | "CORROBORATED" | "OBSERVED" | "REPORTED" | "INFERRED" | "UNKNOWN" {
  if (!grades.length) return "UNKNOWN";
  const best = Math.max(...grades.map((g) => GRADE_RANK[g] ?? 0));
  return GRADE_BY_RANK[best] as EvidenceGrade;
}
