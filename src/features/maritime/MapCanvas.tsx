/**
 * Maritime — Map canvas host.
 *
 * Owns the renderer lifecycle and wires the geospatial services together: it
 * mounts a {@link MapRenderer}, keeps layer visibility and opacity in step with
 * the Shared Geospatial Service, feeds vessel data through the update engine,
 * and translates bus events back into SGS state.
 *
 * It holds no map state. Selection identity lives in SGS; this component only
 * looks the selected vessel's data up from the update engine and hands it to
 * the parent for display.
 */
import { useEffect, useMemo, useRef } from "react";
import { MapPinOff } from "lucide-react";

import {
  BASEMAP_STYLE,
  EmptyVesselSource,
  MAP_DEFAULTS,
  ReplayRecorder,
  getVesselSource,
  MapLibreRenderer,
  TIMING,
  VesselUpdateEngine,
  layerRegistry,
  mapEventBus,
  sgs,
  useMapSelector,
  useMapSessionStore,
  type MapEventBus,
  type MapRenderer,
  type SharedGeospatialService,
  type Vessel,
  type VesselSource,
} from "@/services/geospatial";

export interface MapCanvasProps {
  /** Renderer to attach. Defaults to the MapLibre adapter. */
  readonly renderer?: MapRenderer;
  /** Where vessels come from. Defaults to an empty source. */
  readonly vesselSource?: VesselSource;
  readonly service?: SharedGeospatialService;
  readonly bus?: MapEventBus;
  /** Called with the selected vessel's data, or null when deselected. */
  readonly onVesselSelected?: (vessel: Vessel | null) => void;
  /**
   * Receives the live recorder once mounted, so a timeline surface can
   * construct a ReplayPlayer over it without a second data path.
   */
  readonly onRecorderReady?: (recorder: ReplayRecorder) => void;
}

export function MapCanvas({
  renderer: injectedRenderer,
  vesselSource,
  service = sgs,
  bus = mapEventBus,
  onVesselSelected,
  onRecorderReady,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const setRenderer = useMapSessionStore((s) => s.setRenderer);
  const setStatus = useMapSessionStore((s) => s.setStatus);
  const setVesselCount = useMapSessionStore((s) => s.setVesselCount);
  const setError = useMapSessionStore((s) => s.setError);
  const setFps = useMapSessionStore((s) => s.setFps);
  const rendererDraws = useMapSessionStore((s) => s.rendererDraws);

  const renderer = useMemo(
    () => injectedRenderer ?? new MapLibreRenderer({ bus }),
    [injectedRenderer, bus],
  );
  // Which provider feeds the map is an SGS decision, not a component one:
  // the first ENABLED registered source wins, so the Sources panel toggle
  // drives the live feed. Falls back to the empty source, which renders the
  // honest "no data, and here is why" state.
  const enabledCsv = useMapSelector((state) => state.enabledSources.join(","), service);
  const source = useMemo<VesselSource>(() => {
    if (vesselSource) return vesselSource;
    for (const id of enabledCsv ? enabledCsv.split(",") : []) {
      const registered = getVesselSource(id);
      if (registered) return registered;
    }
    return new EmptyVesselSource();
  }, [vesselSource, enabledCsv]);
  // Records exactly what the map was shown. Fed from the same accepted
  // observations the update engine receives — never a parallel copy — so a
  // recording can only ever contain what an officer actually saw.
  const recorder = useMemo(() => new ReplayRecorder(), []);

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
    const draws = renderer instanceof MapLibreRenderer ? renderer.isRealEngine : true;
    setRenderer(renderer.id, draws);
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
      .then(() => {
        if (cancelled) return;
        engine.attachRenderer(renderer);
        // Apply current layer state once the style is live.
        for (const [id, visible] of layerRegistry.resolveVisibility(service.get().activeLayers)) {
          renderer.setLayerVisibility(id, visible);
        }
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

  // ── Layer visibility and opacity follow SGS ───────────────────────────
  useEffect(
    () =>
      service.subscribe((state) => {
        for (const [renderLayerId, visible] of layerRegistry.resolveVisibility(
          state.activeLayers,
        )) {
          renderer.setLayerVisibility(renderLayerId, visible);
        }
        for (const layer of layerRegistry.list()) {
          const opacity = state.layerOpacity[layer.id];
          if (opacity === undefined || !renderer.setLayerOpacity) continue;
          for (const renderLayerId of layer.renderLayerIds) {
            renderer.setLayerOpacity(renderLayerId, opacity);
          }
        }
      }),
    [renderer, service],
  );

  // ── Camera follows SGS, but never fights the user's own gesture ───────
  useEffect(() => {
    let applying = false;
    const offMove = bus.on("map:move", (camera) => {
      // Echo the map's own movement into SGS without re-driving the camera.
      applying = true;
      service.setCamera(camera);
      applying = false;
    });
    const offState = service.subscribe((state) => {
      if (applying || !renderer.isReady()) return;
      renderer.setCamera({
        center: state.center,
        zoom: state.zoom,
        pitch: state.pitch,
        bearing: state.bearing,
      });
    });
    return () => {
      offMove();
      offState();
    };
  }, [renderer, service, bus]);

  // ── Interaction → SGS ─────────────────────────────────────────────────
  useEffect(() => {
    const offClick = bus.on("vessel:click", ({ imo }) => {
      service.selectEntity(imo, imo);
      onVesselSelected?.(engine.get(imo) ?? null);
    });
    const offMapClick = bus.on("map:click", () => {
      service.clearSelection();
      onVesselSelected?.(null);
    });
    return () => {
      offClick();
      offMapClick();
    };
  }, [bus, service, engine, onVesselSelected]);

  // ── Vessel data: realtime where offered, polling otherwise ────────────
  useEffect(() => {
    let disposed = false;

    async function refresh() {
      try {
        const vessels = await source.list();
        if (disposed) return;
        engine.applyFull(vessels);
        recorder.recordBatch(vessels);
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

    const unsubscribe = source.subscribe?.((vessel) => {
      engine.applyPatch(vessel);
      recorder.record(vessel);
      setVesselCount(engine.size);
    });

    return () => {
      disposed = true;
      clearInterval(interval);
      unsubscribe?.();
    };
  }, [source, engine, recorder, bus, setVesselCount]);

  useEffect(() => {
    onRecorderReady?.(recorder);
  }, [recorder, onRecorderReady]);

  // ── Frame-rate sampling (development telemetry) ───────────────────────
  useEffect(() => {
    if (!renderer.getFps) return;
    // One sample per second: enough for an operator-visible readout, far too
    // coarse to affect the render loop it is measuring.
    const interval = setInterval(() => setFps(renderer.getFps?.() ?? null), 1_000);
    return () => {
      clearInterval(interval);
      setFps(null);
    };
  }, [renderer, setFps]);

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
 * An empty dark canvas is indistinguishable from a data outage, and an officer
 * must never mistake "no renderer" for "no vessels in Nigerian waters".
 */
function RendererPendingNotice() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0B1F3A]">
      <div className="max-w-md px-6 text-center">
        <MapPinOff className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-semibold text-foreground">Rendering engine unavailable</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          The geospatial foundation is active — shared state, layers, and the update engine are all
          running. This is not a data outage.
        </p>
      </div>
    </div>
  );
}
