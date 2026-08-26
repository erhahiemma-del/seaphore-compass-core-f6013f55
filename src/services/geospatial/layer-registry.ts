/**
 * GIP — Layer Registry.
 *
 * The catalogue of every logical layer the operational map can display, and
 * the translation from *logical* layer keys (what an officer toggles) to
 * *render* layer ids (what the map engine draws).
 *
 * That indirection is the point. One logical layer — "vessels" — is drawn by
 * four MapLibre layers (markers, headings, labels, clusters). Officers should
 * never see that, and the registry means the renderer's internal layer
 * structure can change without touching the UI or the saved state.
 *
 * Sprint G5.5.1 — the registry is a catalogue, not a renderer. It knows what
 * layers exist and how they group; it never draws anything and holds no map
 * engine reference.
 */
import { LAYER_IDS } from "./constants";

/**
 * Mission-oriented grouping shown in the Layer Panel.
 * Ordered by operational primacy: what is happening, what it means, what to do.
 */
export type LayerGroup =
  // Original three. Retained with their exact ids so every registered
  // layer keeps its group and no persisted state is invalidated.
  | "OPERATIONAL"
  | "INTELLIGENCE"
  | "ANALYSIS"
  // Phase 8 groups. Added alongside rather than replacing — the same
  // widening pattern used for `Workspace` in G6.0.
  | "VESSELS"
  | "PORTS_INFRASTRUCTURE"
  | "MARITIME_ZONES"
  | "ENVIRONMENT"
  | "TRADE_LOGISTICS"
  | "RISK_INTELLIGENCE"
  | "SATELLITE_EO"
  | "INVESTIGATIONS"
  | "GOVERNMENT_DATA";

/**
 * Display order of the groups in the panel.
 *
 * Ordered by how an officer reads the picture: what is moving, where it
 * is going, the boundaries that matter, then the interpretive layers.
 */
export const LAYER_GROUP_ORDER: readonly LayerGroup[] = [
  "VESSELS",
  "PORTS_INFRASTRUCTURE",
  "MARITIME_ZONES",
  "ENVIRONMENT",
  "TRADE_LOGISTICS",
  "RISK_INTELLIGENCE",
  "SATELLITE_EO",
  "INVESTIGATIONS",
  "GOVERNMENT_DATA",
  // Legacy groups last: any layer not yet re-grouped still renders, at
  // the bottom, rather than vanishing from the panel.
  "OPERATIONAL",
  "INTELLIGENCE",
  "ANALYSIS",
] as const;

/** Human-readable group headings. */
export const LAYER_GROUP_LABELS: Readonly<Record<LayerGroup, string>> = {
  VESSELS: "Vessels",
  PORTS_INFRASTRUCTURE: "Ports & Infrastructure",
  MARITIME_ZONES: "Maritime Zones",
  ENVIRONMENT: "Environment",
  TRADE_LOGISTICS: "Trade & Logistics",
  RISK_INTELLIGENCE: "Risk & Intelligence",
  SATELLITE_EO: "Satellite / EO",
  INVESTIGATIONS: "Investigations",
  GOVERNMENT_DATA: "Government Data",
  OPERATIONAL: "Operational",
  INTELLIGENCE: "Intelligence",
  ANALYSIS: "Analysis",
} as const;

/**
 * How current a layer's data is.
 *
 * Distinct from {@link LayerStatus}, which describes whether a connector
 * exists at all. A layer can be `ready` and `STALE` at once — wired, but
 * showing an old picture — and collapsing the two would let a stale layer
 * present as live.
 */
export type LayerFreshness =
  /** Source is connected and the data is current. */
  | "LIVE"
  /** Connected, but the newest observation is ageing. */
  | "RECENT"
  /** Deliberately historical — a replay or an archive layer. */
  | "HISTORICAL"
  /** A satellite pass. Never "live"; always carries an acquisition time. */
  | "ACQUIRED"
  /** No connector yet. Not an absence of objects in the world. */
  | "PENDING"
  /** Connected but currently failing. */
  | "UNAVAILABLE"
  /** Fixture data for development. Must never render as LIVE. */
  | "DEMO";

/** Runtime state of one layer, recomputed rather than stored. */
export interface LayerRuntimeState {
  readonly layerId: string;
  readonly freshness: LayerFreshness;
  /** Provider id behind the layer, when one is connected. */
  readonly sourceId: string | null;
  readonly sourceLabel: string | null;
  /** Age of the newest observation, ms. Null when nothing has loaded. */
  readonly ageMs: number | null;
  readonly loading: boolean;
  readonly featureCount: number | null;
  /** Populated for PENDING, UNAVAILABLE and DEMO. Officer-facing. */
  readonly note: string | null;
}

/**
 * Readiness of a layer's backing data.
 *
 * `pending-source` layers are catalogued and toggleable but have no connector
 * wired yet — the Layer Panel shows them disabled with an explanatory note
 * rather than silently rendering nothing. This is how G5.5.1 declares its own
 * integration points instead of hiding them.
 */
