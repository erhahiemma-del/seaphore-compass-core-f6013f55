/**
 * Spatial reading — where the pointer is, and where the officer pinned.
 *
 * A precision instrument rather than a grid. The guides are hairlines at
 * low opacity that appear while the officer is working the map and fade
 * when they stop; a permanent crosshair over an operational picture reads
 * as a targeting reticle and competes with the vessels it is supposed to
 * help locate.
 *
 * ## It reads the camera, it does not drive it
 *
 * Position is computed from `MapState` with Web Mercator arithmetic, so
 * this holds no map reference and cannot become a second thing that
 * knows where the camera is. When a pinned coordinate is used as a
 * destination it goes through `navigateToCoordinates`, which is the
 * canonical path — there is no camera call here.
 *
 * ## Pointer work stays off React's render path
 *
 * Mouse moves arrive faster than a component should re-render. The
 * pointer position is written to a ref and drawn on an animation frame;
 * only the pinned coordinate — which changes when an officer clicks — is
 * component state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { sgs, useMapSelector, type SharedGeospatialService } from "@/services/geospatial";
import { navigateToCoordinates } from "@/services/geospatial/navigation";
import type { LonLat } from "@/services/geospatial/types";

import { formatLatitude, formatLongitude, screenToLngLat } from "./coordinate-math";
import { MAP_ZONE } from "./map-zones";

/** How long the guides linger after the officer stops moving. */
const IDLE_FADE_MS = 1400;

export function CoordinateHud({
  service = sgs,
  className,
}: {
  readonly service?: SharedGeospatialService;
  readonly className?: string;
}) {
  const zoom = useMapSelector((state) => state.zoom, service);
  const lon = useMapSelector((state) => state.center[0], service);
  const lat = useMapSelector((state) => state.center[1], service);

  const [pinned, setPinned] = useState<LonLat | null>(null);
  const [live, setLive] = useState<LonLat | null>(null);
  const [active, setActive] = useState(false);

  const vRef = useRef<HTMLDivElement | null>(null);
  const hRef = useRef<HTMLDivElement | null>(null);
  const frame = useRef<number | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * Listeners go on the document, not on the map container.
   *
   * They were attached to `.maplibregl-map`, queried when this effect
   * first ran — which is before `MapCanvas` has created that element.
   * The lookup returned null, the effect returned early, and the readout
   * sat there permanently empty: mounted, visible, and wired to nothing.
   *
   * Listening at the document and resolving the container per event
   * removes the ordering dependency entirely. The guard below keeps it
   * scoped: an event that did not happen over the map is ignored.
   */
  useEffect(() => {
    let point: { x: number; y: number } | null = null;
    const mapEl = () => document.querySelector<HTMLElement>(".maplibregl-map");

    const draw = () => {
      frame.current = null;
      const container = mapEl();
      if (!point || !container) return;
      const rect = container.getBoundingClientRect();
      if (vRef.current) vRef.current.style.transform = `translateX(${point.x}px)`;
      if (hRef.current) hRef.current.style.transform = `translateY(${point.y}px)`;
      const position = screenToLngLat(point, {
        center: [lon, lat],
        zoom,
        width: rect.width,
        height: rect.height,
      });
      if (position) setLive(position);
    };

    const onMove = (event: PointerEvent) => {
      const container = mapEl();
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      // Only while the pointer is genuinely over the chart.
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      point = { x, y };
      setActive(true);
      if (idle.current) clearTimeout(idle.current);
      // Fade rather than vanish: an officer glancing away and back should
      // not have to move the pointer to get the reading again.
      idle.current = setTimeout(() => setActive(false), IDLE_FADE_MS);
      // Coalesce to one frame — pointer events outrun any sensible render.
      if (frame.current === null) frame.current = requestAnimationFrame(draw);
    };

    const onLeave = () => {
      setActive(false);
      setLive(null);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (idle.current) clearTimeout(idle.current);
    };
  }, [lon, lat, zoom]);

  /*
   * Pinning is a plain click on empty water.
   *
   * The map's own handlers claim clicks that land on a port or a vessel,
   * so this only ever fires where nothing operational was hit — which is
   * exactly when an officer means "this place", not "this thing".
   */
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const container = document.querySelector<HTMLElement>(".maplibregl-map");
      if (!container || !container.contains(event.target as Node)) return;
      const rect = container.getBoundingClientRect();
      const position = screenToLngLat(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        { center: [lon, lat], zoom, width: rect.width, height: rect.height },
      );
      if (position) setPinned(position);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [lon, lat, zoom]);

  const goToPinned = useCallback(() => {
    if (pinned) navigateToCoordinates(pinned, { source: "coordinates" }, service);
  }, [pinned, service]);

  const reading = pinned ?? live;

  return (
    <>
      {/* Guides. Pointer-transparent so they never intercept a drag. */}
      <div
        aria-hidden
        data-testid="coordinate-guides"
        className={cn(
          "pointer-events-none absolute inset-0 z-10 transition-opacity duration-300",
          active ? "opacity-100" : "opacity-0",
        )}
      >
        <div
          ref={vRef}
          className="absolute inset-y-0 left-0 w-px bg-[color:var(--color-blue)]/25"
        />
        <div ref={hRef} className="absolute inset-x-0 top-0 h-px bg-[color:var(--color-blue)]/25" />
      </div>

      <div
        data-testid="coordinate-hud"
        className={cn(
          MAP_ZONE.RIGHT_READOUT,
          "pointer-events-auto rounded-md border border-border/60 bg-background/90 px-2 py-1.5 backdrop-blur-sm",
          "font-mono text-[10px] leading-relaxed tabular-nums",
          className,
        )}
      >
        {reading ? (
          <>
            <div className="flex items-center gap-1.5">
              {pinned ? (
                <Crosshair className="h-3 w-3 text-[color:var(--color-blue)]" aria-hidden />
              ) : null}
              <span className="text-muted-foreground">{pinned ? "PINNED" : "CURSOR"}</span>
            </div>
            <div data-testid="coordinate-lat">{formatLatitude(reading[1])}</div>
            <div data-testid="coordinate-lon">{formatLongitude(reading[0])}</div>
            {pinned ? (
              <div className="mt-1 flex gap-1">
                <button
                  type="button"
                  data-testid="coordinate-goto"
                  onClick={goToPinned}
                  className="rounded bg-[color:var(--color-blue)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--color-blue)] hover:bg-[color:var(--color-blue)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue)]"
                >
                  Go here
                </button>
                <button
                  type="button"
                  aria-label="Clear pinned position"
                  data-testid="coordinate-clear"
                  onClick={() => setPinned(null)}
                  className="rounded px-1 py-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue)]"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </div>
            ) : null}
          </>
        ) : (
          // Not an error — the pointer is simply not over the map.
          <span className="text-muted-foreground">Move over the map</span>
        )}
      </div>
    </>
  );
}
