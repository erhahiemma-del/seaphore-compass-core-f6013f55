/**
 * ICE-9 · Freshness Engine. Applies per-field decay curves and stamps
 * the STALE tag on cells whose freshness has fallen below 10. Stale
 * evidence is NEVER deleted — it just loses weight in fusion.
 */

import type { MatrixCell } from "./types";
import { freshnessMaxHrs } from "./field-config";
import { freshnessScore } from "./correlation";

export function applyFreshnessDecay(cells: MatrixCell[]): void {
  for (const c of cells) {
    const max = freshnessMaxHrs(c.fieldName);
    c.freshnessScore = Number(freshnessScore(c.freshnessAgeHrs, max).toFixed(2));
    if (c.freshnessScore < 10 && !c.tags.includes("STALE")) c.tags.push("STALE");
    if (c.originalUnit && !c.tags.includes("UNIT_KNOWN")) c.tags.push("UNIT_KNOWN");
  }
}
