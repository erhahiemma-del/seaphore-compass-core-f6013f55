/**
 * Where a vessel has been, and what happened on the way.
 *
 * The map has always held the present: a set of current positions, one
 * per vessel, replaced as reports arrive. Replay works on a recording of
 * that stream, so it can only ever show what this session watched happen.
 * An officer asking "where did this ship come from" is asking a question
 * the map has no shape for.
 *
 * This is that shape. It is deliberately a *retrieval* model rather than
 * a store: history belongs to whoever holds the archive, and copying it
 * into the map would create a second, staler copy of the record an
 * investigation depends on.
 *
 * ## Nothing here invents a track
 *
 * A source that keeps no history returns nothing, and the officer is told
 * the history is unavailable. That is a different statement from "this
 * vessel did not move", and the two must never collapse — an absent
 * archive rendered as an empty track would show a ship that sat still,
 * which is a claim about the world drawn from a gap in a database.
 */
import type { PositionKind } from "./position-provenance";
import type { LonLat } from "./types";

/**
 * One point on a recorded track.
 *
 * Carries its own provenance because a track is very often mixed: reports
 * at intervals, with whatever joins them. A single label on the whole
 * path would have to describe the weakest segment, losing the fact that
 * most of it is evidence.
 */
export interface VesselTrackPoint {
  readonly position: LonLat;
  /** ISO-8601. */
  readonly timestamp: string;
  /** Course over ground, degrees true. Absent when nobody reported one. */
  readonly heading?: number;
  /** Speed over ground in knots. Absent when nobody reported one. */
  readonly speed?: number;
  readonly kind: PositionKind;
}

/**
 * Things that happened, as distinct from places the vessel was.
 *
 * An event is an interpretation of a track — "this vessel loitered" is a
 * judgement about a sequence of positions, not an observation. So each
 * carries how it was arrived at, and the interface must not present a
 * derived event with the same authority as a reported one.
 */
export type VesselEventKind =
  | "DEPARTED_PORT"
  | "ARRIVED"
  | "ANCHORED"
  | "AIS_GAP"
  | "SPEED_CHANGE"
  | "LOITERING"
  | "ENTERED_AREA"
  | "INCIDENT";

export interface VesselMovementEvent {
  readonly id: string;
  readonly kind: VesselEventKind;
  /** ISO-8601. When the event began. */
  readonly at: string;
  /** For events with duration — an AIS gap, a period of loitering. */
  readonly until?: string;
  /** Where it happened, when the event has a place. */
  readonly position?: LonLat;
  /** One line an officer reads in a timeline. */
  readonly summary: string;
  /**
   * Whether a source reported this event or Seaphore derived it.
   *
   * "Reported" means the archive contains the event itself — a port call
   * record, a logged incident. "Derived" means Seaphore inferred it from
   * positions, and the inference can be wrong in ways a report cannot.
   * An officer building a case needs to know which they are citing.
   */
  readonly basis: "reported" | "derived";
}

/**
 * A vessel's history, or an honest account of why there isn't one.
 *
 * A result type rather than an array, because "no history held" and "no
 * movement in this window" are different answers and an empty array
 * cannot tell them apart. That ambiguity is exactly how a gap in
 * collection ends up drawn as a stationary ship.
 */
export type VesselHistory =
  | {
      readonly status: "available";
      readonly track: readonly VesselTrackPoint[];
      readonly events: readonly VesselMovementEvent[];
      /** The window actually covered, which may be narrower than requested. */
      readonly from: string;
      readonly to: string;
    }
  | {
      readonly status: "unavailable";
      /**
       * Officer-facing, and never a transport detail.
       *
       * "Historical movement is unavailable from the connected source",
       * not a status code or a URL. The officer is being told what
       * Seaphore can and cannot show them.
       */
      readonly reason: string;
    };

/** Window of interest. Both ends optional — a source may cap its own range. */
export interface VesselHistoryQuery {
  /** ISO-8601. */
  readonly from?: string;
  readonly to?: string;
  /** Cap on returned points. Sources should thin server-side, not truncate. */
  readonly limit?: number;
}

/**
 * The weakest claim a track makes about itself.
 *
 * A path that is nine-tenths reported and one-tenth projected is not a
 * reported path, and labelling it as one would let a projection be cited
 * as evidence.
 */
export function trackContainsUnobserved(track: readonly VesselTrackPoint[]): boolean {
  return track.some((point) => point.kind !== "OBSERVED");
}

/** Only the points a source actually reported. */
export function observedPoints(track: readonly VesselTrackPoint[]): readonly VesselTrackPoint[] {
  return track.filter((point) => point.kind === "OBSERVED");
}
