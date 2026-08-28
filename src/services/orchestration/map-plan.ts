/**
 * Map ↔ Copilot bridge.
 *
 * Two directions over one understanding:
 *
 *   MapState ──▶ MapContext ──────────▶ the Copilot knows what is on screen
 *   QueryUnderstanding ──▶ MapIntent[] ──▶ the map answers the question
 *
 * ## No second classifier
 *
 * `planMap` consumes the `QueryUnderstanding` that `understand()` already
 * produced. It never re-reads the query for *intent*. This is the rule
 * that makes `intent-classifier.ts` a projection rather than a second
 * opinion: two readers of one string eventually disagree, and a
 * projection cannot.
 *
 * (It does read the query for *place* and *vessel type*, which the
 * understanding does not model. Those are extractions, not
 * classifications, and they cannot contradict the intent.)
 *
 * ## The Copilot proposes; deterministic code disposes
 *
 * A model may emit `MapIntent`s. It may not mutate `MapState`. Every
 * intent passes through `validateIntent` and is applied by
 * `applyIntents`, which is ordinary, testable code. That boundary is what
 * stops a hallucinated instruction from moving an officer's map somewhere
 * it should not go.
 *
 * ## The map plans; it does not conclude
 *
 * An intent says which mode, layers, viewport, window. It carries no
 * risk, priority or finding — those come from the engines the drawer
 * renders.
 */
import { NIMASA_PORTS } from "@/services/geospatial/constants";
import type {
  LonLat,
  MapFilters,
  MapSelection,
  MapState,
  OperatingMode,
  ReplaySpeed,
  VesselType,
} from "@/services/geospatial";

import type { OfficerIntent, QueryUnderstanding, ResolvedEntity } from "./understanding/types";

/* ═════════════════ Direction 2 — Map → Copilot ═════════════════ */

/**
 * What the Copilot is told about the map.
 *
 * A snapshot, not a live handle: the Copilot reasons about the picture as
 * it stood when the officer asked, and a question about "this vessel"
 * must not silently retarget if the map moves while the answer composes.
 *
 * Compact by design. Raw UI state is not shovelled at the model — only
 * the fields that change what a correct answer looks like.
 */
export interface MapContext {
  readonly operatingMode: OperatingMode;
  readonly viewMode: MapState["viewMode"];
  readonly center: LonLat;
  readonly zoom: number;
  readonly selection: MapSelection | null;
  readonly visibleLayers: readonly string[];
  readonly filters: MapFilters;
  readonly enabledSources: readonly string[];
  /** Null means live; an ISO timestamp means the officer is in the past. */
  readonly timelinePosition: string | null;
  readonly timelinePlaying: boolean;
  readonly missionId: string | null;
  readonly capturedAt: string;
}

/** Snapshot the map for the Copilot. */
export function captureMapContext(state: MapState, now: number = Date.now()): MapContext {
  return {
    operatingMode: state.operatingMode,
    viewMode: state.viewMode,
    center: state.center,
    zoom: state.zoom,
    selection: state.selection,
    visibleLayers: state.activeLayers,
    filters: state.filters,
    enabledSources: state.enabledSources,
    timelinePosition: state.timelinePosition,
    timelinePlaying: state.timelinePlaying,
    missionId: state.missionId,
    capturedAt: new Date(now).toISOString(),
  };
}

/**
 * The selection as an entity the understanding layer can consume.
 *
 * This is how "why is this vessel here?" resolves: the query names no
 * subject, the context policy inherits one, and the map supplies it.
 * Confidence is 1 because the officer selected it explicitly — nothing is
 * uncertain about which object is meant.
 *
 * Returns null for kinds the understanding layer has no vocabulary for.
 * A null here is why an unselected map cannot produce phantom entity
 * information.
 */
export function selectionAsEntity(selection: MapSelection | null): ResolvedEntity | null {
  if (!selection) return null;

  const kindMap: Partial<Record<MapSelection["kind"], ResolvedEntity["kind"]>> = {
    vessel: "vessel",
    port: "port",
    terminal: "port",
    berth: "port",
    anchorage: "port",
  };
  const kind = kindMap[selection.kind];
  if (!kind) return null;

  const identifier = selection.kind === "vessel" ? selection.imo : null;
  return {
    kind,
    text: selection.id,
    identifier,
    identifierKind: identifier ? "imo" : null,
    confidence: 1,
  };
}

