/**
 * Maritime — Map canvas host.
 *
 * Owns the renderer lifecycle and wires the geospatial services together:
 * it mounts a {@link MapRenderer}, keeps layer visibility in step with the
 * Shared Geospatial Service, and feeds vessel data through the update engine.
 *
 * It deliberately contains no map-library code. The engine arrives by
 * injection, so this component is identical whether the stub or a real
 * MapLibre adapter is attached.
 */
import { useEffect, useMemo, useRef } from "react";
import { MapPinOff } from "lucide-react";

import {
  BASEMAP_STYLE,
  MAP_DEFAULTS,
  MapLibreRenderer,
  TIMING,
  VesselUpdateEngine,
  EmptyVesselSource,
  layerRegistry,
  mapEventBus,
  sgs,
  useMapSessionStore,
  type MapEventBus,
  type MapRenderer,
  type SharedGeospatialService,
  type VesselSource,
} from "@/services/geospatial";

export interface MapCanvasProps {
  /** Renderer to attach. Defaults to the MapLibre adapter (stub for now). */
  readonly renderer?: MapRenderer;
  /** Where vessels come from. Defaults to an empty source. */
  readonly vesselSource?: VesselSource;
  readonly service?: SharedGeospatialService;
  readonly bus?: MapEventBus;
}

export function MapCanvas({
  renderer: injectedRenderer,
  vesselSource,
  service = sgs,
  bus = mapEventBus,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const setRenderer = useMapSessionStore((s) => s.setRenderer);
  const setStatus = useMapSessionStore((s) => s.setStatus);
  const setVesselCount = useMapSessionStore((s) => s.setVesselCount);
  const setError = useMapSessionStore((s) => s.setError);
  const rendererDraws = useMapSessionStore((s) => s.rendererDraws);

  // Construct once per mount. Injected instances are used as given so tests
  // and Storybook can supply a stub and assert on what it received.
  const renderer = useMemo(
    () => injectedRenderer ?? new MapLibreRenderer({ bus }),
    [injectedRenderer, bus],
  );
  const source = useMemo<VesselSource>(
    () => vesselSource ?? new EmptyVesselSource(),
    [vesselSource],
  );
  const engine = useMemo(
    () =>
      new VesselUpdateEngine({
        bus,
        renderContext: () => ({ selectedImo: service.get().selectedEntityImo }),
      }),
    [bus, service],
  );

  // ── Renderer lifecycle ────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    const state = service.get();
    setRenderer(renderer.id, renderer instanceof MapLibreRenderer ? renderer.isRealEngine : true);
    setStatus("mounting");

    void renderer
      .mount({
        container,
        style: BASEMAP_STYLE,
        center: state.center,
        zoom: state.zoom,
        minZoom: MAP_DEFAULTS.minZoom,
        maxZoom: MAP_DEFAULTS.maxZoom,
        maxBounds: MAP_DEFAULTS.maxBounds,
      })
      .then(async () => {
        if (cancelled) return;
        await renderer.loadVesselIcons();
        if (cancelled) return;
        engine.attachRenderer(renderer);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
      engine.attachRenderer(null);
      renderer.destroy();
      setStatus("idle");
    };
  }, [renderer, engine, service, setRenderer, setStatus, setError]);

  // ── Layer visibility follows SGS ──────────────────────────────────────
  useEffect(
    () =>
      service.subscribe((state) => {
        for (const [renderLayerId, visible] of layerRegistry.resolveVisibility(
          state.activeLayers,
        )) {
          renderer.setLayerVisibility(renderLayerId, visible);
        }
      }),
    [renderer, service],
  );

  // ── Camera follows SGS ────────────────────────────────────────────────
  useEffect(
    () =>
      service.subscribe((state) => {
        if (!renderer.isReady()) return;
        renderer.setCamera({
          center: state.center,
          zoom: state.zoom,
          pitch: state.pitch,
          bearing: state.bearing,
        });
      }),
    [renderer, service],
  );

  // ── Vessel data: realtime where offered, polling otherwise ────────────
  useEffect(() => {
    let disposed = false;

    async function refresh() {
      try {
        const vessels = await source.list();
        if (disposed) return;
        engine.applyFull(vessels);
        setVesselCount(engine.size);
      } catch (error: unknown) {
        if (disposed) return;
        bus.emit("map:error", {
          scope: `vessel-source:${source.id}`,
          message: error instanceof Error ? error.message : String(error),
          cause: error,
        });
      }
    }

    void refresh();
    const interval = setInterval(() => void refresh(), TIMING.positionRefreshMs);

    // A source with a push channel bypasses polling for individual updates —
    // this is the path that avoids a full re-render per position report.
    const unsubscribe = source.subscribe?.((vessel) => {
      engine.applyPatch(vessel);
      setVesselCount(engine.size);
    });

    return () => {
      disposed = true;
      clearInterval(interval);
      unsubscribe?.();
    };
  }, [source, engine, bus, setVesselCount]);

  // ── Selection changes re-derive presentation, not data ────────────────
  useEffect(() => {
    let previous = service.get().selectedEntityImo;
    return service.subscribe((state) => {
      if (state.selectedEntityImo === previous) return;
      previous = state.selectedEntityImo;
      engine.refreshPresentation();
    });
  }, [engine, service]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} data-testid="map-canvas" className="absolute inset-0" />
      {!rendererDraws ? <RendererPendingNotice /> : null}
    </div>
  );
}

/**
 * Shown while no drawing engine is attached.
 *
 * Stating this plainly matters: an empty dark canvas is indistinguishable
 * from a data outage, and an officer must never mistake "no renderer
 * installed" for "no vessels in Nigerian waters".
 */
function RendererPendingNotice() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0B1F3A]">
      <div className="max-w-md px-6 text-center">
        <MapPinOff className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-semibold text-foreground">Rendering engine not installed</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          The geospatial foundation is active — shared state, layers, and the update engine are all
          running. No basemap is drawn because <code className="font-mono">maplibre-gl</code> is not
          yet a dependency. This is not a data outage.
        </p>
      </div>
    </div>
  );
}
