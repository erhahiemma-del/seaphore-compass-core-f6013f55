/**
 * Findings, as an independent map overlay.
 *
 * A finding gets a position only when a canonical record already holds
 * one: the vessel's own last observed position, or a position stored on
 * the finding. Nothing is placed on the sea because it had to go
 * somewhere — a finding whose subject cannot be located is simply not
 * drawn, and the panel and the attention list still show it.
 *
 * Vessel colour and silhouette are untouched by this. The overlay is its
 * own source with its own features, which is what lets an officer switch
 * findings off without losing the fleet, and what stops a risk colour
 * ever being written into a vessel's identity.
 */
import {
  FINDING_INDICATOR_COLOR,
  FINDING_INDICATOR_LABEL,
  indicatorClassFor,
  type FindingIndicatorClass,
  type PersistedFinding,
} from "./record";

export interface FindingIndicatorFeature {
  readonly type: "Feature";
  readonly id: string;
  readonly geometry: { readonly type: "Point"; readonly coordinates: readonly [number, number] };
  readonly properties: {
    readonly findingId: string;
    readonly subjectType: string;
    readonly subjectId: string;
    readonly indicator: FindingIndicatorClass;
    readonly indicatorLabel: string;
    readonly colour: string;
    /** Whether an officer has already ruled. Drawn quieter, never hidden. */
    readonly decided: boolean;
  };
}

export interface FindingIndicatorCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly FindingIndicatorFeature[];
}

/** Where the map may look up a subject's position. Never a guess. */
export type SubjectPositionLookup = (
  finding: PersistedFinding,
) => { readonly lat: number; readonly lng: number } | null;

const DECIDED = new Set(["CONFIRMED", "DISMISSED", "RESOLVED"]);

export function toFindingIndicatorCollection(
  findings: readonly PersistedFinding[],
  locate: SubjectPositionLookup,
): FindingIndicatorCollection {
  const features: FindingIndicatorFeature[] = [];
  for (const finding of findings) {
    const position = finding.position ?? locate(finding);
    if (!position) continue;
    const indicator = indicatorClassFor(finding);
    features.push({
      type: "Feature",
      id: finding.id,
      geometry: { type: "Point", coordinates: [position.lng, position.lat] },
      properties: {
        findingId: finding.id,
        subjectType: finding.subjectType,
        subjectId: finding.subjectId,
        indicator,
        indicatorLabel: FINDING_INDICATOR_LABEL[indicator],
        colour: FINDING_INDICATOR_COLOR[indicator],
        decided: DECIDED.has(finding.status),
      },
    });
  }
  return { type: "FeatureCollection", features };
}

/** How many findings could not be placed, so a surface can say so. */
export function unplacedFindingCount(
  findings: readonly PersistedFinding[],
  locate: SubjectPositionLookup,
): number {
  return findings.filter((finding) => !(finding.position ?? locate(finding))).length;
}
