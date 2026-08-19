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
export type LayerGroup = "OPERATIONAL" | "INTELLIGENCE" | "ANALYSIS";

/** Display order of the groups in the panel. */
export const LAYER_GROUP_ORDER: readonly LayerGroup[] = [
  "OPERATIONAL",
  "INTELLIGENCE",
  "ANALYSIS",
] as const;

/** Human-readable group headings. */
export const LAYER_GROUP_LABELS: Readonly<Record<LayerGroup, string>> = {
  OPERATIONAL: "Operational",
  INTELLIGENCE: "Intelligence",
  ANALYSIS: "Analysis",
} as const;

/**
 * Readiness of a layer's backing data.
 *
 * `pending-source` layers are catalogued and toggleable but have no connector
 * wired yet — the Layer Panel shows them disabled with an explanatory note
 * rather than silently rendering nothing. This is how G5.5.1 declares its own
 * integration points instead of hiding them.
 */
export type LayerStatus = "ready" | "pending-source";

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
    if (definition.renderLayerIds.length === 0) {
      throw new LayerRegistryError(`Layer "${definition.id}" declares no render layer ids`);
    }
    this.layers.set(definition.id, definition);
    return this;
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

/** The layers shipped with the Live Command Map foundation. */
export const DEFAULT_LAYERS: readonly LayerDefinition[] = [
  {
    id: "vessels",
    label: "Vessels",
    description: "Live vessel positions as heading-rotated arrows, coloured by risk.",
    group: "OPERATIONAL",
    renderLayerIds: [LAYER_IDS.vessels, LAYER_IDS.vesselHeadings, LAYER_IDS.vesselLabels],
    defaultVisible: true,
    status: "ready",
    order: 10,
  },
  {
    id: "ports",
    label: "Ports",
    description: "The five NIMASA ports with anchorage extents.",
    group: "OPERATIONAL",
    renderLayerIds: [LAYER_IDS.ports, LAYER_IDS.portLabels, LAYER_IDS.portAnchorage],
    defaultVisible: true,
    status: "ready",
    order: 20,
  },
  {
    id: "eezBoundary",
    label: "EEZ Boundary",
    description: "Nigerian Exclusive Economic Zone, 200 nautical miles.",
    group: "OPERATIONAL",
    renderLayerIds: [LAYER_IDS.eezBoundary],
    defaultVisible: true,
    status: "ready",
    order: 30,
  },
  {
    id: "weather",
    label: "Weather",
    description: "Weather overlay affecting port approach and ETA.",
    group: "OPERATIONAL",
    renderLayerIds: [LAYER_IDS.weatherOverlay],
    defaultVisible: false,
    status: "pending-source",
    order: 40,
    pendingReason: "Awaiting weather connector (post-G5.5.1).",
  },
  {
    id: "riskHeatmap",
    label: "Risk Heatmap",
    description: "Density of risk-assessed vessels.",
    group: "INTELLIGENCE",
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
    group: "INTELLIGENCE",
    renderLayerIds: [LAYER_IDS.revenueHeat],
    defaultVisible: false,
    status: "pending-source",
    order: 20,
    pendingReason: "Awaiting revenue aggregation (G5.5).",
  },
  {
    id: "aisTrack",
    label: "AIS Tracks",
    description: "Historic track lines, with dark periods highlighted.",
    group: "INTELLIGENCE",
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
    group: "ANALYSIS",
    renderLayerIds: [LAYER_IDS.vesselClusters, LAYER_IDS.clusterCount],
    defaultVisible: false,
    status: "ready",
    order: 10,
  },
  {
    id: "investigArea",
    label: "Investigation Area",
    description: "Officer-drawn area of interest.",
    group: "ANALYSIS",
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
    group: "INTELLIGENCE",
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
    group: "ANALYSIS",
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
    group: "ANALYSIS",
    renderLayerIds: [LAYER_IDS.darkContactAreas],
    defaultVisible: false,
    status: "pending-source",
    order: 40,
    pendingReason:
      "Requires an AIS history source; Datalastic is registered but not wired, and SeaVantage is not implemented.",
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
