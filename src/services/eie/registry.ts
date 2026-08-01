/**
 * EIE · Entity Registry.
 *
 * The single in-memory registry of every entity the platform has evidence
 * for, with resolved identities, derived relationships and timelines.
 *
 * Deterministic by construction: the registry keeps the evidence it was
 * fed and rebuilds its projection on every ingest, so identical evidence
 * always yields identical entities, aliases, relationships and clusters.
 */
import type { ConnectorId, NormalizedEvidence } from "@/services/ial/types";
import { deriveEntityType, resolveDuplicates, type ResolutionResult } from "./resolution";
import { deriveRelationships } from "./relationships";
import { buildTimeline } from "./timeline";
import {
  gradeToTier,
  strongestGrade,
  type EieEntity,
  type EieEntityType,
  type EieEvidenceRef,
  type EieIngestReport,
  type EieRelationship,
  type EieResolutionCluster,
} from "./types";

export interface EntitySearchOptions {
  readonly types?: ReadonlyArray<EieEntityType>;
  readonly limit?: number;
}

export class EntityRegistry {
  private records: NormalizedEvidence[] = [];
  private entityMap = new Map<string, EieEntity>();
  private relationshipMap = new Map<string, EieRelationship>();
  private resolution: ResolutionResult = {
    canonicalOf: new Map(),
    clusters: [],
    duplicatesResolved: 0,
  };

  /** Ingest normalised evidence. Duplicate evidence ids are ignored. */
  ingest(evidence: ReadonlyArray<NormalizedEvidence>): EieIngestReport {
    const seen = new Set(this.records.map((r) => r.id));
    for (const r of evidence) {
      if (!r?.id || seen.has(r.id)) continue;
      seen.add(r.id);
      this.records.push(r);
    }
    this.rebuild();
    return {
      evidenceRecords: this.records.length,
      entities: this.entityMap.size,
      relationships: this.relationshipMap.size,
      duplicatesResolved: this.resolution.duplicatesResolved,
      clusters: this.resolution.clusters,
    };
  }

  // ───────────────────────────── projection ──────────────────────────

