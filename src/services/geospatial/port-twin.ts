/**
 * Nigerian Port Digital Twins (Phase 4B).
 *
 * A twin here is *one port, described honestly at infrastructure scale*.
 * It is not a second map, not a second vessel store and not a second
 * selection: the geometry it publishes is drawn by whichever renderer is
 * mounted, the clicks it produces travel on the shared `MapEventBus`, the
 * object an officer opens is resolved through the existing
 * `MapSelection` union, and the vessels shown against a berth are the
 * canonical fleet the update engine already holds.
 *
 * ## Why coverage is declared per layer, per port
 *
 * The eleven port layers in the specification describe capabilities, not
 * files we hold. Seaphore has NPA reference positions and berth counts,
 * and published pilotage anchorage references. It does **not** hold berth
 * polygons, NUPRC pipeline routes, NRC rail alignments, NCS customs-zone
 * boundaries, NIMASA zone boundaries or NOSDRA environmental zones in a
 * machine-readable form.
 *
 * So every twin carries a `coverage` record naming, layer by layer,
 * whether Seaphore can draw it and — when it cannot — which custodian's
 * dataset is missing. A layer with no data renders nothing and says so.
 * Drawing a plausible quay outline would put a shape on a satellite image
 * that an officer could not distinguish from a surveyed one, which is the
 * exact failure the honesty rules exist to prevent.
 *
 * Golden Rule projection: officer-facing through
 * `PortTwinPanel` (layer registry, coverage) and the Context Drawer
 * (`infrastructure` selection).
 */
import { NIGERIAN_ANCHORAGES, NIMASA_PORTS } from "./constants";
import type { PositionPrecision } from "./port-gazetteer";
import type { LonLat } from "./types";

// ── Layer registry ────────────────────────────────────────────────────

/** The eleven port-infrastructure layers, as specified. */
export type PortTwinLayerId =
  | "berths"
  | "anchorage"
  | "container-terminals"
  | "oil-terminals"
  | "pipelines"
  | "rail"
  | "road-network"
  | "warehouses"
  | "customs-zones"
  | "nimasa-zones"
  | "environmental-zones";

export interface PortTwinLayerDefinition {
  readonly id: PortTwinLayerId;
  readonly label: string;
  /** What the officer learns when this layer is on. */
  readonly purpose: string;
  /** Who publishes the authoritative record for this layer. */
  readonly custodian: string;
  /** Render-engine layer id this logical layer controls. */
  readonly renderLayerId: string;
  readonly defaultVisible: boolean;
  readonly order: number;
  /** Marker colour, so the twin reads as structure rather than fleet. */
  readonly colour: string;
}

/**
 * The catalogue. Ordered as an officer descends: where a ship waits,
 * where it berths, what handles its cargo, then the land side, then the
 * regulatory overlays.
 */
export const PORT_TWIN_LAYERS: readonly PortTwinLayerDefinition[] = [
  {
    id: "anchorage",
    label: "Anchorage",
    purpose: "Waiting vessels.",
    custodian: "NPA pilotage references",
    renderLayerId: "twin-anchorage-layer",
    defaultVisible: true,
    order: 10,
    colour: "#0ea5e9",
  },
  {
    id: "berths",
    label: "Berths",
    purpose: "Live occupancy.",
    custodian: "NPA berth register",
    renderLayerId: "twin-berths-layer",
    defaultVisible: true,
    order: 20,
    colour: "#2563eb",
  },
  {
    id: "container-terminals",
    label: "Container terminals",
    purpose: "Operator overlays.",
    custodian: "NPA concession register / terminal operators",
    renderLayerId: "twin-container-terminals-layer",
    defaultVisible: true,
    order: 30,
    colour: "#7c3aed",
  },
  {
    id: "oil-terminals",
    label: "Oil terminals",
    purpose: "Offshore logistics.",
    custodian: "NUPRC / NNPC terminal register",
    renderLayerId: "twin-oil-terminals-layer",
    defaultVisible: false,
    order: 40,
    colour: "#0f766e",
  },
  {
    id: "pipelines",
    label: "Pipelines",
    purpose: "NUPRC infrastructure.",
    custodian: "NUPRC pipeline network dataset",
    renderLayerId: "twin-pipelines-layer",
    defaultVisible: false,
    order: 50,
    colour: "#b45309",
  },
  {
    id: "rail",
    label: "Rail",
    purpose: "Cargo evacuation.",
    custodian: "Nigerian Railway Corporation alignments",
    renderLayerId: "twin-rail-layer",
    defaultVisible: false,
    order: 60,
    colour: "#475569",
  },
  {
    id: "road-network",
    label: "Road network",
    purpose: "Truck congestion.",
    custodian: "FERMA / state road authorities",
    renderLayerId: "twin-road-network-layer",
    defaultVisible: false,
    order: 70,
    colour: "#64748b",
  },
  {
    id: "warehouses",
    label: "Warehouses",
    purpose: "Logistics intelligence.",
    custodian: "Terminal operators / bonded warehouse register",
    renderLayerId: "twin-warehouses-layer",
    defaultVisible: false,
    order: 80,
    colour: "#a16207",
  },
  {
    id: "customs-zones",
    label: "Customs zones",
    purpose: "NCS control areas.",
    custodian: "Nigeria Customs Service",
    renderLayerId: "twin-customs-zones-layer",
    defaultVisible: false,
    order: 90,
    colour: "#c2410c",
  },
  {
    id: "nimasa-zones",
    label: "NIMASA zones",
    purpose: "Compliance.",
    custodian: "NIMASA",
    renderLayerId: "twin-nimasa-zones-layer",
    defaultVisible: false,
    order: 100,
    colour: "#15803d",
  },
  {
    id: "environmental-zones",
    label: "Environmental zones",
    purpose: "NOSDRA sensitivity.",
    custodian: "NOSDRA",
    renderLayerId: "twin-environmental-zones-layer",
    defaultVisible: false,
    order: 110,
    colour: "#059669",
  },
];

