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

import { prefersReducedMotion } from "@/hooks/use-reduced-motion";

import {
  BASEMAP_STYLE,
  EmptyVesselSource,
  MAP_DEFAULTS,
  ReplayRecorder,
  type ReplaySink,
  getVesselSource,
  MapLibreRenderer,
  TIMING,
  VesselUpdateEngine,
  layerRegistry,
  mapEventBus,
  sgs,
  useMapSelector,
  useMapSessionStore,
  planCameraMove,
  selectionKey,
  DOMAIN_PRESETS,
  type MapDomain,
  type CameraMovePlan,
  type MapControlOptions,
  type MapEventBus,
  type MapRenderer,
  type SharedGeospatialService,
  type Vessel,
  type VesselSource,
} from "@/services/geospatial";

/**
 * How much of the map's chrome to show.
 *
 * A presentation choice, not a second map. Both modes mount the same
 * renderer, read the same `SharedGeospatialService`, draw the same layers
 * and write selection to the same place — `overview` simply asks for less
 * furniture, because a dashboard tile with a scale bar and a compass is a
 * command surface that happens to be small.
 */
export type MapCanvasMode = "command" | "overview" | "context";

/**
 * Development-only record of camera decisions.
 *
 * The camera policy is pure and unit-tested, but whether it is correctly
 * *wired* is a runtime question, and the renderer is deliberately not
 * reachable from the page. This publishes the decision — never the
 * renderer — so a browser check can confirm which rule fired and whether
 * it matched the officer's action.
 *
 * `import.meta.env.DEV` compiles the whole thing out of production, so
 * nothing here widens the production surface.
 */
function recordCameraDecision(
  plan: CameraMovePlan,
  selectionKeyValue: string,
  viewport: unknown,
): void {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  const scope = window as typeof window & {
    __seaphoreCamera?: { plan: CameraMovePlan; selection: string; viewport: unknown; at: number }[];
  };
  scope.__seaphoreCamera ??= [];
  scope.__seaphoreCamera.push({ plan, selection: selectionKeyValue, viewport, at: Date.now() });
  // Bounded: a long session must not accumulate an unbounded array.
  if (scope.__seaphoreCamera.length > 20) scope.__seaphoreCamera.shift();
}

const MODE_CONTROLS: Readonly<Record<MapCanvasMode, MapControlOptions>> = {
  command: { navigation: true, compass: true, scale: true },
  // Zoom only. No compass — a dashboard overview is never rotated — and no
  // scale bar, which is unreadable at tile size.
  overview: { navigation: true, compass: false, scale: false },
  // Embedded in an intelligence dashboard: zoom and a scale bar, because
  // distance matters when reading a port approach, but no compass — the
  // surrounding panels are the subject and the map stays oriented north.
  context: { navigation: true, compass: false, scale: true },
};

export interface MapCanvasProps {
  /** Presentation mode. Defaults to the full command surface. */
  readonly mode?: MapCanvasMode;
  /**
   * Intelligence domain this map is serving.
   *
   * Selects a layer preset, so the same engine shows a vessel's
   * surroundings, a manifest's ports, or a cargo corridor without three
   * copies of the map. Absent means the officer's own layer choices in
   * SGS stand, which is what the command and overview surfaces want.
   */
  readonly domain?: MapDomain;
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
  /**
   * Reports the canonical vessel set after every applied change.
   *
   * The `VesselUpdateEngine` owns the vessels; this hands out its
   * `snapshot()` so surfaces like the National Picture read the same
   * objects the map drew, rather than keeping a second store that could
   * disagree with what is on screen.
   */
  readonly onVesselsChanged?: (vessels: readonly Vessel[], feed: VesselFeedState) => void;
  /**
   * Hands out the canonical `VesselUpdateEngine` as a `ReplaySink`.
   *
   * Replay applies frames through this, so playback moves the vessels the
   * map is already drawing instead of a second copy. Narrowed to the sink
   * interface deliberately: a timeline should be able to apply frames and
   * nothing else.
   */
  readonly onEngineReady?: (engine: ReplaySink) => void;
}

/**
 * How the vessel feed itself is doing.
 *
 * Separate from the vessel array because an empty array means different
 * things in each state, and collapsing them is what turns "we could not
 * ask" into "there is nothing there".
 */