/**
 * Render the context for a model prompt.
 *
 * Deliberately terse and labelled. Source availability is included so the
 * Copilot can say "port schedule data is not connected" instead of
 * implying an unavailable dataset was checked.
 */
export function describeMapContext(
  context: MapContext,
  sourceStates: readonly { readonly id: string; readonly status: string }[] = [],
): string {
  const lines = [
    "MAP CONTEXT",
    `Operating mode: ${context.operatingMode}`,
    context.selection
      ? `Selected: ${context.selection.kind} — ${context.selection.id}`
      : "Selected: nothing",
    `Viewport: ${context.center[1].toFixed(2)}, ${context.center[0].toFixed(2)} @ z${context.zoom.toFixed(1)}`,
    `Active layers: ${context.visibleLayers.length > 0 ? context.visibleLayers.join(", ") : "none"}`,
    `Timeline: ${context.timelinePosition ?? "live"}${context.timelinePlaying ? " (playing)" : ""}`,
  ];

  if (sourceStates.length > 0) {
    lines.push(
      `Sources: ${sourceStates.map((s) => `${s.id}=${s.status}`).join(", ")}`,
      "Only sources marked CONNECTED were consulted. Any other status means the dataset was not checked, which is not the same as finding nothing.",
    );
  }

  return lines.join("\n");
}

/* ═════════════════ Geography ═════════════════ */

export interface GeographicTarget {
  readonly kind: "port" | "area" | "national";
  readonly id: string;
  readonly label: string;
  readonly center: LonLat;
  readonly zoom: number;
}

/** Nigeria and the Gulf of Guinea — the default frame. */
export const NATIONAL_TARGET: GeographicTarget = {
  kind: "national",
  id: "nigeria",
  label: "Nigeria & Gulf of Guinea",
  center: [5.7, 4.35],
  zoom: 6,
};

/** The Gulf of Guinea, wider than the Nigerian EEZ. */
export const GULF_OF_GUINEA_TARGET: GeographicTarget = {
  kind: "area",
  id: "gulf-of-guinea",
  label: "Gulf of Guinea",
  center: [3.0, 2.0],
  zoom: 5,
};

/**
 * Resolve a place name against verified geometry.
 *
 * Only matches places Seaphore holds real coordinates for. An
 * unrecognised place returns null rather than a guessed centre — moving
 * the officer's map to the wrong stretch of ocean is worse than not
 * moving it at all.
 */
export function resolveGeographicTarget(text: string): GeographicTarget | null {
  if (/\bgulf of guinea\b/i.test(text)) return GULF_OF_GUINEA_TARGET;

  const haystack = text.toLowerCase();
  for (const port of Object.values(NIMASA_PORTS)) {
    // "Apapa (Lagos)" must match both "apapa" and "lagos".
    const words = port.name
      .toLowerCase()
      .replace(/[()]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3);
    const names = [port.name.toLowerCase(), port.shortName.toLowerCase(), ...words];
    if (names.some((name) => haystack.includes(name))) {
      return {
        kind: "port",
        id: port.locode,
        label: port.name,
        center: [port.lon, port.lat],
        zoom: 11,
      };
    }
  }

  if (/\bnigeria(?:n)?\b|\bnigerian waters\b|\beez\b/i.test(text)) return NATIONAL_TARGET;
  return null;
}

/* ═════════════════ Direction 1 — Copilot → Map ═════════════════ */

/**
 * One structured change to the map.
 *
 * Discriminated so each kind carries exactly what it needs, and so
 * validation can be exhaustive. Note there is no `SET_ARBITRARY_STATE`
 * variant: the union *is* the boundary on what a proposal may do.
 */