export const PORT_TWIN_LAYER_IDS: readonly PortTwinLayerId[] = PORT_TWIN_LAYERS.map(
  (layer) => layer.id,
);

export function portTwinLayer(id: string): PortTwinLayerDefinition | undefined {
  return PORT_TWIN_LAYERS.find((layer) => layer.id === id);
}

/** Layers switched on when a twin is opened for the first time. */
export function defaultTwinLayers(): readonly PortTwinLayerId[] {
  return PORT_TWIN_LAYERS.filter((layer) => layer.defaultVisible).map((layer) => layer.id);
}

/**
 * Why a layer cannot draw, when Seaphore holds no record for it.
 *
 * Named custodian and named dataset, so the gap is a procurement item an
 * officer can chase rather than an unexplained blank.
 */
const PENDING_REASON: Readonly<Record<PortTwinLayerId, string>> = {
  anchorage: "No published pilotage anchorage reference for this port.",
  berths:
    "NPA publishes a berth count for this complex but no berth geometry; individual quay outlines are not available in a machine-readable form.",
  "container-terminals":
    "Terminal concession boundaries are not published as geometry; operator names alone cannot be placed on the quay.",
  "oil-terminals": "No NUPRC/NNPC terminal coordinate set is connected.",
  pipelines: "NUPRC pipeline routing is not available to Seaphore as geometry.",
  rail: "Nigerian Railway Corporation alignments are not published in a machine-readable form.",
  "road-network":
    "Port access road geometry is only available from the basemap, which carries no congestion state.",
  warehouses: "No bonded-warehouse or operator yard register is connected.",
  "customs-zones": "NCS control-area boundaries are not published as geometry.",
  "nimasa-zones": "NIMASA zone boundaries are not published as geometry.",
  "environmental-zones": "NOSDRA sensitivity zones are not published as geometry.",
};

// ── Assets ────────────────────────────────────────────────────────────

/**
 * How a compliance authority currently stands on one asset.
 *
 * `NOT_ASSESSED` is the honest default and the only value the connected
 * sources support today: nothing Seaphore reads rules on infrastructure.
 * Vessel-level sanctions screening is a separate capability and must
 * never be re-labelled as an infrastructure verdict.
 */
export type PortTwinComplianceState = "NOT_ASSESSED" | "IN_GOOD_STANDING" | "ATTENTION";

export interface PortTwinCompliance {
  readonly state: PortTwinComplianceState;
  readonly authority: string;
  readonly note: string;
}

export interface PortTwinProvenance {
  readonly source: string;
  readonly note: string;
}

/** One clickable piece of port infrastructure. */
export interface PortTwinAsset {
  readonly id: string;
  readonly twinId: string;
  readonly layer: PortTwinLayerId;
  readonly name: string;
  /** Operator of record, or null when no source names one. */
  readonly operator: string | null;
  readonly position: LonLat;
  readonly precision: PositionPrecision;
  /** Indicative extent, km. Present for area assets such as anchorages. */
  readonly radiusKm?: number;
  /** Capacity as the source states it, or null when unpublished. */
  readonly capacity: string | null;
  readonly compliance: PortTwinCompliance;
  /** Officer-facing intelligence notes. Never inferred as fact. */
  readonly notes: readonly string[];
  readonly provenance: PortTwinProvenance;
}

