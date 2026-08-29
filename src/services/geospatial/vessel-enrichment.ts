/**
 * Deep vessel data, attached to the vessel an officer selected.
 *
 * ## What this is, and what it deliberately is not
 *
 * Two Datalastic endpoints return far more than the map carries:
 * `vessel_info` gives static particulars, `vessel_pro` gives the voyage the
 * vessel is declaring. Both are bought one vessel at a time, so they arrive
 * on selection rather than with the fleet.
 *
 * The declared voyage is **not** a row in the voyage register. That register
 * is Seaphore's own record, reconciled and persisted; this is a provider's
 * momentary account of where a ship says it is going, and it can be stale,
 * abbreviated, or simply wrong — crews leave the previous port typed in for
 * days. Writing one into the other would turn a claim into a record. So it
 * hangs off the vessel, labelled as declared, and the register may later
 * reconcile against it.
 *
 * ## The port link
 *
 * Datalastic returns a destination as free text *and* as a resolved port
 * with a UNLOCODE and a provider uuid. Only the resolved pair is used to
 * join: "LAGOS" matches Lagos in Nigeria and Lagos in Portugal, and a
 * wrong join here would put a vessel in the wrong country's port workspace.
 * When there is no resolved identifier there is no link, and that absence is
 * reported rather than papered over with a name match.
 */
import type {
  DatalasticVesselIdentity,
  DatalasticVesselVoyage,
} from "@/connectors/datalastic/types";

/**
 * Why a value is missing.
 *
 * A blank in an officer-facing panel is ambiguous in the one way that
 * matters: it cannot distinguish "the provider says this vessel has no call
 * sign" from "Seaphore never asked". These are the words used instead.
 */
export type AbsenceReason =
  /** The provider answered, and had no value for this field. */
  | "NO_RECORD"
  /** Seaphore has not requested it — not yet loaded, or not eligible. */
  | "NOT_AVAILABLE"
  /** Retrieved, but too old to state as current. */
  | "STALE"
  /** The provider failed. Distinct from having no value. */
  | "SOURCE_ERROR";

/** How a vessel's declared destination resolved to a Seaphore port. */
export type PortLinkState =
  /** Joined on a provider identifier — UNLOCODE or provider uuid. */
  | "VERIFIED"
  /**
   * The vessel declared a destination, but with nothing joinable.
   *
   * Free text only. Reported rather than name-matched, because port names
   * are not unique and a confident wrong join is worse than no join.
   */
  | "NO_VERIFIED_PORT_LINK"
  /** The vessel declared no destination at all. */
  | "NOT_DECLARED";

export interface PortLink {
  readonly state: PortLinkState;
  /** UN/LOCODE, the join key that is stable across providers. */
  readonly unlocode: string | null;
  /** Datalastic's own port id — joins within this provider only. */
  readonly providerPortUuid: string | null;
  /** Provider-resolved port name. Display only; never a join key. */
  readonly name: string | null;
  /** Officer-facing sentence when there is no verified link. */
  readonly note: string | null;
}

/** Static particulars. Every field may legitimately be absent. */
export interface VesselParticulars {
  readonly callSign: string | null;
  readonly grossTonnage: number | null;
  readonly deadweight: number | null;
  readonly teu: number | null;
  /** Metres. */
  readonly length: number | null;
  readonly breadth: number | null;
  readonly yearBuilt: number | null;
  readonly homePort: string | null;
  readonly flagName: string | null;
  /**
   * The name broadcast over AIS, when it differs from the registered name.
   *
   * Null when they agree. A difference is a signal an officer should see —
   * it is how a vessel operating under a changed identity shows up — so it
   * is surfaced only when there is something to notice.
   */
  readonly aisNameDiffers: string | null;
  /** Observed speed envelope, knots. Not design figures. */
  readonly speedAvg: number | null;
  readonly speedMax: number | null;
  /** True for a navigation aid rather than a ship. */
  readonly isNavaid: boolean | null;
}

/**
 * What the vessel says about its own voyage.
 *
 * Every field here is declared by the vessel or resolved by the provider.
 * Nothing is inferred: there is no ETA computed from speed and distance,
 * because an inferred arrival presented beside a declared one is
 * indistinguishable from it.
 */
export interface DeclaredVoyage {
  readonly departurePort: string | null;
  readonly departureUnlocode: string | null;
  readonly departedAt: string | null;
  readonly destinationText: string | null;
  readonly destinationLink: PortLink;
  /** Provider-declared ETA. Never computed. */
  readonly eta: string | null;
  readonly navigationStatus: string | null;
  /** Metres of draught at the last report. */
  readonly currentDraught: number | null;
  /** The provider's own observation time for this voyage state. */
  readonly observedAt: string | null;
}

/** Where a value came from, carried with the value itself. */
export interface EnrichmentProvenance {
  readonly provider: "Datalastic";
  /** The endpoint, so two facts from different endpoints stay separable. */
  readonly endpoint: "vessel_info" | "vessel_pro";
  readonly retrievedAt: string;
  /** The provider's own timestamp, when it gave one. */
  readonly observedAt: string | null;
}

