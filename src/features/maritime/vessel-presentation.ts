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
import type { VesselEnrichment } from "@/services/geospatial/vessel-enrichment";
import { destinationPortTarget } from "@/services/geospatial/voyage-port-target";
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

/* ── Deep Datalastic enrichment ──────────────────────────────────────── */

/**
 * Formatters for the particulars.
 *
 * Units are attached here rather than in the model, because a number
 * without a unit in an operational panel is worse than no number: 15 could
 * be metres of beam or knots of wind, and the reader cannot tell which the
 * panel meant.
 */
const metres = (n: number): string => `${n.toLocaleString()} m`;
const tonnes = (n: number): string => `${n.toLocaleString()} t`;
const knots = (n: number): string => `${n} kn`;

/** ISO-8601 to something an officer reads, in UTC, never localised away. */
function utc(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * The sentence used wherever an add-on Seaphore cannot reach would go.
 *
 * `NOT_CONNECTED`, never `UNAVAILABLE`: the provider was not asked and
 * found nothing, it has no endpoint to ask. Saying "no record" there would
 * assert something about the vessel rather than about Seaphore.
 */
const NOT_SERVED = "Datalastic sells this but serves no endpoint for it.";

/**
 * Static particulars, from `vessel_info`.
 *
 * A null enrichment means the deep load has not run — nobody selected this
 * vessel, or the request is in flight. That is a different state from the
 * provider holding no tonnage, so the two produce different sentences.
 */
export function presentParticulars(enrichment: VesselEnrichment | null): readonly Datum[] {
  const p = enrichment?.particulars ?? null;
  if (!p) {
    return [
      missing(
        "Vessel particulars",
        "UNKNOWN",
        "Not loaded. Particulars are retrieved when a vessel is selected.",
      ),
    ];
  }

  const noRecord = (label: string) =>
    missing(label, "UNAVAILABLE", "The provider holds no value for this vessel.");

  return [
    p.callSign ? available("Call sign", p.callSign, { mono: true }) : noRecord("Call sign"),
    p.grossTonnage !== null
      ? available("Gross tonnage", tonnes(p.grossTonnage))
      : noRecord("Gross tonnage"),
    p.deadweight !== null ? available("Deadweight", tonnes(p.deadweight)) : noRecord("Deadweight"),
    p.length !== null ? available("Length", metres(p.length)) : noRecord("Length"),
    p.breadth !== null ? available("Breadth", metres(p.breadth)) : noRecord("Breadth"),
    p.yearBuilt !== null ? available("Year built", String(p.yearBuilt)) : noRecord("Year built"),
    p.homePort ? available("Home port", p.homePort) : noRecord("Home port"),
    p.flagName ? available("Flag state", p.flagName) : noRecord("Flag state"),
    /*
     * Only when the two names disagree. A vessel broadcasting a name other
     * than its registered one is something an officer should see; the same
     * name printed twice trains them to stop looking.
     */
    ...(p.aisNameDiffers
      ? [
          available("AIS name", p.aisNameDiffers, {
            provenance: "Differs from the registered name",
          }),
        ]
      : []),
    p.speedMax !== null
      ? available("Observed max speed", knots(p.speedMax), {
          provenance: "Provider-observed, not a design figure",
        })
      : noRecord("Observed max speed"),
  ];
}

/**
 * The declared voyage, from `vessel_pro`.
 *
 * Every value is what the vessel or the provider stated. Nothing is
 * computed — in particular there is no ETA derived from speed and
 * distance, because an inferred arrival printed beside a declared one is
 * indistinguishable from it.
 */
export function presentDeclaredVoyage(enrichment: VesselEnrichment | null): readonly Datum[] {
  const v = enrichment?.voyage ?? null;
  if (!v) {
    return [
      missing(
        "Voyage",
        "UNKNOWN",
        "Not loaded. Voyage detail is retrieved when a vessel is selected.",
      ),
    ];
  }

  const notDeclared = (label: string) =>
    missing(label, "UNAVAILABLE", "The vessel is not declaring this.");

  return [
    v.departurePort
      ? available("Departure port", v.departurePort, {
          ...(v.departureUnlocode ? { provenance: `UNLOCODE ${v.departureUnlocode}` } : {}),
        })
      : notDeclared("Departure port"),
    v.departedAt
      ? available("Departed", utc(v.departedAt), { provenance: "Provider-reported actual" })
      : notDeclared("Departed"),
    v.destinationLink.name
      ? available("Destination", v.destinationLink.name, {
          provenance:
            v.destinationLink.state === "VERIFIED"
              ? `UNLOCODE ${v.destinationLink.unlocode ?? "not given"}`
              : "Broadcast text — no port identifier resolved",
        })
      : notDeclared("Destination"),
    v.eta
      ? available("ETA", utc(v.eta), { provenance: "Declared by the vessel, not computed" })
      : notDeclared("ETA"),
    v.navigationStatus
      ? available("Navigation status", v.navigationStatus)
      : notDeclared("Navigation status"),
    v.currentDraught !== null
      ? available("Current draught", metres(v.currentDraught))
      : notDeclared("Current draught"),
  ];
}

/**
 * Whether the destination resolved to a port Seaphore can open.
 *
 * The distinction this panel carries: a broadcast destination is text, and
 * text is not a port. "LAGOS" names a port in Nigeria and one in Portugal,
 * so an unresolved name is reported as unresolved rather than linked to
 * whichever happens to sort first.
 */
export function presentPortContext(enrichment: VesselEnrichment | null): readonly Datum[] {
  const link = enrichment?.voyage?.destinationLink ?? null;
  if (!link) return [missing("Destination port", "UNKNOWN", "Not loaded.")];

  if (link.state === "VERIFIED") {
    /*
     * A resolved port is not necessarily one Seaphore can open. The
     * gazetteer is Nigerian, so a vessel bound for Kamsar has a perfectly
     * good UNLOCODE and no local record — a limit of this deployment, not
     * a defect in the declaration, and the panel has to say which.
     */
    const target = destinationPortTarget(enrichment?.voyage ?? null);
    return [
      available("Destination port", link.name ?? "Resolved without a name"),
      link.unlocode
        ? available("UNLOCODE", link.unlocode, { mono: true })
        : missing("UNLOCODE", "UNAVAILABLE", "The provider resolved the port without one."),
      target.state === "AVAILABLE"
        ? available("Port record", target.port?.name ?? "Held", {
            provenance: "In Seaphore's port register",
          })
        : missing(
            "Port record",
            "NOT_CONNECTED",
            target.note ?? "This port is outside Seaphore's register.",
          ),
    ];
  }

  if (link.state === "NO_VERIFIED_PORT_LINK") {
    return [
      available("Broadcast destination", link.name ?? "Declared without a name", {
        provenance: "Not linked to a Seaphore port",
      }),
      missing("Destination port", "UNAVAILABLE", link.note ?? "No port identifier was resolved."),
    ];
  }

  return [
    missing("Destination port", "UNAVAILABLE", "This vessel is not declaring a destination."),
  ];
}

/**
 * Where each half of the enrichment came from.
 *
 * Endpoint-level rather than provider-level: facts from `vessel_info` and
 * `vessel_pro` age differently and cache differently, so collapsing them to
 * "Datalastic" would hide which one is stale.
 */
export function presentEnrichmentSource(enrichment: VesselEnrichment | null): readonly Datum[] {
  const rows: Datum[] = [];

  for (const [label, provenance] of [
    ["Particulars", enrichment?.particularsProvenance ?? null],
    ["Voyage", enrichment?.voyageProvenance ?? null],
  ] as const) {
    if (!provenance) {
      rows.push(missing(label, "UNKNOWN", "Not loaded."));
      continue;
    }
    rows.push(
      available(label, `${provenance.provider} /${provenance.endpoint}`, {
        mono: true,
        provenance: provenance.observedAt
          ? `Observed ${utc(provenance.observedAt)} · retrieved ${utc(provenance.retrievedAt)}`
          : `Retrieved ${utc(provenance.retrievedAt)} · provider gave no observation time`,
      }),
    );
  }

  return rows;
}

/**
 * The capabilities Datalastic sells and does not serve.
 *
 * Rendered so an officer looking for ownership finds a reason rather than
 * silence. Probed 29 Aug 2026: every one answered 404 on each documented
 * path and on API versions v0, v1 and v2.
 */
export function presentUnservedCapabilities(): readonly Datum[] {
  return [
    "Registered owner",
    "Operator",
    "Classification society",
    "Inspections and detentions",
    "Casualties",
    "Engine",
    "Dry dock history",
  ].map((label) => missing(label, "NOT_CONNECTED", NOT_SERVED));
}

/**
 * Fill identity rows the position report could not answer.
 *
 * `vessel_inradius` carries no call sign, so the identity panel honestly
 * reported "not in the current position report" — accurate about its own
 * source, and a contradiction once the particulars panel below it showed
 * PDSY from `vessel_info`. Two panels in one drawer disagreeing about one
 * fact teaches an officer to trust neither.
 *
 * The deeper source fills the gap and says where the value came from, so
 * the row is answered rather than merely silenced. Rows the position
 * report did answer are left alone: this closes a gap, it does not
 * override a live observation with a cached one.
 */
export function withEnrichedIdentity(
  rows: readonly Datum[],
  enrichment: VesselEnrichment | null,
): readonly Datum[] {
  const callSign = enrichment?.particulars?.callSign ?? null;
  if (!callSign) return rows;

  return rows.map((datum) =>
    datum.label === "Call sign" && datum.availability !== "AVAILABLE"
      ? available("Call sign", callSign, {
          mono: true,
          provenance: "Datalastic /vessel_info",
        })
      : datum,
  );
}
