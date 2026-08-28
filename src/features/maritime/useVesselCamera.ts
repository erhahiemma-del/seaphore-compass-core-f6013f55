/**
 * Centre and Follow, sharing one measurement of the usable map.
 *
 * Both need the same three facts: where the vessel is, how big the map
 * canvas is, and how much of it the drawer and the left rail are
 * covering. Measuring that in two places would let Centre and Follow
 * disagree about where "visible" ends, and the camera would take turns
 * moving the vessel to two different places.
 *
 * Every camera change goes through `navigateToCoordinates`. Nothing here
 * touches the renderer, which is what keeps the number of camera writers
 * at one however many controls end up calling this.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { sgs, type LonLat, type SharedGeospatialService } from "@/services/geospatial";
import { navigateToCoordinates } from "@/services/geospatial/navigation";

import {
  centreTargetFor,
  followShouldMove,
  isManualPan,
  type FollowState,
  type Obstructions,
  type Viewport,
} from "./vessel-camera";

export interface VesselCamera {
  readonly follow: FollowState;
  /** Put the vessel in the usable region, once. */
  readonly centre: () => void;
  readonly startFollow: () => void;
  readonly stopFollow: () => void;
  readonly resumeFollow: () => void;
}

export interface UseVesselCameraOptions {
  /** The vessel to act on, or null when nothing is selected. */
  readonly position: LonLat | null;
  /** Identity of that vessel, so follow drops when the selection changes. */
  readonly vesselId: string | null;
  /** Width of the left context column, which the map draws under. */
  readonly leftInsetPx: number;
  readonly service?: SharedGeospatialService;
}

export function useVesselCamera({
  position,
  vesselId,
  leftInsetPx,
  service = sgs,
}: UseVesselCameraOptions): VesselCamera {
  const [follow, setFollow] = useState<FollowState>("OFF");
  /** The last centre follow asked for, to tell its own moves from a pan. */
  const requested = useRef<LonLat | null>(null);

  /*
   * Following one vessel and then selecting another would otherwise
   * leave the camera chasing the new one without the officer asking.
   * Follow is per-vessel and does not survive a change of subject.
   */
  const followingId = useRef<string | null>(null);
  useEffect(() => {
    if (follow !== "OFF" && followingId.current !== vesselId) {
      setFollow("OFF");
      requested.current = null;
    }
  }, [vesselId, follow]);

  const moveTo = useCallback(
    (target: LonLat) => {
      requested.current = target;
      /*
       * The officer's zoom is preserved, explicitly.
       *
       * `navigateToCoordinates` applies a default when none is given,
       * and centring at z18 dropped the camera to z12 — destroying the
       * deep-zoom context the officer had built up, in response to a
       * button that only promised to centre. Measured in the browser:
       * z14 became z12 on the first press.
       */
      navigateToCoordinates(target, { zoom: service.get().zoom, source: "selection" }, service);
    },
    [service],
  );

  const centre = useCallback(() => {
    if (!position) return;
    const geometry = measure(service, leftInsetPx);
    if (!geometry) return;
    const target = centreTargetFor(position, geometry.viewport, geometry.obstructions);
    /*
     * `null` means the vessel is already comfortably visible. Moving
     * anyway would be a jump the officer did not need and did not
     * expect from a button that says "centre".
     */
    if (target) moveTo(target);
  }, [position, leftInsetPx, service, moveTo]);

  const startFollow = useCallback(() => {
    followingId.current = vesselId;
    setFollow("ACTIVE");
    centre();
  }, [vesselId, centre]);

  const stopFollow = useCallback(() => {
    setFollow("OFF");
    requested.current = null;
  }, []);

  const resumeFollow = useCallback(() => {
    setFollow("ACTIVE");
    requested.current = null;
    centre();
  }, [centre]);

  /*
   * The follow loop.
   *
   * Runs on vessel movement rather than on a timer, and moves the camera
   * only when the vessel would otherwise leave the usable region — so a
   * vessel crossing the middle of the map produces no camera movement at
   * all. A follow that recentred on every update would pin the vessel
   * and slide the world underneath it, which reads as broken.
   */
  useEffect(() => {
    if (follow !== "ACTIVE" || !position) return;
    const geometry = measure(service, leftInsetPx);
    if (!geometry) return;

    /*
     * A pan by the officer pauses following rather than being corrected.
     * Correcting it would mean the map refuses to go where they put it;
     * resuming automatically after a delay would mean it goes back on
     * its own. Both make the control untrustworthy.
     */
    if (isManualPan(geometry.viewport.center, requested.current)) {
      setFollow("PAUSED");
      return;
    }

    if (!followShouldMove(position, geometry.viewport, geometry.obstructions)) return;
    const target = centreTargetFor(position, geometry.viewport, geometry.obstructions);
    if (target) moveTo(target);
  }, [follow, position, leftInsetPx, service, moveTo]);

  return { follow, centre, startFollow, stopFollow, resumeFollow };
}

/**
 * The canvas and what is covering it, read from the live DOM.
 *
 * Measured rather than assumed, because the drawer's width is a design
 * decision that has already changed once — a constant here would have
 * silently started framing against the wrong number the day it went from
 * 380px to 520px.
 */
function measure(
  service: SharedGeospatialService,
  leftInsetPx: number,
): { viewport: Viewport; obstructions: Obstructions } | null {
  if (typeof document === "undefined") return null;
  const container = document.querySelector<HTMLElement>(".maplibregl-map");
  if (!container) return null;

  const rect = container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const drawer = document.querySelector<HTMLElement>("[data-testid='context-drawer']");
  const camera = service.get();

  return {
    viewport: {
      center: camera.center,
      zoom: camera.zoom,
      width: rect.width,
      height: rect.height,
    },
    obstructions: {
      // The drawer sits beside the map rather than over it, so it is only
      // an obstruction where the two actually overlap.
      right: drawer ? Math.max(0, rect.right - drawer.getBoundingClientRect().left) : 0,
      left: leftInsetPx,
      top: 0,
      bottom: 0,
    },
  };
}