export interface VesselEnrichment {
  readonly particulars: VesselParticulars | null;
  readonly particularsProvenance: EnrichmentProvenance | null;
  readonly voyage: DeclaredVoyage | null;
  readonly voyageProvenance: EnrichmentProvenance | null;
}

/**
 * Resolve a declared destination to something joinable.
 *
 * Order matters: UNLOCODE first because it is the identifier every other
 * maritime source also speaks, then the provider uuid which only joins
 * within Datalastic. A name alone never produces a link.
 */
export function resolvePortLink(voyage: DatalasticVesselVoyage): PortLink {
  const unlocode = voyage.destinationPortUnlocode;
  const uuid = voyage.destinationPortUuid;
  const name = voyage.destinationPort ?? voyage.destination;

  if (unlocode || uuid) {
    return { state: "VERIFIED", unlocode, providerPortUuid: uuid, name, note: null };
  }

  if (name) {
    return {
      state: "NO_VERIFIED_PORT_LINK",
      unlocode: null,
      providerPortUuid: null,
      name,
      note: `The vessel is broadcasting "${name}" as its destination, but the provider resolved no port identifier for it. Port names are not unique, so this is not linked to a Seaphore port.`,
    };
  }

  return {
    state: "NOT_DECLARED",
    unlocode: null,
    providerPortUuid: null,
    name: null,
    note: "This vessel is not declaring a destination.",
  };
}

/**
 * Whether the AIS name is worth showing.
 *
 * Only when it disagrees with the registered name — otherwise it is the
 * same string twice, and a panel full of duplicated values trains an
 * officer to stop reading it.
 */
function divergentAisName(identity: DatalasticVesselIdentity): string | null {
  const { name, nameAis } = identity;
  if (!nameAis || !name) return null;
  return nameAis.trim().toUpperCase() === name.trim().toUpperCase() ? null : nameAis;
}

export function toVesselParticulars(identity: DatalasticVesselIdentity): VesselParticulars {
  return {
    callSign: identity.callSign,
    grossTonnage: identity.grossTonnage,
    deadweight: identity.deadweight,
    teu: identity.teu,
    length: identity.length,
    breadth: identity.breadth,
    yearBuilt: identity.yearBuilt,
    homePort: identity.homePort,
    flagName: identity.flagName,
    aisNameDiffers: divergentAisName(identity),
    speedAvg: identity.speedAvg,
    speedMax: identity.speedMax,
    isNavaid: identity.isNavaid,
  };
}

export function toDeclaredVoyage(voyage: DatalasticVesselVoyage): DeclaredVoyage {
  return {
    departurePort: voyage.departurePort,
    departureUnlocode: voyage.departurePortUnlocode,
    departedAt: voyage.departedAt,
    destinationText: voyage.destination,
    destinationLink: resolvePortLink(voyage),
    eta: voyage.eta,
    navigationStatus: voyage.navigationStatus,
    currentDraught: voyage.currentDraught,
    observedAt: voyage.observedAt,
  };
}

/**
 * What Seaphore actually holds for this vessel.
 *
 * Drives the coverage card. A capability is only listed as present when a
 * value arrived — the card exists to tell an officer what is *not* known,
 * so a tick that merely means "we asked" would invert its purpose.
 */
export interface CoverageEntry {
  readonly capability: string;
  readonly present: boolean;
  /** Why it is absent. Null when present. */
  readonly reason: AbsenceReason | null;
}

/**
 * Coverage for one selected vessel.
 *
 * The unreachable Datalastic add-ons are listed with `NOT_AVAILABLE` rather
 * than omitted: an officer asking "who owns this ship?" is better served by
 * being told Seaphore cannot answer than by a panel that never mentions
 * ownership at all.
 */
export function vesselCoverage(enrichment: VesselEnrichment): ReadonlyArray<CoverageEntry> {
  const particulars = enrichment.particulars;
  const voyage = enrichment.voyage;

  const entry = (capability: string, present: boolean): CoverageEntry => ({
    capability,
    present,
    reason: present ? null : "NO_RECORD",
  });

  /* Sold by the subscription, absent from the API. Probed 29 Aug 2026. */
  const unreachable = (capability: string): CoverageEntry => ({
    capability,
    present: false,
    reason: "NOT_AVAILABLE",
  });

  return [
    entry("Vessel particulars", particulars !== null),
    entry("Voyage", voyage !== null),
    entry("Port link", voyage?.destinationLink.state === "VERIFIED"),
    entry("Navigation status", Boolean(voyage?.navigationStatus)),
    entry("Draught", voyage?.currentDraught != null),
    unreachable("Ownership"),
    unreachable("Classification"),
    unreachable("Inspections"),
    unreachable("Casualties"),
    unreachable("Engine"),
    unreachable("Dry dock"),
    unreachable("Route"),
    unreachable("Satellite estimate"),
  ];
}