export type MapIntent =
  | { readonly kind: "FOCUS_ENTITY"; readonly selection: MapSelection; readonly zoom?: number }
  | { readonly kind: "FOCUS_AREA"; readonly target: GeographicTarget }
  | { readonly kind: "SET_VIEWPORT"; readonly center: LonLat; readonly zoom: number }
  | { readonly kind: "SET_TIME_WINDOW"; readonly fromIso: string; readonly toIso: string }
  | { readonly kind: "ACTIVATE_LAYERS"; readonly layerIds: readonly string[] }
  | { readonly kind: "APPLY_FILTERS"; readonly filters: Partial<MapFilters> }
  | { readonly kind: "OPEN_REPLAY"; readonly fromIso: string; readonly speed: ReplaySpeed }
  | { readonly kind: "SELECT_EVENT"; readonly selection: MapSelection }
  | { readonly kind: "CHANGE_OPERATING_MODE"; readonly mode: OperatingMode };

/** An ordered, explainable set of changes. */
export interface IntelligenceMapPlan {
  readonly intents: readonly MapIntent[];
  /** One officer-facing sentence. Shown so the map never moves silently. */
  readonly explanation: string;
  /** Layers the question wanted whose source is not connected. */
  readonly unavailable: readonly { readonly layerId: string; readonly reason: string }[];
  readonly understanding: QueryUnderstanding;
}

/** Layers each intent wants switched on. */
const INTENT_LAYERS: Readonly<Record<OfficerIntent, readonly string[]>> = {
  /*
   * A command should not silently rearrange the officer's layers.
   * Navigation moves the camera; selection opens a panel. Neither is a
   * reason to turn layers on behind their back, so these add none and
   * the vessel commands name only what they are about.
   */
  "source-switch": [],
  "map-navigation": [],
  "map-zoom": [],
  "vessel-selection": ["vessels"],
  "vessel-track": ["vessels", "aisTrack"],
  "fleet-intelligence": ["vessels"],
  "vessel-investigation": ["vessels", "aisTrack"],
  "port-intelligence": ["vessels", "ports"],
  "voyage-intelligence": ["vessels", "aisTrack"],
  "risk-assessment": ["vessels", "riskHeatmap"],
  "pattern-detection": ["vessels", "aisTrack", "riskHeatmap"],
  "compliance-intelligence": ["vessels", "riskHeatmap"],
  "revenue-intelligence": ["ports", "revenueHeat"],
  "cargo-intelligence": ["ports", "vessels"],
  "manifest-intelligence": ["ports"],
  "container-intelligence": ["ports"],
  "ownership-intelligence": ["vessels"],
  "company-intelligence": ["vessels"],
  "historical-replay": ["vessels", "aisTrack"],
  "trend-analysis": ["vessels"],
  comparison: ["vessels"],
  "operational-recommendation": ["vessels"],
  "strategic-summary": ["vessels", "ports"],
  "executive-brief": ["vessels", "ports"],
  "mission-planning": ["vessels", "ports", "nigeria-eez"],
  "natural-language-search": ["vessels"],
  "officer-notes": [],
  unknown: [],
};

/** Operating mode each intent implies. */
const INTENT_MODE: Readonly<Record<OfficerIntent, OperatingMode>> = {
  // Navigation keeps the officer's current mode; the vessel commands
  // are about one hull, which is what VESSEL mode means.
  "source-switch": "NATIONAL",
  "map-navigation": "NATIONAL",
  "map-zoom": "NATIONAL",
  "vessel-selection": "VESSEL",
  "vessel-track": "VESSEL",
  "fleet-intelligence": "NATIONAL",
  "strategic-summary": "NATIONAL",
  "executive-brief": "NATIONAL",
  "natural-language-search": "NATIONAL",
  "officer-notes": "NATIONAL",
  unknown: "NATIONAL",
  "vessel-investigation": "VESSEL",
  "voyage-intelligence": "VESSEL",
  "ownership-intelligence": "VESSEL",
  "company-intelligence": "VESSEL",
  "port-intelligence": "PORT",
  "cargo-intelligence": "PORT",
  "manifest-intelligence": "PORT",
  "container-intelligence": "PORT",
  "revenue-intelligence": "PORT",
  "compliance-intelligence": "INVESTIGATION",
  "risk-assessment": "INVESTIGATION",
  "pattern-detection": "INVESTIGATION",
  "operational-recommendation": "INVESTIGATION",
  "mission-planning": "INVESTIGATION",
  "historical-replay": "REPLAY",
  "trend-analysis": "HISTORY",
  comparison: "HISTORY",
};

