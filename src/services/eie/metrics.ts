/**
 * EIE · MIO metrics projection.
 *
 * Supplies the Maritime Intelligence Observability panel with entity
 * count, relationship count, duplicate resolution and entity activity.
 * Every figure is derived from evidence in the registry — no synthetic
 * baselines, and an empty registry reports zero honestly.
 */
import type { EntityRegistry } from "./registry";
import { strongestGrade, weakestGrade, type EieMetrics } from "./types";

export function computeEieMetrics(registry: EntityRegistry): EieMetrics {
  const entities = registry.entities();
  const relationships = registry.relationships();
  const clusters = registry.clusters();

  const byType: Record<string, number> = {};
  for (const e of entities) byType[e.type] = (byType[e.type] ?? 0) + 1;

  const byRelationshipType: Record<string, number> = {};
  for (const r of relationships) {
    byRelationshipType[r.type] = (byRelationshipType[r.type] ?? 0) + 1;
  }

  const resolutionByRule: Record<string, number> = {};
  for (const c of clusters) {
    resolutionByRule[c.rule] = (resolutionByRule[c.rule] ?? 0) + Math.max(0, c.memberIds.length - 1);
  }
  const duplicatesResolved = Object.values(resolutionByRule).reduce((a, b) => a + b, 0);

  const sources = Array.from(new Set(entities.flatMap((e) => e.sources))).sort();
  const grade =
    entities.length === 0
      ? "UNKNOWN"
      : weakestGrade([strongestGrade(entities.map((e) => e.grade))]);

  const activity = entities
    .filter((e) => e.timeline.length > 0)
    .slice()
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.label.localeCompare(b.label))
    .slice(0, 10)
    .map((e) => ({
      entityId: e.id,
      label: e.label,
      type: e.type,
      events: e.timeline.length,
      lastSeen: e.lastSeen,
      grade: e.grade,
    }));

  return {
    entityCount: entities.length,
    byType,
    relationshipCount: relationships.length,
    byRelationshipType,
    duplicatesResolved,
    resolutionByRule,
    evidenceRecords: registry.evidenceRecords().length,
    sources,
    grade,
    activity,
  };
}
