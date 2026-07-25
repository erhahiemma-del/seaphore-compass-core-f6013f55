/**
 * Relationship extraction over IntelligenceEvidenceItem[].
 *
 * Builds an entity → evidence graph for the Relationship Graph view. Every
 * relationship node has a stable id, every edge has an evidence citation, and
 * every edge is projectable to the officer (no raw payloads).
 *
 * Golden Rule: every relationship navigable, every edge traceable.
 */
import type {
  EvidenceEntityRef,
  EvidenceEntityType,
  IntelligenceEvidenceItem,
} from "@/lib/evidence/intelligence-evidence";

export interface EntityNode {
  id: string;
  name: string;
  type: EvidenceEntityType;
  evidenceCount: number;
  connectors: string[];
  latestAt: string;
}

export interface EntityEdge {
  a: string;
  b: string;
  /** Every edge is anchored on the evidence items that co-mention the pair. */
  evidenceIds: string[];
  /** Descriptor derived from the source labels (officer-facing). */
  label: string;
}

export interface RelationshipGraph {
  nodes: EntityNode[];
  edges: EntityEdge[];
  /** Map entity id → the evidence ids that reference it. */
  entityToEvidence: Map<string, string[]>;
}

function entityKey(e: EvidenceEntityRef): string {
  return `${e.type}:${(e.id ?? e.name).toLowerCase()}`;
}

/** Extract entity refs from an evidence item, preferring `entities` then `subject`. */
export function extractEntities(item: IntelligenceEvidenceItem): EvidenceEntityRef[] {
  if (item.entities && item.entities.length > 0) return item.entities;
  if (item.subject) return [{ type: "vessel", name: item.subject }];
  return [];
}

export function buildRelationshipGraph(items: IntelligenceEvidenceItem[]): RelationshipGraph {
  const nodes = new Map<string, EntityNode>();
  const entityToEvidence = new Map<string, string[]>();
  const edgeMap = new Map<string, EntityEdge>();

  for (const it of items) {
    const refs = extractEntities(it);
    const keys: string[] = [];
    for (const ref of refs) {
      const key = entityKey(ref);
      keys.push(key);
      const existing = nodes.get(key);
      if (existing) {
        existing.evidenceCount += 1;
        if (it.connector && !existing.connectors.includes(it.connector)) {
          existing.connectors.push(it.connector);
        }
        if (Date.parse(it.timestamp) > Date.parse(existing.latestAt)) {
          existing.latestAt = it.timestamp;
        }
      } else {
        nodes.set(key, {
          id: key,
          name: ref.name,
          type: ref.type,
          evidenceCount: 1,
          connectors: it.connector ? [it.connector] : [],
          latestAt: it.timestamp,
        });
      }
      const arr = entityToEvidence.get(key) ?? [];
      arr.push(it.id);
      entityToEvidence.set(key, arr);
    }
    // Co-mention edges: pairs of entities referenced by the same evidence.
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        const [a, b] = keys[i] < keys[j] ? [keys[i], keys[j]] : [keys[j], keys[i]];
        const edgeId = `${a}|${b}`;
        const existing = edgeMap.get(edgeId);
        if (existing) {
          existing.evidenceIds.push(it.id);
        } else {
          edgeMap.set(edgeId, {
            a,
            b,
            evidenceIds: [it.id],
            label: it.source,
          });
        }
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()).sort((x, y) => y.evidenceCount - x.evidenceCount),
    edges: Array.from(edgeMap.values()),
    entityToEvidence,
  };
}