/** Vessel-type words, mapped to the filter vocabulary. */
const VESSEL_TYPE_WORDS: readonly { readonly rx: RegExp; readonly type: VesselType }[] = [
  { rx: /\btankers?\b/i, type: "TANKER" },
  { rx: /\bcontainer ships?\b|\bboxships?\b/i, type: "CONTAINER" },
  { rx: /\bbulk(?:ers)?\b|\bbulk carriers?\b/i, type: "BULK" },
  { rx: /\bcar carriers?\b|\bro-?ro\b|\bvehicle carriers?\b/i, type: "VEHICLE" },
];

export interface PlanMapOptions {
  readonly context?: MapContext | null;
  readonly now?: number;
}

/**
 * Turn one understanding into an ordered plan.
 *
 * Intent order is deliberate and deterministic: mode, then geography,
 * then layers, then filters, then time, then selection. Selection last
 * because it is the most specific instruction and must not be undone by
 * a broader one applied after it.
 */
export function planMap(
  understanding: QueryUnderstanding,
  options: PlanMapOptions = {},
): IntelligenceMapPlan {
  const context = options.context ?? null;
  const intents: MapIntent[] = [];
  const target = resolveGeographicTarget(understanding.query);

  // A question naming a port is a port question even when the intent
  // classified otherwise — the geography is the more specific signal.
  const mode: OperatingMode = target?.kind === "port" ? "PORT" : INTENT_MODE[understanding.intent];
  intents.push({ kind: "CHANGE_OPERATING_MODE", mode });

  if (target) intents.push({ kind: "FOCUS_AREA", target });

  const layerIds = INTENT_LAYERS[understanding.intent];
  if (layerIds.length > 0) intents.push({ kind: "ACTIVATE_LAYERS", layerIds });

  const filters: { -readonly [K in keyof MapFilters]?: MapFilters[K] } = {};
  for (const { rx, type } of VESSEL_TYPE_WORDS) {
    if (rx.test(understanding.query)) {
      filters.vesselType = type;
      break;
    }
  }
  if (Object.keys(filters).length > 0) intents.push({ kind: "APPLY_FILTERS", filters });

  intents.push({
    kind: "SET_TIME_WINDOW",
    fromIso: new Date(understanding.timeWindow.fromMs).toISOString(),
    toIso: new Date(understanding.timeWindow.toMs).toISOString(),
  });

  // Replay is an explicit request, and it hands off to the existing
  // ReplayPlayer rather than introducing a second playback path.
  if (understanding.intent === "historical-replay") {
    intents.push({
      kind: "OPEN_REPLAY",
      fromIso: new Date(understanding.timeWindow.fromMs).toISOString(),
      speed: 5,
    });
  }

  // A question that named its own subject focuses it. A follow-up that
  // inherited the map's selection does not re-select what is already
  // selected.
  if (understanding.primaryEntity && understanding.contextPolicy === "passive") {
    const selection = entityAsSelection(understanding.primaryEntity);
    if (selection) intents.push({ kind: "FOCUS_ENTITY", selection });
  }

  return {
    intents,
    explanation: explain(intents, understanding, target),
    unavailable: understanding.plan.unavailable.map((gap) => ({
      layerId: gap.dataset,
      reason: gap.reason,
    })),
    understanding,
  };
}

/** A resolved entity as a map selection, when the kind maps cleanly. */
function entityAsSelection(entity: ResolvedEntity): MapSelection | null {
  switch (entity.kind) {
    case "vessel":
      return {
        kind: "vessel",
        id: entity.identifier ?? entity.text,
        imo: entity.identifierKind === "imo" ? entity.identifier : null,
      };
    case "port":
      return { kind: "port", id: entity.text };
    default:
      // Company and container have no map geometry yet. Returning null
      // keeps the map still rather than focusing something arbitrary.
      return null;
  }
}

/**
 * One sentence describing what changed.
 *
 * Subtle and inspectable, per the brief — not a notification stream.
 */