export interface PortTwinLayerCoverage {
  readonly layer: PortTwinLayerId;
  readonly status: "ready" | "pending-source";
  readonly assetCount: number;
  /** Present when `status` is `pending-source`. */
  readonly reason?: string;
}

export interface PortDigitalTwin {
  /** UN/LOCODE — the identity every other Seaphore surface already uses. */
  readonly id: string;
  readonly name: string
  readonly shortName: string;
  readonly state: string;
  /** Camera preset in `earth-presets.ts` that frames this twin. */
  readonly presetId: string;
  readonly position: LonLat;
  readonly assets: readonly PortTwinAsset[];
}

const NOT_ASSESSED: PortTwinCompliance = {
  state: "NOT_ASSESSED",
  authority: "NCS / NIMASA / NOSDRA",
  note: "No connected source rules on infrastructure compliance. Vessel-level sanctions and manifest screening are separate capabilities and are not restated here.",
};

/**
 * Berth groups, from the NPA berth count each complex publishes.
 *
 * An aggregate, and labelled as one: the count is real, the individual
 * quay positions are not held, so one marker at the port's reference
 * position carries the count rather than fourteen invented rectangles.
 */
function berthGroup(locode: keyof typeof NIMASA_PORTS, twinId: string): PortTwinAsset {
  const port = NIMASA_PORTS[locode];
  return {
    id: `${twinId}:berths`,
    twinId,
    layer: "berths",
    name: `${port.shortName} berth group`,
    operator: "Nigerian Ports Authority",
    position: [port.lon, port.lat],
    precision: "approximate",
    capacity: `${port.berths} declared berths`,
    compliance: NOT_ASSESSED,
    notes: [
      "Aggregate, not a berth outline: the count is published, the individual quay geometry is not.",
      "Occupancy is not shown. No connected source publishes berth-level allocation for this complex.",
    ],
    provenance: {
      source: "NPA port reference (Seaphore canonical port registry)",
      note: "Berth count and port reference position as carried in the canonical registry; positioned at the complex reference point, not at a quay.",
    },
  };
}

/** Anchorages, from the published pilotage references already in the model. */
function anchorageAssets(twinId: string, portIds: readonly string[]): PortTwinAsset[] {
  return Object.values(NIGERIAN_ANCHORAGES)
    .filter((area) => area.portId !== null && portIds.includes(area.portId))
    .map((area) => ({
      id: `${twinId}:anchorage:${area.id}`,
      twinId,
      layer: "anchorage" as const,
      name: area.name,
      operator: "Nigerian Ports Authority (pilotage)",
      position: [area.lon, area.lat] as LonLat,
      precision: "degree-minute" as PositionPrecision,
      radiusKm: area.radiusKm,
      capacity: null,
      compliance: NOT_ASSESSED,
      notes: [
        `${area.district}.`,
        "Indicative extent from a chart reference, not a surveyed boundary.",
        "Waiting vessels are counted from the canonical fleet, never from the anchorage record.",
      ],
      provenance: {
        source: area.source,
        note: `Chart reference, ${area.verification}. Radius is indicative.`,
      },
    }));
}

/**
 * The six twins named in Phase 4B.
 *
 * Bonny is its own twin rather than a part of Rivers: it is the estate an
 * officer works when they say "Bonny", and its anchorage reference is
 * recorded against the Rivers complex, which is why the anchorage lookup
 * is by port id set rather than by name.
 */
