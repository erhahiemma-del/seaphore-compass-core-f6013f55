/**
 * The questions the Copilot is allowed to ask, and who answers them.
 *
 * The Copilot calls `getApproachingVessels({ region, withinHours })`. It
 * does not know whether the answer came from a simulated feed, a live
 * AIS provider, or nothing at all — which is the point. Changing
 * provider becomes a change here rather than a change to the assistant.
 *
 * Today exactly one capability is genuinely connected: vessel positions,
 * from the existing source registry. Everything else answers
 * `NOT_CONNECTED` with a reason. That is not a placeholder — it is the
 * honest state of the deployment, expressed in a form the interface can
 * render and a test can assert.
 */
import {
  listVesselSources,
  type DescribableVesselSource,
} from "@/services/geospatial/vessel-source";
import type { Vessel } from "@/services/geospatial";

import {
  available,
  isConnected,
  noRecord,
  notConnected,
  registerCapability,
  resetCapabilities,
  type Answer,
  type CapabilityId,
  type Provenance,
} from "./capabilities";

export * from "./capabilities";

/* ── Registration ────────────────────────────────────────────────────── */

/**
 * Declare what the connected providers can actually answer.
 *
 * Called once at start-up. A capability absent from this function is
 * absent from the product, and that is the intended way to read it.
 */
export function registerConnectedProviders(activeSourceIds: readonly string[]): void {
  /*
   * Registered is not the same as answering.
   *
   * This previously claimed positions from `sources[0]` — whichever
   * provider happened to register first. Global Fishing Watch registers
   * ahead of the simulation and has no API key in this deployment, so
   * the layer announced live positions from a provider that cannot
   * answer, and the Copilot inherited the claim.
   *
   * `defaultEnabled` is not the signal either: GFW is `true` while
   * unconfigured, and the simulation is `false` while working. It says
   * "on by default", not "able to answer". The honest signal is which
   * sources are actually feeding the map right now, which is what the
   * officer is looking at.
   */
  resetCapabilities();
  const active = listVesselSources().filter((source) =>
    activeSourceIds.includes(source.describe().id),
  );
  if (active.length === 0) return;

  const source = active[0];
  const descriptor = source.describe();
  const capabilities: CapabilityId[] = ["vessel.positions", "vessel.identity"];
  /*
   * Claimed from the interface rather than assumed. `history` is
   * optional on `VesselSource`, and a source that omits it is stating
   * that it keeps no archive — a claim the layer must not overrule.
   */
  if (typeof source.history === "function") capabilities.push("vessel.track");

  const provider = { id: descriptor.id, label: descriptor.label, capabilities };
  for (const capability of capabilities) registerCapability(capability, provider);
}

/* ── Queries ─────────────────────────────────────────────────────────── */

export interface ApproachingVesselsQuery {
  readonly region: string;
  readonly withinHours: number;
}

export interface ApproachingVessel {
  readonly imo: string;
  readonly name: string;
  /** Nautical miles to the boundary. Always an estimate; labelled so. */
  readonly distanceNm: number;
  /** Hours to the boundary at current speed, when speed makes it derivable. */
  readonly etaHours: number | null;
  readonly basis: "ESTIMATED";
}

/**
 * Vessels heading toward a region.
 *
 * Not implemented, and deliberately not faked. The boundary geometry and
 * the vessel feed both exist, so a distance could be computed — but an
 * ETA needs a course held over time, and the deployment's time extractor
 * does not yet read "within 24 hours" from a question. Returning
 * plausible numbers under an `ESTIMATED` label would still be answering
 * a threshold nobody parsed.
 */
export function getApproachingVessels(
  _query: ApproachingVesselsQuery,
): Answer<readonly ApproachingVessel[]> {
  return {
    availability: "NOT_CONNECTED",
    reason:
      "Approach assessment is not connected. It needs a course held over time and a parsed arrival window; neither is available from the current source.",
  };
}

export interface OwnershipRecord {
  readonly registeredOwner?: string;
  readonly operator?: string;
  readonly manager?: string;
  readonly beneficialOwner?: string;
}

export function getVesselOwnership(_imo: string): Answer<OwnershipRecord> {
  return notConnected("vessel.ownership");
}

export interface CrewRecord {
  readonly master?: string;
  readonly chiefOfficer?: string;
  readonly crewCount?: number;
}

export function getVesselCrew(_imo: string): Answer<CrewRecord> {
  return notConnected("vessel.crew");
}

export interface VoyageRecord {
  readonly originPort?: string;
  readonly destinationPort?: string;
  readonly portCalls?: readonly string[];
}

export function getVesselVoyage(_imo: string): Answer<VoyageRecord> {
  return notConnected("vessel.voyage");
}

export function getVesselCargo(_imo: string): Answer<{ readonly description?: string }> {
  return notConnected("vessel.cargo");
}

export function getVesselCompliance(_imo: string): Answer<{ readonly detentions?: number }> {
  return notConnected("vessel.compliance");
}

export function getCompanyProfile(_name: string): Answer<{ readonly name?: string }> {
  return notConnected("company.profile");
}

/**
 * A vessel's identity and position, from whichever source holds it.
 *
 * The one query with a real answer today. It takes the fleet the caller
 * already has rather than fetching again: the map is the thing holding
 * live positions, and a second retrieval path would produce a copy that
 * could disagree with what the officer is looking at.
 */
export function getVessel(imo: string, fleet: readonly Vessel[]): Answer<Vessel> {
  const source = listVesselSources()[0];
  if (!isConnected("vessel.positions") || !source) return notConnected("vessel.positions");
  const provenance = provenanceOf(source);

  const found = fleet.find((vessel) => vessel.identity.imo === imo);
  if (!found) {
    return noRecord("No vessel with that identifier is held by the connected source.", provenance);
  }
  return available(found, provenance);
}

function provenanceOf(source: DescribableVesselSource): Provenance {
  const descriptor = source.describe();
  return {
    providerId: descriptor.id,
    providerLabel: descriptor.label,
    /*
     * A simulated provider observes nothing, and saying otherwise here
     * would launder generated positions into observations one layer
     * below where anyone would look for the distinction.
     */
    kind: descriptor.type === "SIMULATED" ? "SIMULATED" : "OBSERVED",
    retrievedAt: new Date().toISOString(),
    caveat: descriptor.caveat,
  };
}