function explain(
  intents: readonly MapIntent[],
  understanding: QueryUnderstanding,
  target: GeographicTarget | null,
): string {
  const parts: string[] = [];

  if (target) parts.push(`Focused on ${target.label}`);
  const layers = intents.find((i) => i.kind === "ACTIVATE_LAYERS");
  if (layers?.kind === "ACTIVATE_LAYERS") parts.push(`${layers.layerIds.join(", ")} active`);
  const filter = intents.find((i) => i.kind === "APPLY_FILTERS");
  if (filter?.kind === "APPLY_FILTERS" && filter.filters.vesselType) {
    parts.push(`${filter.filters.vesselType.toLowerCase()} only`);
  }
  parts.push(
    understanding.timeWindow.inferred
      ? `${understanding.timeWindow.label} (assumed)`
      : understanding.timeWindow.label,
  );
  if (intents.some((i) => i.kind === "OPEN_REPLAY")) parts.push("replay opened");

  return `Map updated: ${parts.join(" · ")}`;
}

/* ═════════════════ Validation and application ═════════════════ */

export interface IntentRejection {
  readonly intent: MapIntent;
  readonly reason: string;
}

export interface ValidationResult {
  readonly accepted: readonly MapIntent[];
  readonly rejected: readonly IntentRejection[];
}

export interface ValidateOptions {
  /** Layer ids the registry knows. Unknown ids are rejected, not created. */
  readonly knownLayerIds?: readonly string[];
  /** Widest window an officer may be moved to, ms. Defaults to 5 years. */
  readonly maxWindowMs?: number;
}

const MAX_WINDOW_MS = 5 * 365 * 24 * 3_600_000;
const VALID_SPEEDS: readonly ReplaySpeed[] = [1, 5, 10, 20, 100];

/**
 * Validate proposed intents.
 *
 * This is the boundary between a proposal and a mutation. Every check
 * here exists because a model can emit a syntactically valid intent that
 * is operationally wrong — a layer that does not exist, a viewport off
 * the globe, a window spanning a century. Rejections are returned rather
 * than thrown so a partially valid plan still does its valid work.
 */
export function validateIntents(
  intents: readonly MapIntent[],
  options: ValidateOptions = {},
): ValidationResult {
  const maxWindow = options.maxWindowMs ?? MAX_WINDOW_MS;
  const accepted: MapIntent[] = [];
  const rejected: IntentRejection[] = [];

  const reject = (intent: MapIntent, reason: string) => rejected.push({ intent, reason });

  for (const intent of intents) {
    switch (intent.kind) {
      case "SET_VIEWPORT":
      case "FOCUS_AREA": {
        const [lon, lat] = intent.kind === "SET_VIEWPORT" ? intent.center : intent.target.center;
        const zoom = intent.kind === "SET_VIEWPORT" ? intent.zoom : intent.target.zoom;
        if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
          reject(intent, `Longitude ${lon} is outside -180..180.`);
          continue;
        }
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
          reject(intent, `Latitude ${lat} is outside -90..90.`);
          continue;
        }
        if (!Number.isFinite(zoom) || zoom < 0 || zoom > 22) {
          reject(intent, `Zoom ${zoom} is outside 0..22.`);
          continue;
        }
        accepted.push(intent);
        break;
      }

      case "ACTIVATE_LAYERS": {
        if (!options.knownLayerIds) {
          accepted.push(intent);
          break;
        }
        const unknown = intent.layerIds.filter((id) => !options.knownLayerIds!.includes(id));
        if (unknown.length > 0) {
          // Partially valid: keep the known layers, report the rest.
          const known = intent.layerIds.filter((id) => options.knownLayerIds!.includes(id));
          if (known.length > 0) accepted.push({ kind: "ACTIVATE_LAYERS", layerIds: known });
          reject(intent, `Unknown layer ids: ${unknown.join(", ")}.`);
          break;
        }
        accepted.push(intent);
        break;
      }

      case "SET_TIME_WINDOW": {
        const from = Date.parse(intent.fromIso);
        const to = Date.parse(intent.toIso);
        if (Number.isNaN(from) || Number.isNaN(to)) {
          reject(intent, "Unparseable time window.");
          continue;
        }
        if (to <= from) {
          reject(intent, "Time window ends before it starts.");
          continue;
        }
        if (to - from > maxWindow) {
          reject(intent, "Time window is wider than any source can support.");
          continue;
        }
        accepted.push(intent);
        break;
      }

      case "OPEN_REPLAY": {
        if (Number.isNaN(Date.parse(intent.fromIso))) {
          reject(intent, "Unparseable replay start.");
          continue;
        }
        if (!VALID_SPEEDS.includes(intent.speed)) {
          reject(intent, `Replay speed ${intent.speed} is not offered.`);
          continue;
        }
        accepted.push(intent);
        break;
      }

      case "FOCUS_ENTITY":
      case "SELECT_EVENT": {
        if (!intent.selection.id) {
          reject(intent, "Selection carries no id.");
          continue;
        }
        accepted.push(intent);
        break;
      }

      default:
        accepted.push(intent);
    }
  }

  return { accepted, rejected };
}

