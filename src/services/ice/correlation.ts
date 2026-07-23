/**
 * ICE-5 · Correlation Engine. Builds the Field × Source × Value matrix
 * per entity — the heart of ICE. Downstream modules only mutate the
 * cells in place; the shape does not change once built.
 */

import type { NormalizedEvidence } from "@/services/ial/types";
import type { FieldCategory, MatrixCell } from "./types";
import type { Resolution } from "./resolver";
import { FIELD_CATEGORY, fieldQuality } from "./field-config";
import { trustFor } from "./trust-registry";

/** Freshness score: linear decay 100 → 0 over `max` hours. Cap at 0. */
export function freshnessScore(ageHrs: number, maxHrs: number): number {
  if (maxHrs <= 0) return 0;
  return Math.max(0, Math.min(100, 100 * (1 - ageHrs / maxHrs)));
}

export function fieldCategoryOf(field: string): FieldCategory {
  return FIELD_CATEGORY[field] ?? "OTHER";
}

export function buildMatrix(
  resolutions: ReadonlyArray<Resolution>,
  now: Date = new Date(),
): MatrixCell[] {
  const cells: MatrixCell[] = [];
  for (const { canonicalId, evidence } of resolutions) {
    for (const ev of evidence) {
      for (const [field, value] of Object.entries(ev.fields)) {
        cells.push(cellFromEvidence(canonicalId, field, value, ev, now));
      }
    }
  }
  return cells;
}

function cellFromEvidence(
  canonicalId: string,
  field: string,
  value: unknown,
  ev: NormalizedEvidence,
  now: Date,
): MatrixCell {
  const retrieved = new Date(ev.retrievedAt);
  const ageHrs = Math.max(0, (now.getTime() - retrieved.getTime()) / 3_600_000);
  const category = fieldCategoryOf(field);
  const trust = trustFor(ev.source, category);
  // Freshness will be re-computed by the Freshness Engine using per-field
  // max hours; we seed a matrix-wide 30-day baseline here so ICE-5's
  // acceptance criterion (14 hr → ≈98) is met without pre-empting ICE-9.
  const fresh = freshnessScore(ageHrs, 720);
  return {
    canonicalId,
    fieldName: field,
    sourceId: ev.source,
    normalizedValue: value,
    originalValue: undefined,
    originalUnit: ev.units?.[field],
    trustScore: trust,
    freshnessAgeHrs: Number(ageHrs.toFixed(2)),
    freshnessScore: Number(fresh.toFixed(2)),
    corroborationScore: 0,
    completenessScore: 100, // present = complete
    qualityScore: fieldQuality(field),
    evidenceScore: 0,
    conflictPenalty: 0,
    cellStatus: "SINGLE_SOURCE",
    tags: [],
    retrievedAt: ev.retrievedAt,
    rawHash: ev.hash,
    sourceUrl: undefined,
    evidenceId: ev.id,
  };
}

/** Utility: group matrix by (canonicalId, fieldName). */
export function groupByField(
  cells: ReadonlyArray<MatrixCell>,
): Map<string, MatrixCell[]> {
  const g = new Map<string, MatrixCell[]>();
  for (const c of cells) {
    const key = `${c.canonicalId}::${c.fieldName}`;
    const arr = g.get(key);
    if (arr) arr.push(c);
    else g.set(key, [c]);
  }
  return g;
}
