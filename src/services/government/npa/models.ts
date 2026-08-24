/**
 * NPA canonical models.
 *
 * ## A schedule entry is an event, not a vessel
 *
 * The brief's central constraint: "Do not flatten this into only a vessel
 * record. It is a PORT SCHEDULE EVENT."
 *
 * So `PortSchedule` preserves **VESSEL → EXPECTED → PORT → TERMINAL** as
 * one object. Flattening it onto the vessel would lose the port and
 * terminal — and with them the ability to answer "what is expected at
 * Apapa tomorrow?", which is the question the dataset exists to answer.
 *
 * The same vessel can hold several schedule entries at once: expected at
 * one terminal, rotating to another. Only an event-shaped model survives
 * that.
 */

/** Where a vessel is in its call. */
export type PortCallStage =
  | "EXPECTED"
  | "APPROACHING"
  | "ARRIVED"
  | "AWAITING_BERTH"
  | "AT_BERTH"
  | "DEPARTED";

export const PORT_CALL_STAGES: readonly PortCallStage[] = [
  "EXPECTED",
  "APPROACHING",
  "ARRIVED",
  "AWAITING_BERTH",
  "AT_BERTH",
  "DEPARTED",
] as const;

export interface Port {
  readonly portId: string;
  readonly name: string;
  readonly unlocode: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface Terminal {
  readonly terminalId: string;
  readonly portId: string;
  readonly name: string;
  readonly operator: string | null;
}

export interface Berth {
  readonly berthId: string;
  readonly terminalId: string;
  readonly name: string;
  readonly lengthM: number | null;
  readonly draughtM: number | null;
}

export interface Agent {
  readonly agentId: string;
  readonly name: string;
}

/**
 * Vessel identity as NPA reports it.
 *
 * IMO is the primary key when present. Name alone is never a merge key —
 * see `entity-resolution.ts`.
 */
export interface NpaVesselRef {
  readonly name: string;
  readonly imo: string | null;
  readonly mmsi: string | null;
  readonly callSign: string | null;
  readonly lengthM: number | null;
}

/**
 * One row of the Daily Shipping Schedule, or of any of the operational
 * datasets. The relationship the brief insists on is structural here.
 */
export interface PortSchedule {
  readonly id: string;
  /** Registry source id, e.g. `"npa-shippos"`. */
  readonly source: string;
  readonly datasetId: string;

  readonly vessel: NpaVesselRef;

  readonly portId: string | null;
  readonly portName: string | null;
  readonly terminalId: string | null;
  readonly terminalName: string | null;
  readonly berthId: string | null;
  readonly berthName: string | null;

  readonly stage: PortCallStage;

  readonly eta: string | null;
  readonly etd: string | null;
  readonly arrivalDate: string | null;
  readonly berthDate: string | null;
  readonly departureDate: string | null;
  /** The schedule day this row was published for. */
  readonly scheduledDate: string | null;

  readonly agent: string | null;
  readonly cargo: string | null;
  readonly commodity: string | null;
  readonly tonnage: number | null;
  /** Port rotation, where NPA publishes it. */
  readonly rotation: string | null;
  readonly shipToFollow: string | null;
  readonly location: string | null;
  readonly status: string | null;

  /* ── Provenance. Never stripped. ─────────────────────────────── */
  readonly sourceUrl: string;
  readonly sourceRecordId: string | null;
  /** When NPA says the position was true. */
  readonly sourceTimestamp: string | null;
  readonly retrievedAt: string;
  readonly contentHash: string;
  readonly schemaVersion: string;
  /**
   * Confidence in the *record as parsed* — that the row was read
   * correctly. Not confidence that the vessel will arrive.
   */
  readonly confidence: number;
}

/**
 * A port call assembled from many observations across sources.
 *
 * The stage is derived, never asserted by one source: NPA says a vessel
 * is expected, AIS says where it is, and the lifecycle engine reconciles
 * them. Each contributing observation is retained.
 */
export interface PortCall {
  readonly id: string;
  readonly vessel: NpaVesselRef;
  readonly portId: string | null;
  readonly portName: string | null;
  readonly terminalName: string | null;

  readonly stage: PortCallStage;
  readonly stageRationale: string;
  /** Every stage the call has passed through, with when and why. */
  readonly history: readonly PortCallTransition[];

  /** Every schedule row that contributed. */
  readonly scheduleObservations: readonly PortSchedule[];
  /**
   * ETAs from every source that offered one, never reconciled into one
   * value. Conflicts are data, not noise — see the brief, §18.
   */
  readonly etaObservations: readonly EtaObservation[];

  readonly firstSeenAt: string;
  readonly lastUpdatedAt: string;
}

export interface PortCallTransition {
  readonly from: PortCallStage | null;
  readonly to: PortCallStage;
  readonly at: string;
  readonly rationale: string;
  /** Sources that supported this transition. */
  readonly sources: readonly string[];
}

/** One source's ETA. Stored alongside the others, never overwriting them. */
export interface EtaObservation {
  readonly source: string;
  readonly eta: string;
  readonly observedAt: string;
  /** Authority of the source for this claim. See `authority.ts`. */
  readonly authority: number;
}

/** Schema version stamped on every normalised record. */
export const NPA_SCHEMA_VERSION = "npa.portschedule.v1";