/**
 * Whether a layer can draw, and if not, why not.
 *
 *   ready           a connected source; the layer draws what it observes
 *   pending-source  the capability is modelled, no provider is connected
 *   unavailable     the capability cannot be offered here at all — a
 *                   licence Seaphore does not hold, or data that does not
 *                   exist in a machine-readable form
 *
 * The last two are deliberately different. "Nobody has wired this yet" is
 * a backlog item an officer can expect to see resolved; "this is not
 * something we can obtain" is a permanent answer, and collapsing them
 * would leave officers waiting for a layer that is never coming.
 *
 * Neither draws anything. A catalogue entry with no source is a statement
 * about Seaphore's collection, never about the sea.
 */
export type LayerStatus = "ready" | "pending-source" | "unavailable";

/** A logical layer an officer can switch on or off. */
export interface LayerDefinition {
  /** Logical key. Stable — it is persisted in SGS state and the URL. */
  readonly id: string;
  readonly label: string;
  /** One line explaining what the officer sees when this is on. */
  readonly description: string;
  readonly group: LayerGroup;
  /** Render-engine layer ids this logical layer controls. */
  readonly renderLayerIds: readonly string[];
  readonly defaultVisible: boolean;
  readonly status: LayerStatus;
  /** Sort order within the group. Lower is higher in the list. */
  readonly order: number;
  /** Note shown when `status` is `pending-source`. */
  readonly pendingReason?: string;
}

/** Thrown when the registry is misconfigured. */
export class LayerRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayerRegistryError";
  }
}

export class LayerRegistry {
  private readonly layers = new Map<string, LayerDefinition>();

  /**
   * Add a layer. Throws on a duplicate id — silently overwriting would let
   * two features disagree about what "vessels" means.
   */
  register(definition: LayerDefinition): this {
    if (this.layers.has(definition.id)) {
      throw new LayerRegistryError(`Layer "${definition.id}" is already registered`);
    }
    /*
     * A `ready` layer must name something to draw.
     *
     * The invariant exists so a connected layer cannot become a toggle
     * that controls nothing — an officer switching it on and seeing no
     * change would reasonably conclude the map is broken.
     *
     * It does not apply to a layer with no source. Those are catalogue
     * entries: they declare that Seaphore models the capability and
     * states why it cannot draw it yet. Requiring a render id would
     * force each one to point at a layer that does not exist, which is
     * the fake renderer this whole catalogue exists to avoid.
     */
    if (definition.status === "ready" && definition.renderLayerIds.length === 0) {
      throw new LayerRegistryError(
        `Layer "${definition.id}" is ready but declares no render layer ids`,
      );
    }
    this.layers.set(definition.id, definition);
    return this;
  }

  /**
   * The standard operational bundle — what "All" means.
   *
   * Derived, not declared: a layer is standard when it is `ready` and on
   * by default. That is already the definition of "the normal picture",
   * so expressing it as a second list would let the two drift and give
   * an officer an All chip that disagreed with what the map opened on.
   *
   * Heavy and optional layers are excluded by construction rather than by
   * a denylist. The voyage overlay pulls an 850 KB gazetteer and is
   * `defaultVisible: false`; extruded buildings draw nothing below zoom
   * 13 and are off; investigation areas are officer-drawn. None of them
   * is part of the normal picture, so none is switched on by a control
   * whose promise is "the usual layers".
   *
   * Layers with no source are excluded too, and that is the honest
   * reading of "all": turning on Weather when no provider is connected
   * would light a chip that draws nothing and tell the officer the
   * opposite of the truth.
   */
  standardLayerIds(): readonly string[] {
    return this.list()
      .filter((layer) => layer.status === "ready" && layer.defaultVisible)
      .map((layer) => layer.id);
  }

  /** Register many layers, in order. */
  registerAll(definitions: readonly LayerDefinition[]): this {
    for (const definition of definitions) this.register(definition);
    return this;
  }

  /** Remove a layer. Returns whether it was present. */
  unregister(id: string): boolean {
    return this.layers.delete(id);
  }

  has(id: string): boolean {
    return this.layers.has(id);
  }

  get(id: string): LayerDefinition | undefined {
    return this.layers.get(id);
  }

  /**
   * Look up a layer, throwing when absent. Use where a missing layer is a
   * programming error rather than a runtime condition.
   */
  require(id: string): LayerDefinition {
    const found = this.layers.get(id);
    if (!found) throw new LayerRegistryError(`Unknown layer "${id}"`);
    return found;
  }

  /** Every layer, sorted by group order then by `order`. */
  list(): readonly LayerDefinition[] {
    return [...this.layers.values()].sort((a, b) => {
      const groupDelta = LAYER_GROUP_ORDER.indexOf(a.group) - LAYER_GROUP_ORDER.indexOf(b.group);
      return groupDelta !== 0 ? groupDelta : a.order - b.order;
    });
  }

