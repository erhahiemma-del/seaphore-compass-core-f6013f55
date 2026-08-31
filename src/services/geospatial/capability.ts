/**
 * What Seaphore can actually do with a layer, derived rather than declared.
 *
 * ## Why this exists
 *
 * Layer status used to be a field somebody typed. That works exactly
 * until the world changes underneath it, and then it lies: the observed
 * tracks layer read "Awaiting AIS history connector" for months after the
 * connector arrived and started drawing, and the terminals layer read
 * "Unavailable" while ten terminals were on screen. Nobody edited a
 * label, because nobody was reminded to.
 *
 * A declared status is a claim about the system that the system does not
 * check. This derives the claim from facts the code can actually observe
 * — are there records, do they carry positions, is the render layer
 * installed — so a capability that starts working reports itself as
 * working without anyone remembering to say so.
 *
 * ## What cannot be derived
 *
 * A licence, a credential and an authorisation are facts about
 * agreements, not about code. Nothing in this repository can observe that
 * UNEP-WCMC has granted commercial use of the WDPA. Those stay declared,
 * and the resolver takes them as given — but it takes them as *inputs*,
 * so a blocker still has to be stated deliberately rather than being the
 * silent default a stale label decays into.
 *
 * ## The four states that were previously one
 *
 * "Unavailable" was carrying four distinct meanings, and collapsing them
 * is what let the stale statuses hide:
 *
 *   - no data exists anywhere
 *   - data exists, no geometry to draw it with
 *   - data and geometry exist, no layer built
 *   - everything exists and it is drawing
 *
 * Only the first is genuinely unavailable.
 */

/** Every status a capability can hold. */
export type CapabilityStatus =
  /** Data, geometry, layer and features — it is on the map now. */
  | "CONNECTED"
  /** Computed from other Seaphore data rather than fetched. Drawing. */
  | "DERIVED"
  /**
   * Seaphore holds the records; nothing draws them.
   *
   * Either no geometry exists for them, or the layer has not been built.
   * The distinction from `NOT_AVAILABLE` is the one that matters: the
   * data is queryable from panels, search and Copilot even though the map
   * cannot show it.
   */
  | "DATA_AVAILABLE_NOT_DRAWN"
  /** A usable source is known and nothing has been ingested yet. */
  | "READY_SOURCE_IDENTIFIED"
  /** A source exists but reaching it needs a connector nobody has built. */
  | "READY_CONNECTOR_REQUIRED"
  /** Reachable, but a credential Seaphore does not hold is required. */
  | "CREDENTIAL_REQUIRED"
  /** Reachable, but the licence forbids Seaphore's use of it. */
  | "LICENSE_REQUIRED"
  /** Reachable, but behind a registration or approval. */
  | "AUTHORIZATION_REQUIRED"
  /**
   * The records exist and no positions do.
   *
   * Distinct from `DATA_AVAILABLE_NOT_DRAWN`: that one could be drawn if
   * somebody built the layer, this one could not be drawn at all. NPA
   * names 525 berths and publishes a coordinate for none of them.
   */
  | "GEOMETRY_UNAVAILABLE"
  /** No source holds this. A statement about the world. */
  | "NOT_AVAILABLE";

/**
 * An external obstacle, which no code can observe.
 *
 * Stated rather than derived, because a licence is an agreement between
 * organisations. Taken as an input so it still has to be declared
 * deliberately.
 */
export type CapabilityBlocker =
  | "LICENSE"
  | "CREDENTIAL"
  | "AUTHORIZATION"
  | "CONNECTOR"
  /** A source has been identified and nothing has been ingested. */
  | "INGESTION";

/** The observable facts a status is derived from. */
export interface CapabilityInputs {
  /** Records exist in Seaphore — queryable from panels and search. */
  readonly hasRecords: boolean;
  /**
   * At least one record carries a position Seaphore may draw.
   *
   * Not "a coordinate exists" — a port-centroid coordinate exists for
   * nineteen terminals and may not be drawn as a terminal. This is
   * whether anything is drawable *as itself*.
   */
  readonly hasDrawableGeometry: boolean;
  /** Every render layer the definition names is installed on the map. */
  readonly layerInstalled: boolean;
  /** The layer is fed from other Seaphore data rather than a provider. */
  readonly derived?: boolean;
  /** An external obstacle, when one has been established. */
  readonly blocker?: CapabilityBlocker | null;
}

