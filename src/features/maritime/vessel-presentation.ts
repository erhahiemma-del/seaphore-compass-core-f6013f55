/**
 * What the drawer is allowed to say about a vessel.
 *
 * The panel used to read raw vessel objects in a dozen places and decide,
 * inline, whether a field was worth showing. That put the truthfulness
 * rule in the rendering code: every new section was a fresh opportunity
 * to print a bare "Unknown" over something the system had never asked
 * about. This module makes the decision once and hands the UI a value it
 * cannot misreport.
 *
 * ## Five states, because "unknown" hides the useful distinction
 *
 * An officer needs to tell apart three very different silences:
 *
 * - `NOT_CONNECTED` — no source for this exists. Ownership is not absent
 *   for this hull; ownership is absent for every hull, because nothing
 *   in the deployment resolves it. Connecting a provider fixes it.
 * - `NOT_ASSESSED` — a source could answer, but has not ranked this
 *   vessel. Risk is the case: the field is real, the assessment has not
 *   run. Waiting fixes it.
 * - `UNAVAILABLE` — the source answered and had nothing. The report
 *   simply carried no call sign.
 * - `UNKNOWN` — genuinely indeterminate; reserved, and used sparingly.
 * - `AVAILABLE` — there is a value.
 *
 * Collapsing the first three into "Unknown" is the failure this exists
 * to prevent: it tells an officer the system checked when it did not.
 *
 * Nothing here computes intelligence. It reads fields, and where a value
 * is missing it reports the reason the underlying service already knows.
 */
import type { Vessel } from "@/services/geospatial";
import type { VesselTrack } from "@/services/geospatial/vessel-track";
import { trackProvenanceLabel, trackStateLabel } from "@/services/geospatial/vessel-track";

import {
  destinationLabel,
  positionFreshnessLabel,
  positionProvenanceLabel,
  riskBadgeLabel,
  trackAvailability,
} from "./vessel-panel-state";

/** Why a field has no value — never collapsed into a single word. */
export type Availability =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "NOT_ASSESSED"
  | "NOT_CONNECTED"
  | "UNKNOWN";

/**
 * One displayable fact.
 *
 * `reason` is required whenever there is no value, which is what stops a
 * blank field reaching the screen with nothing to explain it.
 */
export interface Datum {
  readonly label: string;
  readonly value?: string;
  readonly availability: Availability;
  /** Why there is no value. Required unless `availability` is AVAILABLE. */
  readonly reason?: string;
  /** Where the value came from, when that changes how it should be read. */
  readonly provenance?: string;
  readonly mono?: boolean;
}

const available = (label: string, value: string, extra: Partial<Datum> = {}): Datum => ({
  label,
  value,
  availability: "AVAILABLE",
  ...extra,
});

const missing = (
  label: string,
  availability: Exclude<Availability, "AVAILABLE">,
  reason: string,
  extra: Partial<Datum> = {},
): Datum => ({ label, availability, reason, ...extra });

/**
 * Ownership, crew and the rest of the entity graph.
 *
 * Every one of these is `NOT_CONNECTED` rather than unavailable: no
 * adapter in this deployment resolves them for a map vessel, so the
 * honest sentence names the missing connection, not a missing record.
 * The moment a provider lands, these become real lookups and the drawer
 * does not change shape.
 */
const NO_ENTITY_SOURCE = "No entity intelligence source is connected.";
const NO_CREW_SOURCE = "No crew intelligence source is connected.";

export interface VesselPresentation {
  readonly identity: readonly Datum[];
  readonly snapshot: readonly Datum[];
  readonly voyage: readonly Datum[];
  readonly assessment: VesselAssessment;
  readonly ownership: readonly Datum[];
  readonly people: readonly Datum[];
  readonly activity: readonly ActivityEvent[];
}

/**
 * Risk, attention and confidence, kept apart on purpose.
 *
 * They are three different questions — how dangerous, how urgent, how
 * sure — and a single badge answering all three is how an unassessed
 * vessel ends up looking safe.
 */
export interface VesselAssessment {
  readonly risk: Datum;
  readonly attention: Datum;
  readonly confidence: Datum;
  /** True when nothing has actually assessed this vessel. */
  readonly unresolved: boolean;
}

export interface ActivityEvent {
  readonly at: string;
  readonly summary: string;
  readonly provenance: string;
}

