/**
 * GIP — Intelligence fusion (data model).
 *
 * One vessel, observed by several providers, becomes one fused
 * observation carrying every contribution's evidence, provenance and
 * citations.
 *
 * ## Not a new engine
 *
 * This extends the existing evidence and confidence model rather than
 * introducing an inference engine. Confidence comes from
 * `@/lib/osint/confidence` — the same function the connectors use — and
 * corroboration only *raises* it within a bounded, documented rule. There
 * is no scoring model here, no weighting heuristic, and no risk output.
 *
 * ## The corroboration rule
 *
 * Independent agreement is evidence. Two providers reporting the same
 * vessel is genuinely stronger than one, so fused confidence is the best
 * single contribution plus a bounded corroboration bonus:
 *
 *   fused = min(cap, best + bonus × (sourceCount − 1))
 *
 * Deliberately conservative:
 *   - Only the *best* contribution anchors it, so a weak source cannot
 *     drag a strong one down.
 *   - The bonus is small and the result capped, so agreement between many
 *     mediocre sources never manufactures certainty.
 *   - Contradiction is recorded, never averaged away.
 *
 * Field selection is "highest confidence wins, ties broken by recency" —
 * a stated, auditable rule rather than a blend. Blending identity fields
 * across providers would invent a vessel that no provider reported.
 */
import { confidenceLevelFor } from "@/lib/osint/confidence";

import type { Vessel, VesselProvenance } from "./vessel";

/** One provider's contribution to a fused observation. */
export interface FusionContribution {
  readonly sourceId: string;
  readonly provider: string;
  readonly vessel: Vessel;
  readonly confidence: number;
  readonly observedAt: string;
  readonly retrievedAt: string;
  readonly datasetId?: string;
}

/** A citation, attributable to exactly one provider. */
export interface FusionCitation {
  readonly sourceId: string;
  readonly provider: string;
  readonly datasetId: string | null;
  readonly observedAt: string;
  readonly retrievedAt: string;
  readonly confidence: number;
  readonly confidenceLevel: string;
  readonly statement: string;
}

/** A field two or more providers disagree about. */
export interface FusionConflict {
  readonly field: string;
  /** Value → the sources asserting it. */
  readonly values: ReadonlyArray<{
    readonly value: string;
    readonly sourceIds: readonly string[];
  }>;
}

/** The result of fusing one vessel's observations. */
export interface FusedObservation {
  /** Canonical key — the winning contribution's identity key. */
  readonly key: string;
  /** The selected vessel. Never a blend; always one provider's report. */
  readonly vessel: Vessel;
  readonly confidence: number;
  readonly confidenceLevel: string;
  /** Distinct providers contributing. */
  readonly sourceCount: number;
  readonly sourceIds: readonly string[];
  readonly citations: readonly FusionCitation[];
  readonly provenance: readonly VesselProvenance[];
  /** Fields where providers disagree. Recorded, never silently resolved. */
  readonly conflicts: readonly FusionConflict[];
  /** Which contribution supplied the selected vessel. */
  readonly selectedSourceId: string;
}

/** Tunables for the corroboration rule. */
export interface FusionOptions {
  /** Added per corroborating source beyond the first. Default 0.05. */
  readonly corroborationBonus?: number;
  /** Upper bound on fused confidence. Default 0.98 — never certainty. */
  readonly confidenceCap?: number;
}

const DEFAULT_BONUS = 0.05;
const DEFAULT_CAP = 0.98;

/** Build a contribution from a vessel that already carries provenance. */
export function contributionFrom(vessel: Vessel): FusionContribution | null {
  const provenance = vessel.provenance;
  if (!provenance) return null;
  return {
    sourceId: provenance.source,
    provider: provenance.provider,
    vessel,
    confidence: vessel.confidence ?? 0,
    observedAt: provenance.observedAt,
    retrievedAt: provenance.retrievedAt,
    ...(provenance.datasetId ? { datasetId: provenance.datasetId } : {}),
  };
}

