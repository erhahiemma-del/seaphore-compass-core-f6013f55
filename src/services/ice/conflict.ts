/**
 * ICE-6 · Conflict Detection. Scans field groups with 2+ sources and
 * emits `ConflictRow`s for genuine disagreements. Numeric fields tolerate
 * 2 %, timestamps tolerate 60 minutes, strings compare case-insensitively
 * with punctuation stripped. Cell statuses on the matrix are updated in
 * place: winning group → CONFLICT_MAJORITY, losing group → CONFLICT_MINORITY.
 */

import type { ConflictRow, MatrixCell } from "./types";
import { classifySeverity, NUMERIC_TOLERANCE, TIMESTAMP_TOLERANCE_MINUTES } from "./field-config";
import { groupByField } from "./correlation";

export function detectConflicts(cells: MatrixCell[]): ConflictRow[] {
  const conflicts: ConflictRow[] = [];
  for (const group of groupByField(cells).values()) {
    if (group.length < 2) continue;
    const buckets = bucketByValue(group);
    if (buckets.length < 2) continue;

    // Majority = biggest bucket; minority = next biggest. Ties broken by
    // freshest source.
    buckets.sort((a, b) => b.cells.length - a.cells.length || newest(b.cells) - newest(a.cells));
    const [maj, min] = buckets;
    const { severity, isCritical } = classifySeverity(
      group[0].fieldName,
      maj.normalisedValue,
      min.normalisedValue,
    );

    const majNewest = newest(maj.cells);
    const minOldest = oldest(min.cells);
    const ageDiffHrs = Number(((minOldest - majNewest) / 3_600_000).toFixed(2));

    conflicts.push({
      canonicalId: group[0].canonicalId,
      fieldName:   group[0].fieldName,
      majorityValue: maj.cells[0].normalizedValue,
      majoritySources: maj.cells.map((c) => c.sourceId),
      minorityValue: min.cells[0].normalizedValue,
      minoritySources: min.cells.map((c) => c.sourceId),
      severity,
      isCriticalField: isCritical,
      ageDifferentialHrs: ageDiffHrs,
    });

    for (const c of maj.cells) c.cellStatus = "CONFLICT_MAJORITY";
    for (const c of min.cells) c.cellStatus = "CONFLICT_MINORITY";
    // Remaining smaller buckets also count as minority.
    for (const other of buckets.slice(2))
      for (const c of other.cells) c.cellStatus = "CONFLICT_MINORITY";
  }
  return conflicts;
}

function bucketByValue(cells: MatrixCell[]): { normalisedValue: unknown; cells: MatrixCell[] }[] {
  const buckets: { normalisedValue: unknown; cells: MatrixCell[] }[] = [];
  for (const c of cells) {
    const match = buckets.find((b) => valuesEqual(b.normalisedValue, c.normalizedValue));
    if (match) match.cells.push(c);
    else buckets.push({ normalisedValue: c.normalizedValue, cells: [c] });
  }
  return buckets;
}

/** True when the two values are equivalent within field-appropriate tolerance. */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === "number" && typeof b === "number") {
    const denom = Math.max(Math.abs(a), Math.abs(b), 1);
    return Math.abs(a - b) / denom <= NUMERIC_TOLERANCE;
  }
  if (typeof a === "string" && typeof b === "string") {
    if (looksLikeDate(a) && looksLikeDate(b)) {
      const da = Date.parse(a), db = Date.parse(b);
      if (!isNaN(da) && !isNaN(db)) {
        return Math.abs(da - db) <= TIMESTAMP_TOLERANCE_MINUTES * 60_000;
      }
    }
    return norm(a) === norm(b);
  }
  return false;
}

function looksLikeDate(s: string): boolean {
  return /\d{4}-\d{2}-\d{2}/.test(s) || /\d{1,2}\s+\w+\s+\d{4}/.test(s);
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function newest(cells: MatrixCell[]): number {
  return Math.max(...cells.map((c) => Date.parse(c.retrievedAt)));
}
function oldest(cells: MatrixCell[]): number {
  return Math.min(...cells.map((c) => Date.parse(c.retrievedAt)));
}