export function presentVessel(
  vessel: Vessel,
  options: {
    readonly sourceSupportsHistory?: boolean;
    readonly track?: VesselTrack | null;
  } = {},
): VesselPresentation {
  const { identity, position } = vessel;
  const track = options.track;

  return {
    identity: [
      available("IMO", identity.imo, { mono: true }),
      identity.mmsi
        ? available("MMSI", identity.mmsi, { mono: true })
        : missing("MMSI", "UNAVAILABLE", "Not in the current position report", { mono: true }),
      identity.callSign
        ? available("Call sign", identity.callSign, { mono: true })
        : missing("Call sign", "UNAVAILABLE", "Not in the current position report", { mono: true }),
      identity.flag
        ? available("Flag", identity.flag)
        : missing("Flag", "NOT_CONNECTED", "Requires a vessel registry lookup"),
      identity.type
        ? available("Type", identity.type)
        : missing("Type", "UNAVAILABLE", "Not classified by the source"),
    ],

    snapshot: [
      available("Position", `${position.lat.toFixed(4)}°, ${position.lon.toFixed(4)}°`, {
        mono: true,
        provenance: positionProvenanceLabel(vessel),
      }),
      available("Speed", `${position.speed.toFixed(1)} kn`, { mono: true }),
      /*
       * `heading` is a required number, so an unreported course arrives
       * as 0 and draws as due north. The flag is the only thing keeping
       * "steaming north" apart from "nobody said".
       */
      position.headingReported === false
        ? missing("Heading", "UNAVAILABLE", "Course not reported", { mono: true })
        : available("Heading", `${Math.round(position.heading)}°`, { mono: true }),
      /*
       * Freshness is not repeated here. It rides on the hero's status
       * chip, and carrying it in both places produced two ages computed
       * a render apart — "Fresh · 51s" beside "Fresh · 1s" for one
       * position. Destination is the more useful fourth metric, and it
       * is the one an officer looks for next.
       */
      voyageDestination(vessel),
    ],

    voyage: [
      voyageDestination(vessel),
      position.etaHours != null
        ? available("ETA", `${position.etaHours} h`)
        : missing("ETA", "UNAVAILABLE", "Not reported by the source"),
      /*
       * Origin is the classic fabrication: a track's earliest point is
       * where recording started, not where the voyage began. Naming it
       * an origin port would invent a leg nobody observed.
       */
      missing("Origin", "NOT_CONNECTED", "No voyage record source is connected"),
      trackDatum(vessel, track, options.sourceSupportsHistory ?? false),
    ],

    assessment: assess(vessel),

    ownership: [
      missing("Registered owner", "NOT_CONNECTED", NO_ENTITY_SOURCE),
      missing("Operator", "NOT_CONNECTED", NO_ENTITY_SOURCE),
      missing("Manager", "NOT_CONNECTED", NO_ENTITY_SOURCE),
      missing("Beneficial owner", "NOT_CONNECTED", NO_ENTITY_SOURCE),
    ],

    /*
     * Crew is people, and a count is not people. The NIMASA adapter
     * carries a `crew_count` but is not connected to map vessels, and
     * even when it is, a number must never be dressed as crew records.
     */
    people: [
      missing("Master", "NOT_CONNECTED", NO_CREW_SOURCE),
      missing("Chief officer", "NOT_CONNECTED", NO_CREW_SOURCE),
      missing("Crew on board", "NOT_CONNECTED", NO_CREW_SOURCE),
    ],

    activity: activityFor(vessel),
  };
}

function voyageDestination(vessel: Vessel): Datum {
  const { value, reason } = destinationLabel(vessel);
  return value
    ? /*
       * Printed verbatim, never geocoded. Expanding a LOCODE into a
       * place or a map marker would be Seaphore adding a claim to a
       * voyage it did not observe.
       */
      available("Declared destination", value, { provenance: "As declared by the source" })
    : missing("Declared destination", "UNAVAILABLE", reason);
}

function trackDatum(
  vessel: Vessel,
  track: VesselTrack | null | undefined,
  sourceSupportsHistory: boolean,
): Datum {
  if (track) {
    return available("Movement history", trackStateLabel(track), {
      provenance: trackProvenanceLabel(track),
    });
  }
  const availability = trackAvailability(sourceSupportsHistory);
  return missing("Movement history", "UNAVAILABLE", availability.note);
}

/**
 * The three assessment axes.
 *
 * `riskLevel` is `UNKNOWN` for every vessel today because nothing
 * assigns it, and `attentionScore` of 0 means "not ranked" rather than
 * "low priority" — both are stated as such rather than rendered as a
 * reassuring value.
 */
function assess(vessel: Vessel): VesselAssessment {
  const assessed = vessel.riskLevel !== "UNKNOWN";
  const ranked = vessel.attentionScore > 0;

  return {
    risk: assessed
      ? available("Risk", riskBadgeLabel(vessel))
      : missing("Risk", "NOT_ASSESSED", "No risk assessment has been resolved for this vessel"),
    attention: ranked
      ? available("Attention score", String(vessel.attentionScore))
      : missing("Attention score", "NOT_ASSESSED", "Not ranked by the attention engine"),
    confidence:
      vessel.confidenceLevel != null
        ? available("Confidence", vessel.confidenceLevel)
        : missing("Confidence", "NOT_ASSESSED", "No confidence assessment for this observation"),
    unresolved: !assessed && !ranked,
  };
}

/**
 * Events that genuinely happened, which today is one: the position
 * report the map is drawing. Anything richer — selections, intelligence
 * requests, case events — would be invented history.
 */
function activityFor(vessel: Vessel): readonly ActivityEvent[] {
  return [
    {
      at: vessel.position.timestamp,
      summary: "Position report received",
      provenance: positionProvenanceLabel(vessel),
    },
  ];
}