  /** Layers in one group, sorted by `order`. */
  byGroup(group: LayerGroup): readonly LayerDefinition[] {
    return this.list().filter((layer) => layer.group === group);
  }

  /** Groups that currently contain at least one layer, in display order. */
  groups(): readonly LayerGroup[] {
    return LAYER_GROUP_ORDER.filter((group) => this.byGroup(group).length > 0);
  }

  /** Logical ids of every layer visible by default. */
  defaultActiveLayers(): readonly string[] {
    return this.list()
      .filter((layer) => layer.defaultVisible)
      .map((layer) => layer.id);
  }

  /** Render-engine layer ids controlled by a logical layer. Empty if unknown. */
  renderLayerIds(id: string): readonly string[] {
    return this.layers.get(id)?.renderLayerIds ?? [];
  }

  /**
   * Resolve a set of active logical layers into a visibility instruction for
   * every known render layer.
   *
   * This is the single translation point the renderer consumes: it receives a
   * complete map of render-layer-id → visible, so it never has to reason
   * about logical grouping, and layers omitted from `activeLayers` are
   * explicitly hidden rather than left in a stale state.
   */
  resolveVisibility(activeLayers: readonly string[]): ReadonlyMap<string, boolean> {
    const active = new Set(activeLayers);
    const visibility = new Map<string, boolean>();
    for (const layer of this.layers.values()) {
      const visible = active.has(layer.id);
      for (const renderId of layer.renderLayerIds) {
        // A render layer driven by several logical layers is visible if any
        // of them is on.
        visibility.set(renderId, (visibility.get(renderId) ?? false) || visible);
      }
    }
    return visibility;
  }

  /** Logical ids in `candidate` that this registry does not know about. */
  unknownLayers(candidate: readonly string[]): readonly string[] {
    return candidate.filter((id) => !this.layers.has(id));
  }
}

/* ── Runtime state ─────────────────────────────────────────────── */

/** What a caller knows about a layer's data at this moment. */
export interface LayerObservation {
  readonly sourceId?: string | null;
  readonly sourceLabel?: string | null;
  /** Newest observation time, ISO. */
  readonly observedAt?: string | null;
  readonly loading?: boolean;
  readonly featureCount?: number | null;
  /** True when the data came from a fixture rather than a provider. */
  readonly isFixture?: boolean;
  /** True when the provider is connected but currently failing. */
  readonly failed?: boolean;
  readonly failureReason?: string | null;
}

/** Above this age a connected layer is `RECENT` rather than `LIVE`. */
export const LIVE_THRESHOLD_MS = 15 * 60 * 1000;

/**
 * Resolve a layer's runtime state.
 *
 * The order of these checks is the guarantee. A fixture is `DEMO` before
 * anything else can promote it; a layer with no connector is `PENDING`
 * before any age calculation runs; and freshness is derived from the
 * observation time rather than trusted from a caller. Nothing can reach
 * `LIVE` except a connected, non-fixture layer with a recent observation.
 *
 * That ordering is why "DEMO must never render as LIVE" and "stale must
 * never render as LIVE" are structural rather than conventions the UI is
 * asked to honour.
 */
export function resolveLayerState(
  definition: LayerDefinition,
  observation: LayerObservation = {},
  now: number = Date.now(),
): LayerRuntimeState {
  const base = {
    layerId: definition.id,
    sourceId: observation.sourceId ?? null,
    sourceLabel: observation.sourceLabel ?? null,
    loading: observation.loading ?? false,
    featureCount: observation.featureCount ?? null,
  };

  // 1. Fixture wins over everything. There is no path from here to LIVE.
  if (observation.isFixture) {
    return {
      ...base,
      freshness: "DEMO",
      ageMs: null,
      note: "Demonstration data. Not a live observation.",
    };
  }

  // 2. No connector. Absence of features here says nothing about the world.
  /*
   * Not obtainable. Reported separately from "pending" so the officer is
   * not left expecting a source that will never arrive.
   */
  if (definition.status === "unavailable") {
    return {
      ...base,
      freshness: "PENDING",
      ageMs: null,
      note:
        definition.pendingReason ??
        "This layer is not available to Seaphore. It is listed so the gap is visible, not because it is coming.",
    };
  }

  if (definition.status === "pending-source") {
    return {
      ...base,
      freshness: "PENDING",
      ageMs: null,
      note:
        definition.pendingReason ??
        "No source is connected for this layer. An empty layer reflects Seaphore's collection, not the absence of objects.",
    };
  }

  // 3. Connected but failing.
  if (observation.failed) {
    return {
      ...base,
      freshness: "UNAVAILABLE",
      ageMs: null,
      note: observation.failureReason ?? "The source for this layer is currently unavailable.",
    };
  }

  // 4. Connected, nothing loaded yet.
  const observedMs = observation.observedAt ? Date.parse(observation.observedAt) : NaN;
  if (Number.isNaN(observedMs)) {
    return {
      ...base,
      freshness: observation.loading ? "PENDING" : "UNAVAILABLE",
      ageMs: null,
      note: observation.loading
        ? "Loading."
        : "Connected, but no observation has been received for this layer.",
    };
  }

  // 5. Age decides. Never asserted by the caller.
  const ageMs = Math.max(0, now - observedMs);
  return {
    ...base,
    freshness: ageMs <= LIVE_THRESHOLD_MS ? "LIVE" : "RECENT",
    ageMs,
    note: null,
  };
}