  private rebuild(): void {
    this.entityMap.clear();
    this.relationshipMap.clear();
    this.resolution = resolveDuplicates(this.records);
    const canonical = (id: string): string => this.resolution.canonicalOf.get(id) ?? id;

    // 1. Group evidence per canonical entity.
    const byEntity = new Map<string, NormalizedEvidence[]>();
    const labels = new Map<string, string>();
    const attributes = new Map<string, Record<string, string | number | boolean>>();
    const aliasNames = new Map<string, Map<string, string>>();
    const typeHints = new Map<string, EieEntityType>();

    const addAlias = (id: string, value: string, reason: string): void => {
      if (!value) return;
      if (!aliasNames.has(id)) aliasNames.set(id, new Map());
      const m = aliasNames.get(id)!;
      if (!m.has(value)) m.set(value, reason);
    };

    for (const r of this.records) {
      const id = canonical(r.entity.id);
      if (!byEntity.has(id)) byEntity.set(id, []);
      byEntity.get(id)!.push(r);
      if (r.entity.label && !labels.has(id)) labels.set(id, r.entity.label);
      if (r.entity.label && labels.get(id) !== r.entity.label) {
        addAlias(id, r.entity.label, `Alternate name reported by ${r.sourceName}.`);
      }
      if (r.entity.id !== id) {
        addAlias(id, r.entity.id, "Canonical id merged by entity resolution.");
      }
      const attrs = attributes.get(id) ?? {};
      for (const [k, v] of Object.entries(r.fields)) {
        if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
        if (!(k in attrs)) attrs[k] = v;
      }

      attributes.set(id, attrs);
      typeHints.set(id, deriveEntityType(id));
    }

    // 2. Derive relationships; counterparts become entities in their own right.
    interface RelAcc {
      readonly type: EieRelationship["type"];
      readonly sourceId: string;
      readonly targetId: string;
      explanation: string;
      evidenceIds: string[];
      sources: Set<ConnectorId>;
      grades: NormalizedEvidence["grade"][];
      first: string;
      last: string;
    }
    const rels = new Map<string, RelAcc>();

    for (const r of this.records) {
      for (const a of deriveRelationships(r)) {
        const sourceId = canonical(a.sourceId);
        const targetId = canonical(a.targetId);
        if (sourceId === targetId) continue;
        const counterpartId = a.sourceId === r.entity.id ? targetId : sourceId;
        if (!byEntity.has(counterpartId)) byEntity.set(counterpartId, []);
        if (!labels.has(counterpartId)) labels.set(counterpartId, a.targetLabel);
        if (!typeHints.has(counterpartId)) {
          typeHints.set(counterpartId, deriveEntityType(counterpartId, a.targetType));
        }
        const id = `${a.type}::${sourceId}->${targetId}`;
        const existing = rels.get(id);
        if (existing) {
          if (!existing.evidenceIds.includes(r.id)) existing.evidenceIds.push(r.id);
          existing.sources.add(r.source);
          existing.grades.push(r.grade);
          existing.first = r.observedAt < existing.first ? r.observedAt : existing.first;
          existing.last = r.observedAt > existing.last ? r.observedAt : existing.last;
        } else {
          rels.set(id, {
            type: a.type,
            sourceId,
            targetId,
            explanation: a.explanation,
            evidenceIds: [r.id],
            sources: new Set([r.source]),
            grades: [r.grade],
            first: r.observedAt,
            last: r.observedAt,
          });
        }
      }
    }

    const relationshipIdsByEntity = new Map<string, string[]>();
    for (const [id, acc] of Array.from(rels.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      const sources = Array.from(acc.sources).sort();
      const relationship: EieRelationship = {
        id,
        type: acc.type,
        sourceId: acc.sourceId,
        targetId: acc.targetId,
        explanation: acc.explanation,
        grade: strongestGrade(acc.grades),
        confidence: Math.min(
          0.99,
          1 - 1 / (1 + sources.length) + Math.min(0.15, acc.evidenceIds.length * 0.01),
        ),
        evidenceIds: acc.evidenceIds.slice().sort(),
        sources,
        timestamp: acc.first,
        lastSeen: acc.last,
      };
      this.relationshipMap.set(id, relationship);
      for (const side of [acc.sourceId, acc.targetId]) {
        if (!relationshipIdsByEntity.has(side)) relationshipIdsByEntity.set(side, []);
        relationshipIdsByEntity.get(side)!.push(id);
      }
    }

    // 3. Materialise entities.
    const clustersByCanonical = new Map<string, EieResolutionCluster[]>();
    for (const c of this.resolution.clusters) {
      if (!clustersByCanonical.has(c.canonicalId)) clustersByCanonical.set(c.canonicalId, []);
      clustersByCanonical.get(c.canonicalId)!.push(c);
    }

    for (const [id, records] of Array.from(byEntity.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const sorted = records.slice().sort((a, b) => a.observedAt.localeCompare(b.observedAt));
      const evidence: EieEvidenceRef[] = sorted.map((r) => ({
        evidenceId: r.id,
        connectorId: r.source,
        sourceName: r.sourceName,
        grade: r.grade,
        kind: r.kind,
        observedAt: r.observedAt,
        excerpt: r.excerpt,
      }));
      const grade = strongestGrade(sorted.map((r) => r.grade));
      const mergedIds = (clustersByCanonical.get(id) ?? []).flatMap((c) =>
        c.memberIds.filter((m) => m !== id),
      );
      for (const c of clustersByCanonical.get(id) ?? []) {
        for (const m of c.memberIds) {
          if (m !== id) addAlias(id, m, c.explanation);
        }
      }
      const aliasEntries = Array.from(aliasNames.get(id)?.entries() ?? []).sort(([a], [b]) =>
        a.localeCompare(b),
      );
      const firstSeen = sorted[0]?.observedAt ?? "";
      const lastSeen = sorted[sorted.length - 1]?.observedAt ?? "";
      this.entityMap.set(id, {
        id,
        type: typeHints.get(id) ?? deriveEntityType(id),
        label: labels.get(id) ?? id,
        attributes: attributes.get(id) ?? {},
        aliases: aliasEntries.map(([value, reason]) => ({ value, reason })),
        mergedIds: Array.from(new Set(mergedIds)).sort(),
        grade,
        confidenceTier: gradeToTier(grade),
        evidence,
        timeline: buildTimeline(id, sorted),
        relationshipIds: Array.from(new Set(relationshipIdsByEntity.get(id) ?? [])).sort(),
        sources: Array.from(new Set(sorted.map((r) => r.source))).sort(),
        firstSeen,
        lastSeen,
      });
    }
  }

  // ──────────────────────────────── reads ────────────────────────────

  get(id: string): EieEntity | undefined {
    const canonical = this.resolution.canonicalOf.get(id) ?? id;
    return this.entityMap.get(canonical) ?? this.entityMap.get(id);
  }

  entities(): ReadonlyArray<EieEntity> {
    return Array.from(this.entityMap.values());
  }

  relationships(): ReadonlyArray<EieRelationship> {
    return Array.from(this.relationshipMap.values());
  }

  relationship(id: string): EieRelationship | undefined {
    return this.relationshipMap.get(id);
  }

  relationshipsFor(entityId: string): ReadonlyArray<EieRelationship> {
    const entity = this.get(entityId);
    if (!entity) return [];
    return entity.relationshipIds
      .map((id) => this.relationshipMap.get(id))
      .filter((r): r is EieRelationship => Boolean(r));
  }

  neighbours(
    entityId: string,
  ): ReadonlyArray<{ relationship: EieRelationship; entity: EieEntity }> {
    const entity = this.get(entityId);
    if (!entity) return [];
    const out: { relationship: EieRelationship; entity: EieEntity }[] = [];
    for (const relationship of this.relationshipsFor(entity.id)) {
      const otherId =
        relationship.sourceId === entity.id ? relationship.targetId : relationship.sourceId;
      const other = this.entityMap.get(otherId);
      if (other) out.push({ relationship, entity: other });
    }
    return out;
  }

  clusters(): ReadonlyArray<EieResolutionCluster> {
    return this.resolution.clusters;
  }

  evidenceRecords(): ReadonlyArray<NormalizedEvidence> {
    return this.records;
  }

  /** Free-text search over label, id, aliases and attribute values. */
  search(query: string, opts: EntitySearchOptions = {}): ReadonlyArray<EieEntity> {
    const q = query.trim().toLowerCase();
    const limit = opts.limit ?? 50;
    const pool = this.entities().filter((e) => !opts.types || opts.types.includes(e.type));
    if (!q) {
      return pool
        .slice()
        .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.label.localeCompare(b.label))
        .slice(0, limit);
    }
    const scored: { entity: EieEntity; score: number }[] = [];
    for (const e of pool) {
      let score = 0;
      const label = e.label.toLowerCase();
      if (label === q) score = 100;
      else if (e.id.toLowerCase() === q) score = 95;
      else if (label.includes(q)) score = 70;
      else if (e.id.toLowerCase().includes(q)) score = 60;
      else if (e.aliases.some((a) => a.value.toLowerCase().includes(q))) score = 50;
      else if (Object.values(e.attributes).some((v) => String(v).toLowerCase().includes(q)))
        score = 30;
      if (score > 0) scored.push({ entity: e, score });
    }
    return scored
      .sort((a, b) => b.score - a.score || a.entity.label.localeCompare(b.entity.label))
      .slice(0, limit)
      .map((s) => s.entity);
  }

  clear(): void {
    this.records = [];
    this.entityMap.clear();
    this.relationshipMap.clear();
    this.resolution = { canonicalOf: new Map(), clusters: [], duplicatesResolved: 0 };
  }
}

/** Build a registry from an evidence stream in one call. */
export function buildEntityRegistry(evidence: ReadonlyArray<NormalizedEvidence>): EntityRegistry {
  const registry = new EntityRegistry();
  registry.ingest(evidence);
  return registry;
}
