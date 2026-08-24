/**
 * Camera intelligence — deciding when the map should move.
 *
 * ## Restraint is the whole design
 *
 * A map that recentres on every interaction is disorienting: the officer
 * loses the mental picture they were building, and the movement carries
 * no information because it happens regardless of context.
 *
 * `MapSelection.focus` already encodes the rule. Its contract says an
 * absent focus means "leave the viewport alone, which is correct for a
 * selection made by clicking" — you do not need to be flown to something
 * you just clicked on. A focus point is present when the selection came
 * from somewhere the officer is *not* already looking: a URL restore, a
 * search result, a Copilot handoff.
 *
 * So the camera moves when both hold:
 *
 *   1. the selection carries a focus point, and
 *   2. that point is not already comfortably on screen.
 *
 * Everything else is a deliberate no-op, and `reason` records which rule
 * applied so the decision is inspectable rather than mysterious.
 *
 * This module is pure. It performs no rendering and touches no map
 * instance, so the policy is testable without a WebGL context.
 */
import type { BoundingBox, LonLat } from "./types";

export interface CameraMovePlan {
  readonly move: boolean;
  /** Which rule decided this. Present whether or not the camera moves. */
  readonly reason: string;
  /** Where to go. Only meaningful when `move` is true. */
  readonly center: LonLat | null;
  /**
   * False means jump instead of animating — the reduced-motion path.
   * MapLibre's `flyTo` sets `essential: true`, which deliberately
   * overrides the OS preference, so honouring it is our responsibility
   * rather than the library's.
   */
  readonly animate: boolean;
}

const STAY: Omit<CameraMovePlan, "reason"> = { move: false, center: null, animate: false };

/**
 * Fraction of the viewport treated as edge.
 *
 * A target sitting in the outer eighth is technically visible but
 * practically hard to read, so it still earns a move. Anything further in
 * is left alone.
 */
const EDGE_INSET = 0.125;

/** Is the point within the viewport, ignoring a margin at each edge? */
export function isComfortablyVisible(
  point: LonLat,
  viewport: BoundingBox,
  inset: number = EDGE_INSET,
): boolean {
  const [[west, south], [east, north]] = viewport;
  const lonSpan = east - west;
  const latSpan = north - south;

  // A degenerate viewport tells us nothing, so it cannot vouch for
  // visibility.
  if (!(lonSpan > 0) || !(latSpan > 0)) return false;

  const lonMargin = lonSpan * inset;
  const latMargin = latSpan * inset;

  const [lon, lat] = point;
  return (
    lon >= west + lonMargin &&
    lon <= east - lonMargin &&
    lat >= south + latMargin &&
    lat <= north - latMargin
  );
}

export function planCameraMove(input: {
  /** Focus point of the new selection, if it carries one. */
  readonly focus: LonLat | null | undefined;
  /** Currently visible bounds, or null when the map has not laid out. */
  readonly viewport: BoundingBox | null;
  readonly reducedMotion: boolean;
}): CameraMovePlan {
  const { focus, viewport, reducedMotion } = input;

  if (!focus) {
    // The common case: a click. The officer is already looking at it.
    return { ...STAY, reason: "Selection carries no focus point — viewport left alone." };
  }

  const [lon, lat] = focus;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    // Never fly to NaN. A broken coordinate would send the camera to the
    // null island or throw inside the renderer.
    return { ...STAY, reason: "Focus point is not a finite coordinate — ignored." };
  }

  if (viewport && isComfortablyVisible(focus, viewport)) {
    return { ...STAY, reason: "Focus point is already on screen — no movement needed." };
  }

  return {
    move: true,
    center: focus,
    animate: !reducedMotion,
    reason: reducedMotion
      ? "Focus point is off screen — jumping, because reduced motion is requested."
      : "Focus point is off screen — easing into view.",
  };
}