/** Whether a layer may be presented as live. The single gate. */
export function isLive(state: LayerRuntimeState): boolean {
  return state.freshness === "LIVE";
}

/** Officer-facing freshness labels. */
export const LAYER_FRESHNESS_LABELS: Readonly<Record<LayerFreshness, string>> = {
  LIVE: "Live",
  RECENT: "Recent",
  HISTORICAL: "Historical",
  ACQUIRED: "Acquired",
  PENDING: "Pending",
  UNAVAILABLE: "Unavailable",
  DEMO: "Demo",
};

/**
 * A named bundle of layers matching an operational task.
 *
 * Presets are UI affordances, not intelligence: they set which layers are on,
 * and nothing else.
 */
export interface MissionPreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly layers: readonly string[];
}

/** Mission presets, per the Live Map guide G2 STEP 5. */
export const MISSION_PRESETS: readonly MissionPreset[] = [
  {
    id: "revenue-investigation",
    label: "Revenue Investigation",
    description: "Vessels and ports against revenue and risk exposure.",
    layers: ["vessels", "ports", "riskHeatmap", "revenueHeat"],
  },
  {
    id: "compliance-sweep",
    label: "Compliance Sweep",
    description: "Risk concentration inside the Nigerian EEZ.",
    layers: ["vessels", "ports", "riskHeatmap", "eezBoundary"],
  },
  {
    id: "navigation",
    label: "Navigation",
    description: "Traffic, ports, boundary, and weather.",
    layers: ["vessels", "ports", "eezBoundary", "weather"],
  },
  {
    id: "full-intelligence",
    label: "Full Intelligence",
    description: "Every intelligence overlay at once.",
    layers: ["vessels", "ports", "eezBoundary", "riskHeatmap", "revenueHeat", "aisTrack"],
  },
] as const;

/**
 * Domain lenses for the contextual map.
 *
 * Each names the layers one intelligence domain needs, so `/vessel`,
 * `/manifest` and `/cargo` share the engine without sharing a viewport.
 *
 * ## Only layers that are both drawn and sourced
 *
 * Two filters apply, and a layer must pass both.
 *
 * `LAYER_IDS` declares nineteen layers; `MapLibreRenderer` installs
 * eight — `aisTrack`, `revenueHeat` and the SAR layers are declared but
 * never drawn, and no track geometry exists to feed them.
 *
 * Of the eight that are drawn, `resolveVisibility` does not consult a
 * layer's `status`, so a `pending-source` layer switched on here would
 * appear enabled and render nothing. `riskHeatmap` is the trap: it draws,
 * which makes it look eligible, but its source is pending.
 *
 * Either way the officer sees an empty layer and reads it as "no
 * activity" rather than "not collected". So these presets name only
 * `ready` layers that the renderer installs, and each domain states the
 * rest as unavailable in its own copy.
 */
export const DOMAIN_PRESETS = {
  /** Where is this vessel, and what surrounds it. */
  vessel: ["vessels", "ports", "eezBoundary", "graticule"],
  /** Which ports a manifest touches, inside whose waters. */
  manifest: ["ports", "eezBoundary", "vessels", "graticule"],
  /** Where cargo moves through the port system. */
  cargo: ["ports", "eezBoundary", "graticule"],
  /** The port estate itself, and the traffic around it. */
  ports: ["ports", "anchorages", "eezBoundary", "vessels", "graticule"],
} as const satisfies Record<string, readonly string[]>;

export type MapDomain = keyof typeof DOMAIN_PRESETS;

