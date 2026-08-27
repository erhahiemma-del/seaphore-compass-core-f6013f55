/**
 * Keeping the vessel an officer just chose where they can see it.
 *
 * Selecting a vessel opens a 380px drawer on the right. The map keeps its
 * camera, so the canvas is unchanged and the *visible* map is now 380px
 * narrower — and a vessel that was comfortably in view can end up behind
 * the panel describing it. The officer is then reading intelligence about
 * a ship they cannot see, which breaks the one connection the whole
 * surface exists to make.
 *
 * This decides whether that happened and, if so, where the camera should
 * move. It is arithmetic only: no camera calls, no React, no map
 * reference. The caller writes through the canonical navigation path, and
 * this stays testable without mounting anything.
 *
 * ## It moves once, and only when it must
 *
 * A camera that re-centres on every position update would fight the
 * officer for control of their own map, and one that re-centres on a
 * vessel already in plain sight is a jump with no purpose. So the answer
 * is null unless the vessel is genuinely obstructed, and the caller fires
 * it on a change of selection rather than on a change of position.
 */
import { degreesPerPixel, lngLatToScreen, type Viewport } from "./coordinate-math";
import type { LonLat } from "@/services/geospatial/types";

/**
 * What is covering the map, in pixels from each edge.
 *
 * Measured by the caller from the live layout rather than assumed here —
 * a constant would be wrong the first time a panel's width changed, and
 * wrong silently.
 */
export interface MapObstructions {
  /** The context drawer. */
  readonly right: number;
  /** The control rail and the context column beside it. */
  readonly left: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Room left around the usable area before a vessel counts as safe.
 *
 * A vessel exactly on the boundary of the visible region is technically
 * visible and practically useless: its label runs off the edge and its
 * heading points at nothing. This keeps it clear of the margins.
 */
const COMFORT_MARGIN_PX = 72;

/**
 * The part of the canvas an officer can actually use.
 *
 * Exported because the answer is worth asserting on its own — most of the
 * defects in this area come from reasoning about the canvas when the
 * question was about the visible rectangle.
 */
export function usableRegion(viewport: Viewport, obstructions: MapObstructions) {
  const left = obstructions.left + COMFORT_MARGIN_PX;
  const right = viewport.width - obstructions.right - COMFORT_MARGIN_PX;
  const top = obstructions.top + COMFORT_MARGIN_PX;
  const bottom = viewport.height - obstructions.bottom - COMFORT_MARGIN_PX;
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

/**
 * Whether a position sits somewhere the officer can actually see it.
 *
 * Returns false for a degenerate viewport too: a region with no width is
 * not somewhere a vessel is visible, and treating it as "fine" would
 * suppress framing exactly when the layout is at its most cramped.
 */
export function isComfortablyVisible(
  position: LonLat,
  viewport: Viewport,
  obstructions: MapObstructions,
): boolean {
  const region = usableRegion(viewport, obstructions);
  if (region.width <= 0 || region.height <= 0) return false;
  const point = lngLatToScreen(position, viewport);
  if (!point) return false;
  return (
    point.x >= region.left &&
    point.x <= region.right &&
    point.y >= region.top &&
    point.y <= region.bottom
  );
}

/**
 * Where the camera should sit to put a vessel in the middle of what the
 * officer can see — or null when it is already fine there.
 *
 * The camera centres the *canvas*, not the usable region, so putting a
 * vessel at the centre of a drawer-narrowed map means offsetting the
 * camera by the difference between those two centres. Centring on the
 * canvas instead is the specific mistake this exists to avoid: it places
 * the vessel under the drawer's inner edge, which looks deliberate and is
 * wrong.
 *
 * Latitude is deliberately untouched. The obstructions here are vertical
 * panels, so a north-south correction would move the officer's view for
 * no reason.
 */
export function framingCentreFor(
  position: LonLat,
  viewport: Viewport,
  obstructions: MapObstructions,
): LonLat | null {
  if (isComfortablyVisible(position, viewport, obstructions)) return null;

  const region = usableRegion(viewport, obstructions);
  if (region.width <= 0 || region.height <= 0) return null;

  const usableCentreX = (region.left + region.right) / 2;
  const canvasCentreX = viewport.width / 2;
  // Positive when the usable centre sits left of the canvas centre, which
  // is what a right-hand drawer produces.
  const offsetPx = canvasCentreX - usableCentreX;

  const lon = position[0] + offsetPx * degreesPerPixel(viewport.zoom);
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return [wrapped, position[1]];
}