/**
 * Fuse contributions for a single vessel.
 *
 * Returns null for an empty input — a fused observation with no
 * contributions would assert something no provider reported.
 */
export function fuseObservation(
  contributions: readonly FusionContribution[],
  options: FusionOptions = {},
): FusedObservation | null {
  if (contributions.length === 0) return null;

  const bonus = options.corroborationBonus ?? DEFAULT_BONUS;
  const cap = options.confidenceCap ?? DEFAULT_CAP;

  // Selection: highest confidence, ties broken by the more recent observation.
  const ranked = [...contributions].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return Date.parse(b.observedAt) - Date.parse(a.observedAt);
  });
  const winner = ranked[0];

  const sourceIds = [...new Set(contributions.map((c) => c.sourceId))];
  const sourceCount = sourceIds.length;

  const best = ranked[0].confidence;
  const confidence = Math.min(cap, best + bonus * Math.max(0, sourceCount - 1));

  const citations: FusionCitation[] = contributions.map((c) => ({
    sourceId: c.sourceId,
    provider: c.provider,
    datasetId: c.datasetId ?? null,
    observedAt: c.observedAt,
    retrievedAt: c.retrievedAt,
    confidence: c.confidence,
    confidenceLevel: confidenceLevelFor(c.confidence),
    statement:
      `${c.provider} reported ${c.vessel.identity.name} at ` +
      `${c.vessel.position.lat.toFixed(4)}, ${c.vessel.position.lon.toFixed(4)} on ${c.observedAt}.`,
  }));

  const provenance = contributions
    .map((c) => c.vessel.provenance)
    .filter((p): p is VesselProvenance => p !== undefined);

  return {
    key: winner.vessel.identity.imo,
    vessel: { ...winner.vessel, confidence, confidenceLevel: confidenceLevelFor(confidence) },
    confidence,
    confidenceLevel: confidenceLevelFor(confidence),
    sourceCount,
    sourceIds,
    citations,
    provenance,
    conflicts: detectConflicts(contributions),
    selectedSourceId: winner.sourceId,
  };
}

/**
 * Group contributions by vessel and fuse each group.
 *
 * Keyed by IMO — the same key the map and update engine use, so a fused
 * observation drops into the existing pipeline unchanged.
 */
export function fuseObservations(
  contributions: readonly FusionContribution[],
  options: FusionOptions = {},
): readonly FusedObservation[] {
  const groups = new Map<string, FusionContribution[]>();
  for (const contribution of contributions) {
    const key = contribution.vessel.identity.imo;
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(contribution);
    else groups.set(key, [contribution]);
  }

  const fused: FusedObservation[] = [];
  for (const group of groups.values()) {
    const result = fuseObservation(group, options);
    if (result) fused.push(result);
  }
  return fused;
}

/**
 * Record where providers disagree.
 *
 * Conflicts are surfaced, never resolved by averaging. An officer seeing
 * two flags for one vessel is being told something real; a silently
 * averaged flag would be a fabrication.
 */
function detectConflicts(contributions: readonly FusionContribution[]): readonly FusionConflict[] {
  if (contributions.length < 2) return [];

  const fields: ReadonlyArray<{ field: string; read: (v: Vessel) => string | undefined }> = [
    { field: "identity.name", read: (v) => v.identity.name },
    { field: "identity.mmsi", read: (v) => v.identity.mmsi },
    { field: "identity.flag", read: (v) => v.identity.flag },
    { field: "identity.type", read: (v) => v.identity.type },
  ];

  const conflicts: FusionConflict[] = [];
  for (const { field, read } of fields) {
    const bySource = new Map<string, string[]>();
    for (const contribution of contributions) {
      const value = read(contribution.vessel);
      if (value === undefined || value === "") continue;
      const sources = bySource.get(value);
      if (sources) sources.push(contribution.sourceId);
      else bySource.set(value, [contribution.sourceId]);
    }
    if (bySource.size > 1) {
      conflicts.push({
        field,
        values: [...bySource.entries()].map(([value, sourceIds]) => ({ value, sourceIds })),
      });
    }
  }
  return conflicts;
}