/** The layers shipped with the Live Command Map foundation. */
export const DEFAULT_LAYERS: readonly LayerDefinition[] = [
  {
    id: "vessels",
    label: "Vessels",
    description: "Live vessel positions as heading-rotated arrows, coloured by risk.",
    group: "VESSELS",
    // `vessel-headings-layer` used to be listed here and was never
    // installed by any renderer. `setLayerVisibility` no-ops on a
    // missing layer, so it failed silently — but a registry that names
    // layers which do not exist is a registry that cannot be trusted to
    // say what the map draws.
    renderLayerIds: [
      // Confidence ring, selection ring, hull, intelligence badge and
      // label are one entity drawn in five passes — they switch as a
      // unit, because a badge or a ring surviving its own vessel would
      // be a mark with nothing under it.
      LAYER_IDS.vesselConfidence,
      LAYER_IDS.vesselSelection,
      LAYER_IDS.vessels,
      LAYER_IDS.vesselIntelligence,
      LAYER_IDS.vesselLabels,
    ],
    defaultVisible: true,
    status: "ready",
    order: 10,
  },
  {
    id: "voyages",
    label: "Voyage endpoints",
    description:
      "Recorded origin and destination ports for each voyage, drawn as points. Nothing connects them: the route taken is not known, and is not an observed vessel track.",
    group: "TRADE_LOGISTICS",
    renderLayerIds: [LAYER_IDS.voyageEndpoints, LAYER_IDS.voyageEndpointLabels],
    // Off by default. The overlay is meaningful when an officer is
    // working voyages; on the national picture it is noise, and it
    // pulls an 850 KB gazetteer that a vessel-watching session should
    // not have to pay for.
    defaultVisible: false,
    // Genuinely renderable: the `voyages` table is real, the read path
    // already exists, and the gazetteer resolves endpoints. What is
    // absent is the *path*, and that absence is carried by
    // `Voyage.pathKnown` rather than by this layer's status.
    status: "ready",
    order: 10,
  },
  {
    id: "buildings",
    label: "Buildings",
    description: "Extruded building footprints from the basemap, where the source carries them.",
    group: "PORTS_INFRASTRUCTURE",
    renderLayerIds: [LAYER_IDS.buildings],
    // Off by default. Perspective is the M2.6 headline; buildings are
    // context an officer opts into when they are inspecting a berth, and
    // they draw nothing at all below zoom 13 in any case.
    defaultVisible: false,
    // Genuinely ready: the geometry and its heights ship in the basemap
    // tiles already being downloaded. No new source, no new licence.
    status: "ready",
    order: 25,
  },
  {
    id: "graticule",
    label: "Graticule",
    description: "Latitude and longitude reference lines. Generated, not observed.",
    group: "MARITIME_ZONES",
    renderLayerIds: [LAYER_IDS.graticule],
    defaultVisible: true,
    status: "ready",
    order: 40,
  },
  {
    id: "ports",
    label: "Ports",
    description: "The seven NPA port complexes, with indicative anchorage extents.",
    group: "PORTS_INFRASTRUCTURE",
    renderLayerIds: [
      LAYER_IDS.portAnchorage,
      LAYER_IDS.portAnchorageSymbol,
      LAYER_IDS.portHalo,
      LAYER_IDS.ports,
      LAYER_IDS.portLabels,
      // The interaction ring travels with the layer it belongs to: an
      // officer who switches ports off must not be left with a teal
      // ring floating over an empty sea.
      LAYER_IDS.portSelection,
    ],
    defaultVisible: true,
    status: "ready",
    order: 20,
  },
  {
    id: "anchorages",
    label: "Anchorages",
    description:
      "Verified anchorage and pilotage waiting areas. Not an exhaustive national list — occupancy is never asserted.",
    group: "PORTS_INFRASTRUCTURE",
    renderLayerIds: [LAYER_IDS.anchorageExtent, LAYER_IDS.anchorages, LAYER_IDS.anchorageLabels],
    defaultVisible: true,
    status: "ready",
    order: 21,
  },

  {
    id: "eezBoundary",
    label: "EEZ Boundary",
    description: "Nigerian Exclusive Economic Zone, 200 nautical miles.",
    group: "MARITIME_ZONES",
    renderLayerIds: [LAYER_IDS.eezFill, LAYER_IDS.eezBoundary],
    defaultVisible: true,
    status: "ready",
    order: 30,
  },
  {
    id: "weather",
    label: "Weather",
    description: "Weather overlay affecting port approach and ETA.",
    group: "ENVIRONMENT",
    renderLayerIds: [LAYER_IDS.weatherOverlay],
    defaultVisible: false,
    status: "pending-source",
    order: 40,
    pendingReason: "Awaiting weather connector (post-G5.5.1).",
  },
  {
    id: "incidents",
    label: "Incidents",
    description: "Environmental and maritime incident reports as warning symbols.",
    group: "RISK_INTELLIGENCE",
    renderLayerIds: [LAYER_IDS.incidentReports],
    defaultVisible: false,
    status: "pending-source",
    order: 5,
    pendingReason: "NOSDRA and public maritime incident feeds are not connected.",
  },
  {
    id: "riskHeatmap",
    label: "Risk Heatmap",
    description: "Density of risk-assessed vessels.",
    group: "RISK_INTELLIGENCE",
    renderLayerIds: [LAYER_IDS.riskHeatmap],
    defaultVisible: false,
    status: "pending-source",
    order: 10,
    pendingReason: "Awaiting OSAE risk aggregation (G5.5).",
  },
  {
    id: "revenueHeat",
    label: "Revenue Exposure",
    description: "Revenue exposure concentration by area.",
    group: "TRADE_LOGISTICS",
    renderLayerIds: [LAYER_IDS.revenueHeat],
    defaultVisible: false,
    status: "pending-source",
    order: 20,
    pendingReason: "Awaiting revenue aggregation (G5.5).",
  },
  {
    id: "aisTrack",
    label: "Observed tracks",
    description:
      "Where a vessel was actually observed to go, from AIS history. Distinct from voyage relationships, which record only origin and destination.",
    group: "VESSELS",
    renderLayerIds: [LAYER_IDS.aisTrack, LAYER_IDS.aisTrackDark],
    defaultVisible: false,
    status: "pending-source",
    order: 30,
    pendingReason: "Awaiting AIS history connector (G4).",
  },
  {
    id: "vesselClusters",
    label: "Vessel Clusters",
    description: "Cluster vessels at low zoom to keep the picture readable.",
    group: "VESSELS",
    renderLayerIds: [LAYER_IDS.vesselClusters, LAYER_IDS.clusterCount],
    defaultVisible: false,
    // Was `ready`, and no renderer has ever installed either layer — so
    // the Layer Panel offered a toggle that did nothing at all.
    //
    // Clustering is not a small change here. MapLibre clusters at the
    // source, and the vessel source is declared with `promoteId: "imo"`
    // so that `updateData` can address one vessel by IMO. A clustered
    // source cannot do that, so clustering means a second source, a
    // second write path, and a rule for which one owns selection. That
    // is its own sprint; until then this says so.
    status: "pending-source",
    order: 10,
    pendingReason:
      "No renderer implementation. MapLibre clusters at the source, which is incompatible with the promoteId-addressed incremental updates the vessel source relies on; clustering needs a second source and a selection rule.",
  },
  {
    id: "investigArea",
    label: "Investigation Area",
    description: "Officer-drawn area of interest.",
    group: "INVESTIGATIONS",
    renderLayerIds: [LAYER_IDS.investigArea],
    defaultVisible: false,
    status: "ready",
    order: 20,
  },
  {
    id: "sarDetections",
    label: "SAR Detections",
    description:
      "Objects detected in Sentinel-1 radar imagery. Snapshots at acquisition time, not live positions.",
    group: "SATELLITE_EO",
    renderLayerIds: [LAYER_IDS.sarDetections, LAYER_IDS.sarDetectionLabels],
    defaultVisible: false,
    status: "pending-source",
    order: 40,
    // Scene search works once Copernicus credentials are set; detection
    // does not, and without it there is nothing to draw. Stated as the
    // real blocker rather than as "coming soon".
    pendingReason:
      "No SAR ship-detection service is configured. Sentinel-1 scenes can be catalogued, but the imagery is not processed, so no detections exist to plot.",
  },
  {
    id: "sarSceneFootprints",
    label: "SAR Coverage",
    description:
      "Footprints of Sentinel-1 acquisitions, showing where the satellite actually looked and when.",
    group: "SATELLITE_EO",
    renderLayerIds: [LAYER_IDS.sarSceneFootprints],
    defaultVisible: false,
    status: "pending-source",
    order: 30,
    pendingReason: "Awaiting Copernicus credentials (COPERNICUS_USERNAME / COPERNICUS_PASSWORD).",
  },
  {
    id: "darkContactAreas",
    label: "Dark Contact Areas",
    description:
      "Where a vessel in an AIS gap could have reached, bounded by its last reported speed.",
    group: "RISK_INTELLIGENCE",
    renderLayerIds: [LAYER_IDS.darkContactAreas],
    defaultVisible: false,
    status: "pending-source",
    order: 40,
    pendingReason:
      "Requires an AIS history source; Datalastic is registered but not wired, and SeaVantage is not implemented.",
  },

  /*
   * The rest of the catalogue, registered without a renderer.
   *
   * The capability model was eight layers wide while the product
   * describes about forty. That gap was invisible: an officer could not
   * tell whether "Restricted Zones" was absent because Seaphore cannot
   * draw them or because nobody had asked for them. Listing every layer
   * with a status and a reason makes the gap a fact on the screen
   * rather than a backlog item nobody outside the team can see.
   *
   * None of these draws anything. An empty renderLayerIds is the honest
   * expression of that: there is no renderer to point at, so no fake one
   * can appear behind the toggle.
   */
  {
    id: "nigeria-eez",
    label: "Nigeria EEZ",
    description: "The declared Exclusive Economic Zone boundary and its fill.",
    group: "MARITIME_ZONES",
    renderLayerIds: [LAYER_IDS.eezBoundary, LAYER_IDS.eezFill],
    defaultVisible: true,
    status: "ready",
    order: 5,
  },
  {
    id: "terminals",
    label: "Terminals",
    description: "Terminal footprints inside each port complex.",
    group: "PORTS_INFRASTRUCTURE",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 12,
    pendingReason:
      "The ports table records terminal names as text; no geometry exists to draw them from.",
  },
  {
    id: "berths",
    label: "Berths",
    description: "Individual berths and their occupancy.",
    group: "PORTS_INFRASTRUCTURE",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 13,
    pendingReason:
      "No berth register with positions is connected. Occupancy would have to be observed, and nothing observes it.",
  },
  {
    id: "aids-to-navigation",
    label: "Aids to Navigation",
    description: "Buoys, beacons and lights.",
    group: "PORTS_INFRASTRUCTURE",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 14,
    pendingReason:
      "Requires an aids-to-navigation register. NIMASA holds one; it is not machine-readable here.",
  },
  {
    id: "offshore-infrastructure",
    label: "Offshore Infrastructure",
    description: "Platforms, terminals and subsea assets offshore.",
    group: "PORTS_INFRASTRUCTURE",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 15,
    pendingReason: "No offshore asset register is connected.",
  },
  {
    id: "routes",
    label: "Routes",
    description: "The path a vessel actually took between calls.",
    group: "OPERATIONAL",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 20,
    pendingReason:
      "Requires AIS track history. Voyage endpoints are known; the path between them is not, and each voyage says so through pathKnown.",
  },
  {
    id: "port-calls",
    label: "Port Calls",
    description: "Arrivals and departures at each port.",
    group: "OPERATIONAL",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 21,
    pendingReason:
      "No port-call feed is connected. NPA SHIPPOS is the Tier 1 source and has no machine-readable route configured.",
  },
  {
    id: "traffic-density",
    label: "Traffic Density",
    description: "Where traffic concentrates, over a chosen period.",
    group: "OPERATIONAL",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 22,
    pendingReason:
      "Requires AIS history to aggregate. The live source publishes recent events, not a track archive.",
  },
  {
    id: "anchorage-activity",
    label: "Anchorage Activity",
    description: "Dwell and turnover at each anchorage.",
    group: "OPERATIONAL",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 23,
    pendingReason: "Requires position history to derive dwell. Nothing records it.",
  },
  {
    id: "expected-arrivals",
    label: "Expected Arrivals",
    description: "Vessels declared inbound, and when.",
    group: "OPERATIONAL",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 24,
    pendingReason:
      "Declared arrival times exist on voyages; no feed publishes them as an arrival board.",
  },
  {
    id: "port-congestion",
    label: "Port Congestion",
    description: "Queue length and waiting time by port.",
    group: "OPERATIONAL",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 25,
    pendingReason:
      "No port operations provider is connected, so berth occupancy and congestion cannot be observed.",
  },
  {
    id: "cargo-activity",
    label: "Cargo Activity",
    description: "Declared cargo moving through each port.",
    group: "TRADE_LOGISTICS",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 30,
    pendingReason:
      "Cargo records exist per manifest; none carries a position, so there is nothing to place on a map.",
  },
  {
    id: "container-activity",
    label: "Container Activity",
    description: "Container movements, aggregated by port.",
    group: "TRADE_LOGISTICS",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 31,
    pendingReason:
      "Containers are recorded against voyages, not positions. Individual containers are not map objects.",
  },
  {
    id: "manifest-exceptions",
    label: "Manifest Exceptions",
    description: "Declared against observed, where they disagree.",
    group: "TRADE_LOGISTICS",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 32,
    pendingReason: "Requires both a manifest feed and an observation to compare it against.",
  },
  {
    id: "cargo-density",
    label: "Cargo Density",
    description: "Where declared cargo concentrates.",
    group: "TRADE_LOGISTICS",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 33,
    pendingReason: "Aggregation needs positioned cargo records. None exist.",
  },
  {
    id: "revenue-risk",
    label: "Revenue Risk",
    description: "Assessed exposure, placed where it arose.",
    group: "TRADE_LOGISTICS",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 34,
    pendingReason: "Leakage findings are computed per manifest and carry no position.",
  },
  {
    id: "restricted-zones",
    label: "Restricted Zones",
    description: "Areas closed to traffic, and the order that closed them.",
    group: "RISK_INTELLIGENCE",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 41,
    pendingReason:
      "No zone register is connected. Drawing a restriction that is not current would be worse than drawing none.",
  },
  {
    id: "security-zones",
    label: "Security Zones",
    description: "Port facility security areas.",
    group: "RISK_INTELLIGENCE",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 42,
    pendingReason: "Requires a security zone register with geometry.",
  },
  {
    id: "ais-gaps",
    label: "AIS Gaps",
    description: "Where a vessel stopped transmitting, and for how long.",
    group: "RISK_INTELLIGENCE",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 43,
    pendingReason:
      "A gap is the absence of a signal over time. Deriving one requires track history, which is not collected.",
  },
  {
    id: "watch-zones",
    label: "Watch Zones",
    description: "Areas an officer has asked to be told about.",
    group: "RISK_INTELLIGENCE",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 44,
    pendingReason: "No watch-zone store exists. Zones would have to persist per officer.",
  },
  {
    id: "piracy",
    label: "Piracy and Armed Robbery",
    description: "Reported attacks and attempted boardings.",
    group: "RISK_INTELLIGENCE",
    renderLayerIds: [],
    defaultVisible: false,
    status: "unavailable",
    order: 45,
    pendingReason:
      "The IMB Piracy Reporting Centre feed is licensed and Seaphore holds no licence. Listed so the gap is visible, not because it is coming.",
  },
  {
    id: "territorial-waters",
    label: "Territorial Waters",
    description: "The 12-nautical-mile limit.",
    group: "MARITIME_ZONES",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 50,
    pendingReason:
      "Requires the declared baseline. The EEZ geometry ships with Seaphore; this does not.",
  },
  {
    id: "port-limits",
    label: "Port Limits",
    description: "The legal limits of each port.",
    group: "MARITIME_ZONES",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 51,
    pendingReason: "NPA publishes port limits on paper; no machine-readable geometry is available.",
  },
  {
    id: "marpol",
    label: "MARPOL Areas",
    description: "Special areas under MARPOL.",
    group: "MARITIME_ZONES",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 52,
    pendingReason: "Requires IMO special-area geometry.",
  },
  {
    id: "sar-zones",
    label: "SAR Zones",
    description: "Search and rescue regions.",
    group: "MARITIME_ZONES",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 53,
    pendingReason: "Requires the search and rescue region geometry NIMASA coordinates under.",
  },
  {
    id: "protected-areas",
    label: "Protected Areas",
    description: "Marine protected and conservation areas.",
    group: "MARITIME_ZONES",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 54,
    pendingReason: "No protected-area register is connected.",
  },
  {
    id: "regulatory-zones",
    label: "Regulatory Zones",
    description: "Other declared regulatory areas.",
    group: "MARITIME_ZONES",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 55,
    pendingReason: "A catalogue entry for zones declared case by case. None is connected.",
  },
  {
    id: "wind",
    label: "Wind",
    description: "Wind speed and direction.",
    group: "ENVIRONMENT",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 61,
    pendingReason: "No meteorological provider is connected.",
  },
  {
    id: "waves",
    label: "Wave Height",
    description: "Significant wave height.",
    group: "ENVIRONMENT",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 62,
    pendingReason: "No sea-state provider is connected.",
  },
  {
    id: "currents",
    label: "Currents",
    description: "Surface current set and drift.",
    group: "ENVIRONMENT",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 63,
    pendingReason: "No oceanographic provider is connected.",
  },
  {
    id: "storms",
    label: "Storms",
    description: "Tracked storm systems.",
    group: "ENVIRONMENT",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 64,
    pendingReason: "No storm-track provider is connected.",
  },
  {
    id: "visibility",
    label: "Visibility",
    description: "Reported visibility.",
    group: "ENVIRONMENT",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 65,
    pendingReason: "No meteorological provider is connected.",
  },
  {
    id: "pollution",
    label: "Pollution and Oil Spill",
    description: "Reported discharges and slicks.",
    group: "ENVIRONMENT",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 66,
    pendingReason: "NOSDRA reports incidents; no positioned spill feed is wired.",
  },
  {
    id: "investigation-areas",
    label: "Investigation Areas",
    description: "Areas an officer has drawn for a case.",
    group: "INVESTIGATIONS",
    renderLayerIds: [LAYER_IDS.investigArea],
    defaultVisible: false,
    status: "ready",
    order: 70,
  },
  {
    id: "compliance-hotspots",
    label: "Compliance Hotspots",
    description: "Where exceptions cluster.",
    group: "INVESTIGATIONS",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 71,
    pendingReason:
      "Compliance findings carry no position, so there is nothing to cluster geographically.",
  },
  {
    id: "revenue-risk-areas",
    label: "Revenue Risk Areas",
    description: "Where assessed exposure concentrates.",
    group: "INVESTIGATIONS",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 72,
    pendingReason: "Requires positioned revenue findings.",
  },
  {
    id: "historical-activity",
    label: "Historical Activity",
    description: "What happened here before.",
    group: "INVESTIGATIONS",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 73,
    pendingReason: "Requires an activity archive. Nothing retains historical positions.",
  },
  {
    id: "anomaly-density",
    label: "Anomaly Density",
    description: "Where anomalies concentrate.",
    group: "INVESTIGATIONS",
    renderLayerIds: [],
    defaultVisible: false,
    status: "pending-source",
    order: 74,
    pendingReason: "Requires both positioned anomalies and a period to aggregate over.",
  },
] as const;

/** Build a registry pre-loaded with the default layer catalogue. */
export function createDefaultLayerRegistry(): LayerRegistry {
  return new LayerRegistry().registerAll(DEFAULT_LAYERS);
}

/**
 * Process-wide registry used by the operational map.
 * Construct a fresh {@link LayerRegistry} in tests to stay isolated.
 */
export const layerRegistry = createDefaultLayerRegistry();