/** The state change an intent set produces. Pure — applies nothing itself. */
export function intentsToStatePatch(
  intents: readonly MapIntent[],
  current: MapState,
): Partial<MapState> {
  let patch: Partial<MapState> = {};

  for (const intent of intents) {
    switch (intent.kind) {
      case "CHANGE_OPERATING_MODE":
        patch = { ...patch, operatingMode: intent.mode };
        break;

      case "FOCUS_AREA":
        patch = { ...patch, center: intent.target.center, zoom: intent.target.zoom };
        break;

      case "SET_VIEWPORT":
        patch = { ...patch, center: intent.center, zoom: intent.zoom };
        break;

      case "ACTIVATE_LAYERS":
        // Additive. A plan that silently switched the officer's layers off
        // would discard work they did deliberately.
        patch = {
          ...patch,
          activeLayers: [
            ...new Set([...(patch.activeLayers ?? current.activeLayers), ...intent.layerIds]),
          ],
        };
        break;

      case "APPLY_FILTERS":
        patch = {
          ...patch,
          filters: { ...(patch.filters ?? current.filters), ...intent.filters },
        };
        break;

      case "SET_TIME_WINDOW":
        // A window is not a playhead. Only replay moves the playhead.
        break;

      case "OPEN_REPLAY":
        patch = { ...patch, operatingMode: "REPLAY", timelinePosition: intent.fromIso };
        break;

      case "FOCUS_ENTITY":
      case "SELECT_EVENT":
        patch = {
          ...patch,
          selection: intent.selection,
          selectedEntityId: intent.selection.id,
          selectedEntityImo:
            intent.selection.kind === "vessel" ? (intent.selection.imo ?? null) : null,
        };
        break;
    }
  }

  return patch;
}

/**
 * Which parts of the current context a mode change invalidates.
 *
 * Switching from VESSEL to PORT keeps the viewport and layers but makes a
 * vessel selection meaningless in the new frame. Reporting that
 * explicitly is better than leaving a stale selection the drawer would
 * render against the wrong mode.
 */
export function contextInvalidatedBy(
  nextMode: OperatingMode,
  current: MapState,
): { readonly clearSelection: boolean; readonly reason: string | null } {
  const selection = current.selection;
  if (!selection) return { clearSelection: false, reason: null };

  const compatible: Readonly<Record<OperatingMode, readonly MapSelection["kind"][]>> = {
    VESSEL: ["vessel", "ais-gap", "sar-detection", "risk-event"],
    PORT: ["port", "terminal", "berth", "anchorage", "vessel"],
    INCIDENT: ["incident", "sar-detection", "infrastructure", "vessel"],
    INVESTIGATION: [
      "investigation",
      "vessel",
      "port",
      "incident",
      "sar-detection",
      "ais-gap",
      "risk-event",
    ],
    // These are framings over whatever is selected, so nothing is invalidated.
    NATIONAL: [],
    HISTORY: [],
    REPLAY: [],
  };

  const allowed = compatible[nextMode];
  if (allowed.length === 0 || allowed.includes(selection.kind)) {
    return { clearSelection: false, reason: null };
  }

  return {
    clearSelection: true,
    reason: `A ${selection.kind} selection has no meaning in ${nextMode} mode, so it was cleared.`,
  };
}
