/**
 * What the vessel panel says about a vessel, derived once.
 *
 * The card had grown into a form: four sections of label-and-value in a
 * flat list, every row the same weight, so an officer scanning it found
 * the vessel's name and its confidence score competing for attention. It
 * also carried a bare `UNKNOWN` badge beside the name, which reads as a
 * statement about the vessel rather than about the risk assessment
 * nobody has made.
 *
 * These are the derivations that fix that, kept out of JSX so they can be
 * asserted directly and so the wording lives in one place rather than
 * being re-improvised per row.
 *
 * ## Nothing here invents a value
 *
 * Every function returns either something a source actually said or an
 * explicit account of why there is nothing to say. The distinction
 * between "no source provides this" and "this source has no record for
 * this vessel" is preserved wherever it is known, because those are
 * different operational situations and an officer acts differently on
 * each.
 */
import { formatAge, freshnessBandForTimestamp, freshnessLabel } from "@/services/geospatial";
import { POSITION_KIND_LABELS, isObserved } from "@/services/geospatial/position-provenance";
import { getVesselSource } from "@/services/geospatial";
import type { Vessel } from "@/services/geospatial/vessel";

/**
 * The badge beside the vessel's name.
 *
 * It used to render `vessel.riskLevel` alone, so an unassessed vessel
 * showed `UNKNOWN` with nothing saying what was unknown — the officer had
 * to guess whether the system doubted the vessel's identity, its
 * position, or its intent. Naming the axis costs one word and removes the
 * guess.
 */
export function riskBadgeLabel(vessel: Vessel): string {
  return vessel.riskLevel === "UNKNOWN" ? "Risk not assessed" : `Risk ${vessel.riskLevel}`;
}

/**
 * The operational line under the identity block.
 *
 * There is no alert model yet, so the honest answer is that nothing is
 * outstanding — said plainly rather than left blank. A blank space where
 * an alert would go reads as "not loaded"; a sentence reads as "checked,
 * nothing there".
 */
export function operationalStateLabel(): string {
  return "No active operational alert";
}

/**
 * How this vessel's position should be described.
 *
 * Derived from the source's declared type and the position's own
 * provenance — never from the vessel's id — so a provider added later
 * gets correct wording by declaring what it is. A simulated source
 * observes nothing whatever its positions claim, and a position the
 * interface drew between two reports was not observed either.
 */
export function positionProvenanceLabel(vessel: Vessel): string {
  const sourceId = vessel.provenance?.source;
  const simulated = sourceId ? getVesselSource(sourceId)?.describe().type === "SIMULATED" : false;
  if (simulated) return "Simulated position";
  if (!isObserved(vessel.position.kind)) {
    return POSITION_KIND_LABELS[vessel.position.kind ?? "OBSERVED"];
  }
  return "Reported by source";
}

/** Age and freshness band of the current position, as one phrase. */
export function positionFreshnessLabel(vessel: Vessel): string {
  const band = freshnessBandForTimestamp(vessel.position.timestamp);
  const age = Date.now() - Date.parse(vessel.position.timestamp);
  return `${freshnessLabel(band)} · ${formatAge(Number.isFinite(age) ? age : null)}`;
}

/**
 * Whether movement history can be asked for at all.
 *
 * Capability and data are separate questions and must not collapse into
 * one message. A source that keeps no archive is a different situation
 * from a source that keeps one and holds nothing for this hull: the first
 * is a limit of what Seaphore is connected to, the second is a fact about
 * the vessel.
 */
export type TrackAvailability =
  | { readonly state: "SUPPORTED"; readonly note: string }
  | { readonly state: "UNSUPPORTED"; readonly note: string };

export function trackAvailability(sourceSupportsHistory: boolean): TrackAvailability {
  return sourceSupportsHistory
    ? {
        state: "SUPPORTED",
        note: "The connected source holds movement history for this vessel.",
      }
    : {
        state: "UNSUPPORTED",
        note: "Historical movement is not available from the connected source.",
      };
}

/**
 * Destination exactly as the source gave it, or an account of its absence.
 *
 * Never geocoded, never expanded into a place name, never turned into a
 * map marker elsewhere. A LOCODE is what the source said; anything more
 * would be Seaphore adding a claim to a voyage it did not observe.
 */
export function destinationLabel(vessel: Vessel): { value?: string; reason: string } {
  const declared = vessel.position.destination;
  return declared
    ? { value: declared, reason: "" }
    : { reason: "Not declared in the current position report" };
}
