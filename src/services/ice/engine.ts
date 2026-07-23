/**
 * ICE Orchestrator. Drives modules 1 → 14 in order and returns one
 * `IntelligencePackage`. The OIE consumes exactly this artefact and
 * never sees the underlying IAL envelopes directly.
 */

import type { ConnectorManager } from "@/services/ial/manager";
import type { IceQueryInput, IntelligencePackage } from "./types";

import { planQuery } from "./planner";
import { collectForPlan } from "./collector";
import { normaliseAll } from "./normalizer";
import { resolveEntities } from "./resolver";
import { buildMatrix } from "./correlation";
import { detectConflicts } from "./conflict";
import { detectCorroborations } from "./corroboration";
import { applyTrustWeights } from "./source-trust";
import { applyFreshnessDecay } from "./freshness";
import { scoreEvidence } from "./scoring";
import { fuseIntelligence } from "./fusion";
import { explainAll } from "./explainability";
import { generateRecommendations } from "./recommendations";

export async function runIce(
  input: IceQueryInput,
  manager: ConnectorManager,
): Promise<IntelligencePackage> {
  // ICE-1 · Plan
  const available = manager.listConnectors().map((c) => c.id);
  const plan = planQuery(input, available);

  // ICE-2 · Collect (via IAL)
  const { evidence: rawEvidence } = await collectForPlan(manager, plan);

  // ICE-3 · Normalise field aliases
  const evidence = normaliseAll(rawEvidence);

  // ICE-4 · Resolve entities
  const resolutions = resolveEntities(evidence);

  // ICE-5 · Correlation matrix
  const cells = buildMatrix(resolutions);

  // ICE-8 · Trust weights (idempotent — cells already trust-scored)
  applyTrustWeights(cells);

  // ICE-9 · Freshness decay per field
  applyFreshnessDecay(cells);

  // ICE-6 · Conflicts (before scoring so penalties apply)
  const conflicts = detectConflicts(cells);

  // ICE-7 · Corroborations
  const corroborations = detectCorroborations(cells);

  // ICE-11 · Evidence scoring
  scoreEvidence(cells);

  // ICE-12 · Fusion
  const fusedRaw = fuseIntelligence(cells, corroborations);

  // ICE-13 · Explainability
  const fused = explainAll(fusedRaw, { cells, conflicts, corroborations });

  // ICE-14 · Recommendations
  const recommendations = generateRecommendations(fused, conflicts);

  return {
    plan,
    evidence,
    matrix: cells,
    conflicts,
    corroborations,
    fused,
    recommendations,
    canonicalEntities: resolutions.map((r) => r.entity),
    completedAt: new Date().toISOString(),
  };
}
