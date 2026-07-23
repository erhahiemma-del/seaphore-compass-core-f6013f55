/**
 * ICE-8 · Source Trust Engine. Trust scores were seeded onto every cell
 * during matrix construction; this module re-asserts them against the
 * registry so an admin edit to `osint_source_trust` can be reflected
 * later without rebuilding the matrix. Trust never chooses the winner
 * on its own — it is one component of Evidence Score (30 %).
 */

import type { MatrixCell } from "./types";
import { fieldCategoryOf } from "./correlation";
import { trustFor } from "./trust-registry";

export function applyTrustWeights(cells: MatrixCell[]): void {
  for (const c of cells) {
    c.trustScore = trustFor(c.sourceId, fieldCategoryOf(c.fieldName));
  }
}
