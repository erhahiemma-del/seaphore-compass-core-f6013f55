/**
 * Sprint 7 · Fusion Pipeline — orchestrates all five layers end-to-end.
 *
 *   raw → normalise → score → dedupe → detect conflicts → rank → bundle
 *
 * Output is a `FusedEvidenceBundle`, validated against a Zod schema before
 * being handed to the Reasoning Engine (Sprint 8).
 */
import type { AgentResult } from "@/services/agents/types";
import { agentResultsToRawEvidence } from "./adapters";
import { scoreAll, type ConfidenceOptions } from "./confidence";
import { detectConflicts } from "./conflicts";
import { dedupe } from "./dedupe";
import { normalizeMany } from "./normalize";
import { rank } from "./rank";
import { FusedEvidenceBundleSchema } from "./schemas";
import type { FusedEvidenceBundle } from "./types";

export interface FuseOptions extends ConfidenceOptions {
  /** Validate final bundle with Zod (default: true). Disable in hot paths. */
  validate?: boolean;
}

export function fuse(rawInputs: readonly unknown[], opts: FuseOptions = {}): FusedEvidenceBundle {
  const started = Date.now();
  const normalized = normalizeMany(rawInputs);
  const scored = scoreAll(normalized, opts);
  const { kept, duplicateCount } = dedupe(scored);
  const { items, conflicts } = detectConflicts(kept);
  const ranked = rank(items);

  const agents = new Set<string>();
  const sources = new Set<string>();
  for (const it of ranked) {
    agents.add(it.agent);
    sources.add(it.sourceSystem);
  }

  const bundle: FusedEvidenceBundle = {
    ranked,
    conflicts,
    metrics: {
      inputCount: rawInputs.length,
      normalizedCount: normalized.length,
      dedupedCount: ranked.length,
      duplicateCount,
      conflictCount: conflicts.length,
      sourcesQueried: sources.size,
      agentsReporting: agents.size,
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
    },
  };

  if (opts.validate !== false) FusedEvidenceBundleSchema.parse(bundle);
  return bundle;
}

/** Convenience — fuse the output of the Sprint 6 Agent Framework directly. */
export function fuseAgentResults(
  results: readonly AgentResult<unknown>[],
  opts: FuseOptions = {},
): FusedEvidenceBundle {
  return fuse(agentResultsToRawEvidence(results), opts);
}
