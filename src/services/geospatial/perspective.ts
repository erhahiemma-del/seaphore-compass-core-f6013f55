/**
 * Adaptive perspective — deciding how far the camera should tilt.
 *
 * The map is a strategic 2D chart at world zoom and a spatial working
 * surface at berth zoom, and the officer should never have to ask for
 * either. Pitch follows zoom, continuously, in one direction, with no
 * mode switch anywhere along the way.
 *
 * ## Why this module is pure
 *
 * Same reasoning as `camera.ts`, which owns the *other* camera question
 * ("should we move?"). The policy is arithmetic over a zoom level; it
 * touches no map instance, so every band boundary and the whole latch
 * state machine are testable without a WebGL context. The renderer holds
 * the only code that may act on what this decides.
 *
 * ## Pitch is not a measurement
 *
 * Tilting the camera makes the existing geometry easier to read in
 * space. It adds no data, asserts no elevation, and must never be
 * confused with terrain: there is no DEM in this deployment, the ocean is
 * flat, and nothing here implies otherwise. The one thing pitch *does*
 * change is which geometry occludes which, which is why buildings enter
 * at the same zoom the tilt becomes pronounced.
 *
 * ## Who owns pitch
 *
 * Exactly one of two owners at any moment, and the transition between
 * them is one-way until an explicit reset:
 *
 *   automatic  the zoom ramp below decides
 *   manual     the officer tilted the map themselves; the ramp stands down
 *
 * An automatic system that reasserted itself after a manual tilt would
 * be a fight the officer cannot win — they tilt, they zoom, and the map
 * silently undoes their choice. So a genuine tilt gesture latches
 * ownership to `manual` and the ramp stops writing until
 * {@link planPerspectiveReset} hands control back.
 */

/** Pitch owner. See the module note on why this latches one way. */
export type PitchOwner = "automatic" | "manual";

/**
 * Hard ceiling on automatic pitch, in degrees.
 *
 * MapLibre permits 60. Fifty is where this stops, for a reason that is
 * measurable rather than aesthetic: `getBounds()` returns the bounding
 * box of the tilted view, and that box grows as the camera lies down —
 * about 1.29x taller at 35 degrees and 3x at 60. `planCameraMove` reads
 * that box to decide whether a selection is "already on screen", so a
 * steeper camera quietly makes the map less willing to move to what the
 * officer just selected. Fifty keeps that distortion modest.
 *
 * A manual tilt may still go beyond this — the officer is entitled to
 * look however they like. The ceiling binds the automatic policy only.
 */
import { MAX_CAMERA_ZOOM } from "./constants";

export const MAX_AUTOMATIC_PITCH = 50;

/**
 * The zoom→pitch ramp, as breakpoints interpolated linearly between.
 *
 * Every boundary is anchored to something real in this map rather than
 * chosen for roundness:
 *
 *   1.0   `MAP_SCOPES.global.minZoom` — the world. Flat, always.
 *   7.5   Still flat. The Gulf of Guinea home view sits at zoom 6, and
 *         M2.5's whole label, EEZ, coastline and graticule hierarchy was
 *         designed and verified at pitch 0 across that band. Tilt starts
 *         after it, not inside it.
 *   10    Tilt is established by the time street detail arrives at 11.
 *   13    The zoom at which the basemap first carries building geometry,
 *         so depth and the objects that express it appear together.
 *   18    `ZOOM_LIMITS.max`, held at the ceiling.
 */
export const PITCH_STOPS: readonly { readonly zoom: number; readonly pitch: number }[] = [
  { zoom: 1, pitch: 0 },
  { zoom: 7.5, pitch: 0 },
  { zoom: 10, pitch: 20 },
  { zoom: 13, pitch: 40 },
  { zoom: 18, pitch: MAX_AUTOMATIC_PITCH },
  /*
   * A flat final stop, carrying the ramp to the camera's ceiling.
   *
   * The tilt still reaches its maximum at 18 exactly as before — moving
   * that stop would have re-pitched the whole 13-to-18 descent, which is
   * verified behaviour and not what raising the zoom ceiling was for.
   * This extends the ramp's *domain* to the deepest zoom an officer can
   * reach and holds the pitch level across the new stretch, so the last
   * two levels are not governed by a ramp that ended before they did.
   */
  { zoom: MAX_CAMERA_ZOOM, pitch: MAX_AUTOMATIC_PITCH },
] as const;

/**
 * Automatic pitch for a zoom level, in degrees.
 *
 * Piecewise linear over {@link PITCH_STOPS}, clamped at both ends, and
 * monotonically non-decreasing by construction — the stops only ever
 * climb, so no zoom-in can ever flatten the camera and no zoom-out can
 * ever steepen it. Both halves matter: a ramp that dipped anywhere would
 * read as the map lurching for no reason.
 *
 * A non-finite zoom yields 0. Tilting on a NaN would be the one failure
 * mode with no honest recovery, and flat is the safe direction.
 */
