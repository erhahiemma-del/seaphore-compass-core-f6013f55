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
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinOff } from "lucide-react";

import { prefersReducedMotion } from "@/hooks/use-reduced-motion";
import { AssetPopup } from "./AssetPopup";
import { installMapHealthProbe } from "./health-probe";

/**
 * Selection kinds the contextual drawer renders in full.
 *
 * Kept beside the popup's mount rather than imported from the drawer so
 * this file states its own rule: these are the kinds for which a second
 * card would be a duplicate.
 */
const DRAWER_OWNED_KINDS = new Set(["vessel", "voyage"]);

/**
 * Whether the drawer is the authoritative surface for this selection.
 *
 * Only in `command` mode: Maritime Command mounts `ContextDrawer`, and
 * the compact surfaces do not — on those the card is the entire story
 * and suppressing it would leave a click with no response at all.
 */
function drawerOwns(kind: string, mode: MapCanvasMode | undefined): boolean {
  return mode === "command" && DRAWER_OWNED_KINDS.has(kind);
}

import {
  BASEMAP_STYLE,
  EmptyVesselSource,
  LIGHT_BASEMAP_STYLE,
  MAP_SCOPES,
  toVoyageEndpointCollection,
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
  type MapStylePaletteName,
  type MapScopeId,
  type SharedGeospatialService,
  type Vessel,
  type VesselSource,
  type Voyage,
} from "@/services/geospatial";
import { basemapStyleFor } from "@/services/geospatial/constants";
import { matchesFilters } from "@/services/geospatial/vessel-filter";

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
  // No built-in chrome at all: the overview surface supplies its own
  // control stack (`MapChrome`), which drives the same camera through SGS.
  // Two zoom widgets on one tile is a duplicated control, not a choice.
  overview: { navigation: false, compass: false, scale: false },
  // Embedded in an intelligence dashboard: zoom and a scale bar, because
  // distance matters when reading a port approach, but no compass — the
  // surrounding panels are the subject and the map stays oriented north.
  context: { navigation: true, compass: false, scale: true },
};

