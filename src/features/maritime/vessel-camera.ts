/**
 * Keeping the vessel an officer is investigating where they can see it.
 *
 * Two operations that look similar and are not. Centre is a one-time
 * instruction: the officer asked, the camera moves, and it stays where
 * it lands. Follow is a standing arrangement: the camera moves again
 * whenever the vessel would otherwise leave the usable map.
 *
 * Both compute against the *usable* region rather than the canvas.
 * Centring on the raw viewport centre puts the vessel behind a 520px
 * drawer, which is the failure this exists to avoid — the subject of the
 * investigation hidden by the panel describing it.
 *
 * ## Follow must not fight the officer
 *
 * A camera that recentres on every position update is unusable: the
 * vessel is stationary on screen and the world slides underneath. So
 * follow only acts when the vessel is about to leave a comfortable
 * region, and a manual pan pauses it outright rather than being
 * overridden a moment later. Silently resuming after a timeout is the
 * behaviour that makes officers stop trusting the control.
 */
import { framingCentreFor, isComfortablyVisible, usableRegion } from "./selected-vessel-framing";
import type { LonLat } from "@/services/geospatial";

export type FollowState =
  /** Not following. */
  | "OFF"
  /** Following, and the camera will move when the vessel drifts out. */
  | "ACTIVE"
  /** The officer panned. Following stops until they resume it. */
  | "PAUSED";

export interface Viewport {
  readonly center: LonLat;
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
}

export interface Obstructions {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Where the camera should go to put this vessel in the usable region.
 *
 * `null` when the vessel is already comfortably visible, which is what
 * makes this safe to call repeatedly: a centre that always returned a
 * target would move the map every time it was asked, including when
 * nothing needed to change.
 */
export function centreTargetFor(
  vessel: LonLat,
  viewport: Viewport,
  obstructions: Obstructions,
): LonLat | null {
  return framingCentreFor(vessel, viewport, obstructions);
}

/**
 * Whether following should move the camera for this position.
 *
 * Deliberately the same comfort test the framing correction uses. A
 * separate threshold here would mean the vessel could be "visible enough
 * to stop following" and "not visible enough for framing" at once, and
 * the two would take turns moving the camera.
 */
export function followShouldMove(
  vessel: LonLat,
  viewport: Viewport,
  obstructions: Obstructions,
): boolean {
  return !isComfortablyVisible(vessel, viewport, obstructions);
}

/**
 * Whether a camera change came from the officer rather than from follow.
 *
 * Follow moves the camera itself, so it has to be able to tell its own
 * movement from a pan. Comparing against the target it last requested is
 * the only reliable signal available without the map reporting gesture
 * provenance: if the camera sits somewhere follow did not ask for, a
 * person moved it.
 */
export function isManualPan(
  currentCentre: LonLat,
  lastRequested: LonLat | null,
  toleranceDegrees = 0.0005,
): boolean {
  if (!lastRequested) return true;
  return (
    Math.abs(currentCentre[0] - lastRequested[0]) > toleranceDegrees ||
    Math.abs(currentCentre[1] - lastRequested[1]) > toleranceDegrees
  );
}

/** The label an officer reads for each follow state. */
export const FOLLOW_LABEL: Readonly<Record<FollowState, string>> = {
  OFF: "Follow vessel",
  ACTIVE: "Following",
  PAUSED: "Follow paused",
};

/**
 * The region of the map an officer can actually use.
 *
 * Re-exported so callers get it from the same place as the rest of the
 * camera rules rather than reaching into the framing module and
 * gradually growing a second set of margins.
 */
export { usableRegion };