export const PORT_TWINS: readonly PortDigitalTwin[] = [
  {
    id: "NGAPAPA",
    name: "Lagos Port Complex (Apapa)",
    shortName: "Apapa",
    state: "Lagos",
    presetId: "apapa",
    position: [NIMASA_PORTS.NGAPAPA.lon, NIMASA_PORTS.NGAPAPA.lat],
    assets: [berthGroup("NGAPAPA", "NGAPAPA"), ...anchorageAssets("NGAPAPA", ["NGAPAPA"])],
  },
  {
    id: "NGTIN",
    name: "Tin Can Island Port",
    shortName: "Tin Can",
    state: "Lagos",
    presetId: "tin-can-island",
    position: [NIMASA_PORTS.NGTIN.lon, NIMASA_PORTS.NGTIN.lat],
    assets: [berthGroup("NGTIN", "NGTIN")],
  },
  {
    id: "NGONNE",
    name: "Onne Port Complex",
    shortName: "Onne",
    state: "Rivers",
    presetId: "onne",
    position: [NIMASA_PORTS.NGONNE.lon, NIMASA_PORTS.NGONNE.lat],
    assets: [berthGroup("NGONNE", "NGONNE"), ...anchorageAssets("NGONNE", ["NGONNE"])],
  },
  {
    id: "NGBON",
    name: "Bonny Port",
    shortName: "Bonny",
    state: "Rivers",
    presetId: "bonny",
    /*
     * UN/LOCODE NGBON, transcribed from 0426N 00710E. Degree-and-minute
     * precision: enough to frame the estate, not enough to survey it.
     */
    position: [7.1667, 4.4333],
    assets: anchorageAssets("NGBON", ["NGPHC"]),
  },
  {
    id: "NGWARR",
    name: "Warri Port (Delta Port Complex)",
    shortName: "Warri",
    state: "Delta",
    presetId: "warri",
    position: [NIMASA_PORTS.NGWARR.lon, NIMASA_PORTS.NGWARR.lat],
    assets: [berthGroup("NGWARR", "NGWARR"), ...anchorageAssets("NGWARR", ["NGWARR"])],
  },
  {
    id: "NGCBQ",
    name: "Calabar Port",
    shortName: "Calabar",
    state: "Cross River",
    presetId: "calabar",
    position: [NIMASA_PORTS.NGCBQ.lon, NIMASA_PORTS.NGCBQ.lat],
    assets: [berthGroup("NGCBQ", "NGCBQ"), ...anchorageAssets("NGCBQ", ["NGCBQ"])],
  },
];

export function portTwin(id: string): PortDigitalTwin | undefined {
  return PORT_TWINS.find((twin) => twin.id === id);
}

/** Resolve one asset by id, across every twin. Null when unknown. */
export function findPortTwinAsset(assetId: string): PortTwinAsset | null {
  for (const twin of PORT_TWINS) {
    const found = twin.assets.find((asset) => asset.id === assetId);
    if (found) return found;
  }
  return null;
}

/**
 * Layer-by-layer coverage for one twin.
 *
 * Derived from the assets rather than declared beside them, so a layer
 * cannot claim to be connected while holding nothing.
 */
export function twinCoverage(twinId: string): readonly PortTwinLayerCoverage[] {
  const twin = portTwin(twinId);
  return PORT_TWIN_LAYERS.map((layer) => {
    const assetCount = twin ? twin.assets.filter((asset) => asset.layer === layer.id).length : 0;
    if (assetCount > 0) {
      return { layer: layer.id, status: "ready" as const, assetCount };
    }
    return {
      layer: layer.id,
      status: "pending-source" as const,
      assetCount: 0,
      reason: PENDING_REASON[layer.id],
    };
  });
}

export function twinLayerCoverage(
  twinId: string,
  layer: PortTwinLayerId,
): PortTwinLayerCoverage | undefined {
  return twinCoverage(twinId).find((entry) => entry.layer === layer);
}

// ── Renderer projection ───────────────────────────────────────────────

export interface PortTwinFeatureProperties {
  readonly assetId: string;
  readonly twinId: string;
  readonly layer: PortTwinLayerId;
  readonly name: string;
  readonly colour: string;
  readonly radiusKm: number | null;
}

export interface PortTwinFeature {
  readonly type: "Feature";
  readonly geometry: { readonly type: "Point"; readonly coordinates: readonly [number, number] };
  readonly properties: PortTwinFeatureProperties;
}

export interface PortTwinFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly PortTwinFeature[];
}

export const EMPTY_PORT_TWIN_COLLECTION: PortTwinFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/**
 * Project one twin's assets for the mounted renderer.
 *
 * Visibility is applied here as *inclusion*, not as a style rule: a layer
 * an officer switched off contributes no features, so nothing invisible is
 * left on the scene graph to be picked by a click.
 */
export function portTwinFeatures(
  twinId: string | null,
  visibleLayers: readonly PortTwinLayerId[],
): PortTwinFeatureCollection {
  const twin = twinId ? portTwin(twinId) : undefined;
  if (!twin) return EMPTY_PORT_TWIN_COLLECTION;
  const allowed = new Set(visibleLayers);
  const features = twin.assets
    .filter((asset) => allowed.has(asset.layer))
    .map((asset) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [asset.position[0], asset.position[1]] as readonly [number, number],
      },
      properties: {
        assetId: asset.id,
        twinId: asset.twinId,
        layer: asset.layer,
        name: asset.name,
        colour: portTwinLayer(asset.layer)?.colour ?? "#2563eb",
        radiusKm: asset.radiusKm ?? null,
      },
    }));
  return { type: "FeatureCollection", features };
}
