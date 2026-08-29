/**
 * Turning a vessel's declared destination into a port an officer can open.
 *
 * ## The two ways this fails, which must not look the same
 *
 * A destination can fail to become a port for two unrelated reasons, and
 * they need different responses from an officer:
 *
 *   - The provider resolved no port identifier at all. Nothing can be done
 *     with that; the vessel is broadcasting free text.
 *   - The provider resolved a real port, and Seaphore's gazetteer is
 *     Nigerian-only, so a vessel bound for Kamsar in Guinea has a perfectly
 *     good UNLOCODE that this deployment cannot open.
 *
 * The second is a coverage limit of Seaphore, not a defect in the
 * declaration, and reporting it as "no port link" would blame the vessel
 * for Seaphore's gazetteer.
 *
 * ## Why the name is never used
 *
 * The join is on UNLOCODE. Port names are not unique — "LAGOS" is a port in
 * Nigeria and a port in Portugal — so opening a workspace on a name match
 * could put a vessel in the wrong country's port. When there is no code
 * there is no target.
 */
import { findNigerianPort, type CanonicalPort } from "./nigerian-ports";
import type { MapSelection } from "./selection";
import type { DeclaredVoyage } from "./vessel-enrichment";

export type PortTargetState =
  /** A canonical port exists and can be selected. */
  | "AVAILABLE"
  /** The vessel declared no destination at all. */
  | "NOT_DECLARED"
  /** Declared, but the provider resolved no identifier to join on. */
  | "NO_IDENTIFIER"
  /**
   * A real port, outside this deployment's gazetteer.
   *
   * The declaration is fine; Seaphore's coverage is the limit.
   */
  | "OUTSIDE_COVERAGE";

export interface PortTarget {
  readonly state: PortTargetState;
  /** The selection to dispatch. Non-null only when `AVAILABLE`. */
  readonly selection: MapSelection | null;
  readonly port: CanonicalPort | null;
  readonly unlocode: string | null;
  /** Name as the provider gave it. Display only, never a join key. */
  readonly declaredName: string | null;
  /** Officer-facing sentence when the port cannot be opened. */
  readonly note: string | null;
}

const NOTHING = {
  selection: null,
  port: null,
  unlocode: null,
} as const;

/**
 * Resolve the port a declared voyage is heading for.
 *
 * Pure: it produces a selection rather than dispatching one, so the same
 * answer can be rendered, tested, and acted on without three copies of the
 * decision.
 */
export function destinationPortTarget(voyage: DeclaredVoyage | null): PortTarget {
  if (!voyage) {
    return {
      ...NOTHING,
      state: "NOT_DECLARED",
      declaredName: null,
      note: "No voyage has been loaded for this vessel.",
    };
  }

  const link = voyage.destinationLink;

  if (link.state === "NOT_DECLARED") {
    return {
      ...NOTHING,
      state: "NOT_DECLARED",
      declaredName: null,
      note: "This vessel is not declaring a destination.",
    };
  }

  if (!link.unlocode) {
    return {
      ...NOTHING,
      state: "NO_IDENTIFIER",
      declaredName: link.name,
      note: link.name
        ? `The vessel is broadcasting "${link.name}", but no port identifier was resolved for it. Port names are not unique, so this cannot be opened as a port.`
        : "No port identifier was resolved for this destination.",
    };
  }

  const port = findNigerianPort(link.unlocode);
  if (!port) {
    return {
      ...NOTHING,
      state: "OUTSIDE_COVERAGE",
      unlocode: link.unlocode,
      declaredName: link.name,
      note: `${link.name ?? link.unlocode} (${link.unlocode}) is a recognised port, but it is outside this deployment's port register. The declaration is not in question — Seaphore holds no record for it.`,
    };
  }

  return {
    state: "AVAILABLE",
    // Selected by UN/LOCODE, which is what the port panel resolves on.
    selection: { kind: "port", id: port.locode },
    port,
    unlocode: link.unlocode,
    declaredName: link.name,
    note: null,
  };
}

/**
 * Resolve the port a declared voyage departed from.
 *
 * `vessel_pro` gives the departure as a name and a UNLOCODE but no
 * provider uuid, so this resolves on the code alone — which is the join
 * that matters anyway. The states mean exactly what they mean for a
 * destination, so an officer reads both halves of a voyage the same way.
 *
 * Reuses {@link destinationPortTarget} by presenting the departure in the
 * shape it already understands, rather than growing a second copy of the
 * same decision that could drift.
 */
export function departurePortTarget(voyage: DeclaredVoyage | null): PortTarget {
  if (!voyage) return destinationPortTarget(null);

  return destinationPortTarget({
    ...voyage,
    destinationText: voyage.departurePort,
    destinationLink: {
      state: voyage.departureUnlocode
        ? "VERIFIED"
        : voyage.departurePort
          ? "NO_VERIFIED_PORT_LINK"
          : "NOT_DECLARED",
      unlocode: voyage.departureUnlocode,
      // The provider does not return a uuid for the departure leg.
      providerPortUuid: null,
      name: voyage.departurePort,
      note: null,
    },
  });
}