export interface MapCanvasProps {
  /** Presentation mode. Defaults to the full command surface. */
  readonly mode?: MapCanvasMode;
  /**
   * How far the map may travel.
   *
   * Absent — which is every surface — means "follow the shared map
   * state", whose default is `global`. Nigeria remains the opening
   * view via `center`/`zoom`; it is no longer a boundary.
   *
   * The prop is retained as an explicit override for a surface that
   * genuinely needs a fixed extent, and for tests. It is not how the
   * officer's own choice travels: that lives in `MapState.scope` so it
   * survives reloads, route changes and shared links.
   */
  readonly scope?: MapScopeId;
  /**
   * Voyages to overlay.
   *
   * Endpoints draw where a port genuinely resolved; arcs draw only
   * where both ends did. Absent means no voyage overlay, which is what
   * every pre-M2 surface wants.
   */
  readonly voyages?: readonly Voyage[];
  /**
   * Intelligence domain this map is serving.
   *
   * Selects a layer preset, so the same engine shows a vessel's
   * surroundings, a manifest's ports, or a cargo corridor without three
   * copies of the map. Absent means the officer's own layer choices in
   * SGS stand, which is what the command and overview surfaces want.
   */
  readonly domain?: MapDomain;
  /** Optional visual palette for embedded/overview map surfaces. */
  readonly palette?: MapStylePaletteName;
  /** Optional style URL override for tests or specialised surfaces. */
  readonly basemapStyle?: string;
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
  scope: scopeOverride,
  voyages,
  domain,
  palette = "maritime",
  basemapStyle,
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
  /** Scope of the previous successful mount. Null before the first. */
  const previousScope = useRef<MapScopeId | null>(null);
  /*
   * Scope comes from shared state unless a surface pins it.
   *
   * Subscribing here is what makes every surface globally navigable
   * without each one having to opt in — the five that pass no prop
   * simply follow `MapState.scope`.
   */
  const sharedScope = useMapSelector((state) => state.scope, service);
  const scope = scopeOverride ?? sharedScope;
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
        /*
         * Read from shared state at apply time rather than captured.
         *
         * The officer changes filters while vessels are arriving, and a
         * predicate frozen when the engine was built would keep drawing
         * the set they last excluded. One instant per pass, so every
         * vessel in a batch is measured against the same clock.
         */
        vesselFilter: () => {
          const filters = service.get().filters;
          const now = Date.now();
          return (vessel) => matchesFilters(vessel, filters, now);
        },
      }),
    [bus, service],
  );

  /*
   * ── Post-deploy health probe ──────────────────────────────────────
   *
   * Reads live, on demand, rather than pushing a cached snapshot: the
   * answer must describe the map as it is when asked, not as it was
   * when a render last happened.
   */
  useEffect(
    () =>
      installMapHealthProbe(() => ({
        rendererDraws,
        zoom: service.get().zoom,
        vesselCount: engine.snapshot().length,
        sources: service.get().enabledSources,
      })),
    [engine, service, rendererDraws],
  );

  // ── Renderer lifecycle ────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    const state = service.get();
    const activeScope = MAP_SCOPES[scope];
    const draws = renderer instanceof MapLibreRenderer ? renderer.isRealEngine : true;
    setRenderer(renderer.id, draws);
    setStatus("mounting");

    void renderer
      .mount({
        container,
        style: basemapStyle ?? basemapStyleFor(state.presentationMode),
        palette: state.presentationMode,
        center: state.center,
        zoom: state.zoom,
        // The camera's opening pose, restored from a shared link or a
        // reload. Read here rather than left to the camera-follow
        // subscription below, which runs before the mount resolves and
        // finds the renderer not ready.
        pitch: state.pitch,
        bearing: state.bearing,
        minZoom: activeScope.minZoom,
        maxZoom: activeScope.maxZoom,
        maxBounds: activeScope.maxBounds,
        extent: activeScope.extent,
        graticuleSteps: activeScope.graticuleSteps,
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

        /*
         * Frame the new extent after a scope change.
         *
         * Only on a *change*, never on the first mount — an officer
         * arriving with a zoom in their link must keep it. And only
         * here, after the new map exists: writing the camera at the
         * moment the toggle is clicked lands on the outgoing map, which
         * clamps it to the old scope's range. Switching from Nigerian
         * waters to Global that way settled at zoom 4.3 instead of 2,
         * so the control looked broken.
         *
         * This is not the camera policy fighting a gesture. Choosing a
         * scope is an explicit request for a different extent.
         */
        if (previousScope.current !== null && previousScope.current !== scope) {
          service.setCamera({ zoom: activeScope.zoom });
        }
        previousScope.current = scope;

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
    // `scope` is the same: bounds and zoom limits are constructor
    // arguments, so changing scope means a new map.
  }, [
    mode,
    scope,
    domain,
    palette,
    basemapStyle,
    renderer,
    engine,
    service,
    setRenderer,
    setStatus,
    setError,
  ]);

  /*
   * ── Voyage overlay ────────────────────────────────────────────────
   *
   * Projected here rather than in the renderer, because turning a
   * `Voyage` into GeoJSON is a domain decision — which endpoints
   * resolved, and whether a relationship may be drawn at all — and the
   * renderer's job is to draw features, not to adjudicate that.
   */
  useEffect(() => {
    if (!renderer.setVoyageData || !renderer.isReady()) return;
    const list = voyages ?? [];
    renderer.setVoyageData(toVoyageEndpointCollection(list));
  }, [renderer, voyages, rendererDraws]);

  /*
   * ── Projection follows the officer's view mode ────────────────────
   *
   * One call on the mounted map, not a remount. Globe is a MapLibre
   * projection, so switching costs nothing the officer has established:
   * the camera, the installed layers, the selection and the focused
   * subject are all state this effect never touches.
   */
  const viewMode = useMapSelector((state) => state.viewMode, service);
  useEffect(() => {
    if (!renderer.isReady()) return;
    renderer.setProjection(viewMode);
  }, [renderer, viewMode, rendererDraws]);

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
    const offVoyageClick = bus.on("voyage:click", ({ voyageId, voyageNumber }) => {
      service.select({ kind: "voyage", id: voyageId, voyageNumber });
    });
    /*
     * Ports and anchorages select through the same path as vessels.
     *
     * The typed union keeps a port id from ever being read as a vessel
     * id, and there is still exactly one selection: SGS. The contextual
     * card below is a projection of that state, not a second store.
     *
     * The port is identified by UN/LOCODE rather than main's generic
     * `portId`: it is the key the source already promotes, and the one
     * the gazetteer, the voyage records and the canonical port model all
     * share. `focus` carries the clicked position so a selection restored
     * from a URL knows where to look; `planCameraMove` still decides
     * whether moving there is warranted.
     */
    const offPortClick = bus.on("port:click", ({ locode, position }) => {
      service.select({ kind: "port", id: locode, focus: position });
    });
    const offAnchorageClick = bus.on("anchorage:click", ({ anchorageId, portId, position }) => {
      service.select({
        kind: "anchorage",
        id: anchorageId,
        portId: portId ?? "",
        focus: position,
      });
    });
    const offMapClick = bus.on("map:click", () => {
      service.clearSelection();
      onVesselSelected?.(null);
    });
    return () => {
      offClick();
      offVoyageClick();
      offPortClick();
      offAnchorageClick();
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

  /*
   * A filter change re-projects the vessels already held.
   *
   * Nothing is re-fetched: the engine still has every vessel the source
   * reported, and narrowing is a question about which of them qualify to
   * be drawn. Re-projecting is also what makes clearing a filter
   * instant — the excluded vessels never left.
   *
   * Keyed on a serialisation of the filter state rather than its
   * identity, because the object is rebuilt on every state update and
   * comparing references would re-render the whole vessel source on any
   * camera move.
   */
  useEffect(() => {
    let previous = JSON.stringify(service.get().filters);
    return service.subscribe((state) => {
      const key = JSON.stringify(state.filters);
      if (key === previous) return;
      previous = key;
      engine.refreshPresentation();
    });
  }, [engine, service]);

  /*
   * A presentation change repaints the live map.
   *
   * `setStyle` replaces the basemap document and takes every operational
   * layer with it, so the renderer reinstalls them and announces
   * `map:style` when the new style is addressable. Vessels live in the
   * engine rather than in the style, so they are handed back then — the
   * one place that knows the source was just recreated.
   */
  useEffect(() => {
    let previous = service.get().presentationMode;
    const stop = service.subscribe((state) => {
      if (state.presentationMode === previous) return;
      previous = state.presentationMode;
      renderer.setPresentation(state.presentationMode);
    });
    const restore = bus.on("map:style", () => engine.refreshPresentation());
    return () => {
      stop();
      restore();
    };
  }, [bus, engine, renderer, service]);

  // ── Selection changes re-derive presentation, not data ────────────────
  useEffect(() => {
    let previous = selectionKey(service.get().selection);
    return service.subscribe((state) => {
      const key = selectionKey(state.selection);
      if (key === previous) return;
      previous = key;
      engine.refreshPresentation();

      /*
       * Port selection is a feature state, not a feature property.
       *
       * Vessels re-project through the update engine, which rebuilds
       * their features and carries `isSelected` with them. The ports
       * collection is a static asset that is never re-projected, so its
       * selection is written straight onto the renderer instead. Cleared
       * whenever the selection is anything other than a port — including
       * null — so a ring cannot outlive what it was ringing.
       */
      renderer.setSelectedPort?.(state.selection?.kind === "port" ? state.selection.id : null);

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

  /*
   * ── Contextual card anchoring ─────────────────────────────────────
   *
   * The card follows the object it describes, so its screen position is
   * re-projected whenever the camera moves. Selection itself still lives
   * in SGS — this is pixels only.
   */
  const selection = useMapSelector((state) => state.selection, service);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const focus = selection?.focus;
    if (!focus) {
      setAnchor(null);
      return;
    }
    const reproject = () => setAnchor(renderer.project?.(focus) ?? null);
    reproject();
    const offMove = bus.on("map:move", reproject);
    return offMove;
  }, [selection, renderer, bus]);

  const popupVessels = useMemo(
    () => (selection ? engine.snapshot() : []),
    // Re-derived on selection change only: the card is a snapshot read,
    // and re-rendering it on every position tick would fight the officer.
    [selection, engine],
  );

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} data-testid="map-canvas" className="absolute inset-0" />
      {!rendererDraws ? <RendererPendingNotice /> : null}
      {/*
        One authoritative surface per selection.

        Maritime Command mounts `ContextDrawer`, which renders the full
        vessel intelligence panel. This card was rendering the same vessel
        at the same time, so an officer selecting a ship got two panels
        stating the same identity and position — overlapping, and each
        implying the other was incomplete.

        The drawer wins where it has a renderer for the kind. The card
        stays for everything the drawer does not answer, and remains the
        whole story on surfaces that mount no drawer at all, which is why
        this is scoped by `mode` rather than deleted.
      */}
      {selection && !drawerOwns(selection.kind, mode) ? (
        <AssetPopup
          selection={selection}
          vessels={popupVessels}
          point={anchor}
          onClose={() => {
            service.clearSelection();
            onVesselSelected?.(null);
          }}
          fullMapHref={mode === "command" ? undefined : "/maritime"}
        />
      ) : null}
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
    <div className="absolute inset-0 flex items-center justify-center bg-[color:var(--navy)]">
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
