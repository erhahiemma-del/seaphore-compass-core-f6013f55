/**
 * Cross-source corroboration for a finding.
 *
 * Two sources agreeing is worth saying. Two sources disagreeing is worth
 * saying LOUDER — so a conflict is never resolved here, never averaged,
 * and never silently collapsed into whichever source answered last. The
 * officer is told the sources differ and shown both.
 *
 * Sources that were not available are reported as absent rather than as
 * agreement, because a provider that did not answer corroborates nothing.
 */

export type CorroborationLevel =
  | "UNCORROBORATED"
  | "SINGLE_SOURCE"
  | "CORROBORATED"
  | "SOURCE_CONFLICT";

export const CORROBORATION_LABEL: Record<CorroborationLevel, string> = {
  UNCORROBORATED: "No source answered",
  SINGLE_SOURCE: "Single source",
  CORROBORATED: "Corroborated",
  SOURCE_CONFLICT: "Source conflict",
};

export interface SourceClaim {
  /** Provider that made the claim: Datalastic, OpenSanctions, NPA, … */
  readonly source: string;
  /**
   * The claim, normalised by the caller. `null` means the source was
   * queried and had nothing — never treated as agreement.
   */
  readonly value: string | null;
  readonly retrievedAt?: string;
}

export interface CorroborationResult {
  readonly level: CorroborationLevel;
  readonly agreeing: ReadonlyArray<string>;
  /** Every distinct value that was actually claimed, with its sources. */
  readonly claims: ReadonlyArray<{ value: string; sources: ReadonlyArray<string> }>;
  readonly statement: string;
}

export function corroborate(claims: readonly SourceClaim[]): CorroborationResult {
  const byValue = new Map<string, string[]>();
  for (const claim of claims) {
    if (claim.value === null) continue;
    const bucket = byValue.get(claim.value) ?? [];
    bucket.push(claim.source);
    byValue.set(claim.value, bucket);
  }

  const grouped = [...byValue.entries()].map(([value, sources]) => ({ value, sources }));

  if (grouped.length === 0) {
    return {
      level: "UNCORROBORATED",
      agreeing: [],
      claims: [],
      statement: "No source answered for this finding.",
    };
  }

  if (grouped.length > 1) {
    return {
      level: "SOURCE_CONFLICT",
      agreeing: [],
      claims: grouped,
      statement: `Sources disagree: ${grouped
        .map((group) => `${group.sources.join(", ")} say "${group.value}"`)
        .join(" · ")}. Not merged — an officer must resolve this.`,
    };
  }

  const only = grouped[0]!;
  if (only.sources.length === 1) {
    return {
      level: "SINGLE_SOURCE",
      agreeing: only.sources,
      claims: grouped,
      statement: `Only ${only.sources[0]} reported this. Not corroborated.`,
    };
  }

  return {
    level: "CORROBORATED",
    agreeing: only.sources,
    claims: grouped,
    statement: `${only.sources.join(", ")} agree on "${only.value}".`,
  };
}