export interface VesselFeedState {
  /** True before the first response has arrived. */
  readonly loading: boolean;
  /** Set when the last attempt failed. Null on success. */
  readonly error: string | null;
  /** Source id the feed is reading, or null when none is enabled. */
  readonly sourceId: string | null;
  /** When the last successful response was applied. */
  readonly lastAppliedAt: string | null;
}

export function MapCanvas({
  mode = "command",
  domain,
  renderer: injectedRenderer,
  vesselSource,
  service = sgs,
  bus = mapEventBus,
  onVesselSelected,
  onRecorderReady,
  onVesselsChanged,
  onEngineReady,
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
        // Presentation only. The overview surface reads exactly the same
        // state from the same service — it simply shows less chrome.
        controls: MODE_CONTROLS[mode],
      })
      .then(() => {
        if (cancelled) return;
        engine.attachRenderer(renderer);
        /*
         * Apply layer state once the style is live.
         *
         * A domain lens resolves through the same `resolveVisibility` the
         * officer's own choices go through — it only supplies a different
         * set of active layers. Nothing bypasses the registry, so a layer
         * that is off for a domain is off by the same mechanism as one the
         * officer switched off, and the command surfaces are untouched
         * because they pass no domain.
         */
        const active = domain ? DOMAIN_PRESETS[domain] : service.get().activeLayers;
        for (const [id, visible] of layerRegistry.resolveVisibility(active)) {
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
    // `mode` is read at mount because controls are attached during
    // `mount()`. Listing it here remounts on a mode change, which is
    // correct: MapLibre has no API to remove a control set afterwards.
  }, [mode, domain, renderer, engine, service, setRenderer, setStatus, setError]);

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
      // The typed selection, not the deprecated vessel-only shim. Feature
      // ids are IMOs here, so it doubles as the identifier; a provider
      // that keys by something else would set `imo: null` and still
      // select correctly.
      service.select({ kind: "vessel", id: imo, imo });
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

    // Reported alongside the vessels so a consumer can tell an empty
    // fleet apart from a feed that has not answered or has failed.
    let feed: VesselFeedState = {
      loading: true,
      error: null,
      sourceId: source.id,
      lastAppliedAt: null,
    };
    const report = () => onVesselsChanged?.(engine.snapshot(), feed);
    report();

    async function refresh() {
      try {
        const vessels = await source.list();
        if (disposed) return;
        engine.applyFull(vessels);
        recorder.recordBatch(vessels);
        setVesselCount(engine.size);
        feed = {
          loading: false,
          error: null,
          sourceId: source.id,
          lastAppliedAt: new Date().toISOString(),
        };
        report();
      } catch (error: unknown) {
        if (disposed) return;
        const message = error instanceof Error ? error.message : String(error);
        // The previously loaded vessels are kept — a failed refresh does
        // not mean they left. `error` marks the picture as stale rather
        // than emptying it.
        feed = { ...feed, loading: false, error: message };
        report();
        bus.emit("map:error", {
          scope: `vessel-source:${source.id}`,
          message,
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
      feed = { ...feed, loading: false, lastAppliedAt: new Date().toISOString() };
      report();
    });

    return () => {
      disposed = true;
      clearInterval(interval);
      unsubscribe?.();
    };
  }, [source, engine, recorder, bus, setVesselCount, onVesselsChanged]);

  useEffect(() => {
    onRecorderReady?.(recorder);
  }, [recorder, onRecorderReady]);

  useEffect(() => {
    onEngineReady?.(engine);
  }, [engine, onEngineReady]);

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
    let previous = selectionKey(service.get().selection);
    return service.subscribe((state) => {
      const key = selectionKey(state.selection);
      if (key === previous) return;
      previous = key;
      engine.refreshPresentation();

      // Move the camera only when the selection came from somewhere the
      // officer is not already looking. `planCameraMove` owns that rule;
      // this block only carries out its decision.
      const viewport = renderer.getVisibleBounds?.() ?? null;
      const plan = planCameraMove({
        focus: state.selection?.focus,
        viewport,
        reducedMotion: prefersReducedMotion(),
      });
      recordCameraDecision(plan, key, viewport);
      if (!plan.move || !plan.center) return;

      if (plan.animate) renderer.flyTo?.(plan.center);
      // Reduced motion: arrive without the journey. `flyTo` sets
      // `essential: true` inside MapLibre, which overrides the OS
      // preference, so the jump has to come from here.
      else renderer.setCamera({ center: plan.center });
    });
  }, [engine, service, renderer]);

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