export function pitchForZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 0;

  const first = PITCH_STOPS[0];
  const last = PITCH_STOPS[PITCH_STOPS.length - 1];
  if (zoom <= first.zoom) return first.pitch;
  if (zoom >= last.zoom) return last.pitch;

  for (let i = 1; i < PITCH_STOPS.length; i += 1) {
    const previous = PITCH_STOPS[i - 1];
    const current = PITCH_STOPS[i];
    if (zoom > current.zoom) continue;
    const span = current.zoom - previous.zoom;
    // Coincident stops would divide by zero; treat them as a step.
    if (span <= 0) return current.pitch;
    const t = (zoom - previous.zoom) / span;
    return previous.pitch + (current.pitch - previous.pitch) * t;
  }
  return last.pitch;
}

/**
 * How close counts as "already there", in degrees.
 *
 * Below this the controller does nothing at all. Without a dead band the
 * ramp would issue a camera command after every pan — `moveend` fires on
 * a pan too, and floating-point pitch never lands exactly on the target —
 * which is how a perspective system turns into an animation loop.
 */
export const PITCH_EPSILON = 0.5;

export interface PerspectivePlan {
  /** Whether the renderer should issue a pitch change at all. */
  readonly change: boolean;
  /** Target pitch in degrees. Only meaningful when `change` is true. */
  readonly pitch: number;
  /** Which rule decided this, for inspection. Always present. */
  readonly reason: string;
}

const HOLD: Omit<PerspectivePlan, "reason" | "pitch"> = { change: false };

/**
 * Decide whether the camera should tilt, given where it is now.
 *
 * Total and side-effect free. The renderer calls this once per settled
 * camera movement and does exactly what it says — it holds no policy of
 * its own.
 */
export function planPerspective(input: {
  readonly zoom: number;
  readonly currentPitch: number;
  readonly owner: PitchOwner;
}): PerspectivePlan {
  const { zoom, currentPitch, owner } = input;

  if (owner === "manual") {
    // The officer tilted the map. Their angle stands until they reset it.
    return { ...HOLD, pitch: currentPitch, reason: "Pitch is manually owned — policy stood down." };
  }

  const target = pitchForZoom(zoom);

  if (!Number.isFinite(currentPitch)) {
    return {
      change: true,
      pitch: target,
      reason: "Current pitch is unreadable — resetting to ramp.",
    };
  }

  if (Math.abs(target - currentPitch) < PITCH_EPSILON) {
    return {
      ...HOLD,
      pitch: currentPitch,
      reason: "Pitch already matches the ramp — no movement.",
    };
  }

  return {
    change: true,
    pitch: target,
    reason: `Zoom ${zoom.toFixed(2)} calls for ${target.toFixed(1)}°.`,
  };
}

/**
 * Hand pitch back to the automatic policy.
 *
 * Derives the angle from the *current* zoom rather than restoring
 * whatever it was before the officer took over — "reset" means "resume
 * the ramp from where I am", not "undo my session". Centre, zoom and
 * bearing are untouched by construction: this returns a pitch and
 * nothing else.
 */
export function planPerspectiveReset(zoom: number): {
  readonly owner: PitchOwner;
  readonly pitch: number;
  readonly reason: string;
} {
  const pitch = pitchForZoom(zoom);
  return {
    owner: "automatic",
    pitch,
    reason: `Reset to automatic — zoom ${Number.isFinite(zoom) ? zoom.toFixed(2) : "unknown"} calls for ${pitch.toFixed(1)}°.`,
  };
}

/**
 * Whether a camera event represents a genuine tilt by the officer.
 *
 * Two conditions, and both are necessary.
 *
 * `originalEvent` is MapLibre's own marker for "a pointer or touch drove
 * this" — verified against the live map, where a programmatic
 * `easeTo({pitch})` fires `pitchstart`, seventeen `pitch` events and
 * `pitchend` with `originalEvent` absent on every one. Without this
 * check the controller's own easing would latch the officer out of the
 * policy it just applied.
 *
 * `selfIssued` is the belt to that braces: the renderer sets it around
 * its own camera writes, so even a MapLibre version that started
 * attaching an `originalEvent` to programmatic easing could not be
 * mistaken for a gesture.
 */
export function isManualPitchGesture(
  event: { readonly originalEvent?: unknown } | undefined,
  selfIssued: boolean,
): boolean {
  if (selfIssued) return false;
  return Boolean(event?.originalEvent);
}