/**
 * Resolve what a capability can currently do.
 *
 * Order matters. An external blocker is checked first: if Seaphore may
 * not legally use a dataset, whether a layer happens to be installed is
 * beside the point and reporting "connected" would be worse than wrong.
 */
export function resolveCapability(inputs: CapabilityInputs): CapabilityStatus {
  const { hasRecords, hasDrawableGeometry, layerInstalled, derived, blocker } = inputs;

  /*
   * A blocker only speaks while the data is genuinely absent. Once
   * records are in Seaphore the obstacle has evidently been cleared —
   * otherwise they would not be here — and continuing to report
   * "licence required" over data that is already ingested would be its
   * own kind of stale.
   */
  if (!hasRecords && blocker) {
    switch (blocker) {
      case "LICENSE":
        return "LICENSE_REQUIRED";
      case "CREDENTIAL":
        return "CREDENTIAL_REQUIRED";
      case "AUTHORIZATION":
        return "AUTHORIZATION_REQUIRED";
      case "CONNECTOR":
        return "READY_CONNECTOR_REQUIRED";
      case "INGESTION":
        return "READY_SOURCE_IDENTIFIED";
    }
  }

  if (!hasRecords) return "NOT_AVAILABLE";

  // Records but nothing positioned: the map cannot help, the panels can.
  if (!hasDrawableGeometry) return "GEOMETRY_UNAVAILABLE";

  // Positioned records with no layer to draw them is a backlog item, not
  // a limitation of the data.
  if (!layerInstalled) return "DATA_AVAILABLE_NOT_DRAWN";

  return derived ? "DERIVED" : "CONNECTED";
}

/** What an officer is told, per status. */
export const CAPABILITY_LABELS: Readonly<Record<CapabilityStatus, string>> = {
  CONNECTED: "Connected",
  DERIVED: "Derived",
  DATA_AVAILABLE_NOT_DRAWN: "Data available — not yet drawn",
  READY_SOURCE_IDENTIFIED: "Source identified",
  READY_CONNECTOR_REQUIRED: "Connector required",
  CREDENTIAL_REQUIRED: "Credential required",
  LICENSE_REQUIRED: "Licence required",
  AUTHORIZATION_REQUIRED: "Authorisation required",
  GEOMETRY_UNAVAILABLE: "Data available — no map geometry",
  NOT_AVAILABLE: "Unavailable",
};

/**
 * Whether the layer is drawing on the map right now.
 *
 * The single question most callers need. A capability can be entirely
 * useful without being drawable — berth occupancy is in the port panel
 * and always will be — so "usable" and "on the map" are asked separately.
 */
export function isDrawing(status: CapabilityStatus): boolean {
  return status === "CONNECTED" || status === "DERIVED";
}

/**
 * Whether Seaphore holds records a panel, search or Copilot may use.
 *
 * True for the two states where the map cannot show something Seaphore
 * nonetheless knows. This is the check that stops a berth disappearing
 * from search because it has no coordinate.
 */
export function hasUsableRecords(status: CapabilityStatus): boolean {
  return (
    isDrawing(status) || status === "DATA_AVAILABLE_NOT_DRAWN" || status === "GEOMETRY_UNAVAILABLE"
  );
}

/**
 * Whether the obstacle is external to Seaphore.
 *
 * Separated because these are the only states a sprint cannot clear: no
 * amount of implementation obtains a licence.
 */
export function isExternallyBlocked(status: CapabilityStatus): boolean {
  return (
    status === "LICENSE_REQUIRED" ||
    status === "CREDENTIAL_REQUIRED" ||
    status === "AUTHORIZATION_REQUIRED"
  );
}
