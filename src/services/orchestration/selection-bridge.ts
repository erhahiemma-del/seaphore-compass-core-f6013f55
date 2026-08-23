/**
 * The bridge from map selection to operational context.
 *
 * ## The link this closes
 *
 * Selection previously stopped at the drawer:
 *
 *     map click → SGS.select() → MapState.selection → ContextDrawer → ✕
 *
 * `features/maritime/` contained no reference to `MissionContext` in any
 * form, so a vessel an officer had open on the map was invisible to the
 * Copilot. The Copilot's own context bar was the only writer, which made
 * it a third, independent notion of "what the officer is looking at".
 *
 * This module is the missing step — and only that step. It resolves a
 * selection into the existing `MissionContext` contract and returns it.
 * It holds no state, subscribes to nothing, and cannot write anywhere.
 *
 * ## Why this cannot contaminate a query
 *
 * Opening a mission does not attach a subject to anything. `orchestrate`
 * passes it to `classifyIntent` as an *ambient* entity, and
 * `classifyIntent` applies it only when the question's own context policy
 * resolves to `inherit`. A fleet question resolves to `passive` and never
 * sees it.
 *
 * So the isolation boundary is untouched here by construction: this
 * module produces the same `MissionContext` shape the Copilot context bar
 * already produced, through the same `openMission()` constructor. It adds
 * a producer, not a path around the guard.
 *
 * ## Why a table rather than a switch
 *
 * `MapSelection` has 13 kinds; `EntityKind` has 6. The mapping is
 * genuinely partial, and the partiality is the interesting part — a SAR
 * detection is not a vessel, and quietly calling it one would put a
 * fabricated identity into an officer's ambient context.
 *
 * `SELECTION_ENTITY` states the position for every kind explicitly,
 * including the ones that deliberately have no entity representation yet.
 * Adding SAR detections or findings later is a row in this table, not a
 * rewrite — and the compiler requires a row for every kind, so a new
 * selection kind cannot be added without deciding what it means here.
 */
import type { MapSelection, MapSelectionKind } from "@/services/geospatial";

import { openMission, type MissionContext } from "./mission-context";
import type { EntityKind } from "./understanding/types";

/**
 * How one selection kind becomes an entity, or why it does not.
 *
 * `null` is a decision, not a gap in the table: it records that the kind
 * has no honest `EntityKind` today.
 */
interface SelectionMapping {
  /** The entity kind this selection becomes, or null when none fits. */
  readonly entity: EntityKind | null;
  /** Shown to the officer when the kind cannot become context. */
  readonly reason?: string;
  /** Noun used to label the subject when no better label is supplied. */
  readonly noun: string;
}

/**
 * The complete position, one row per selection kind.
 *
 * Typed as a total record so adding a `MapSelectionKind` fails to compile
 * until its meaning here is decided.
 */
export const SELECTION_ENTITY: Readonly<Record<MapSelectionKind, SelectionMapping>> = {
  vessel: { entity: "vessel", noun: "Vessel" },
  port: { entity: "port", noun: "Port" },

  // Port facilities. The officer is looking at a place within a port, and
  // "port" is the honest entity kind for it — the label keeps the
  // distinction the entity kind cannot carry.
  terminal: { entity: "port", noun: "Terminal" },
  berth: { entity: "port", noun: "Berth" },
  anchorage: { entity: "port", noun: "Anchorage" },

  // Areas and observations. None of these is an entity the intelligence
  // pipeline can reason about as a subject, and inventing one would put a
  // subject into ambient context that no source ever observed.
  zone: {
    entity: null,
    noun: "Zone",
    reason: "A zone is an area, not an entity the intelligence pipeline can take as a subject.",
  },
  incident: {
    entity: null,
    noun: "Incident",
    reason: "Incidents are not yet a resolvable entity kind.",
  },
  "sar-detection": {
    entity: null,
    noun: "SAR detection",
    reason:
      "A SAR detection is an unattributed radar return. Treating it as a vessel would assert an identity no source has established.",
  },
  "ais-gap": {
    entity: null,
    noun: "AIS gap",
    reason: "An AIS gap is an absence of observation, not a subject.",
  },
  "risk-event": {
    entity: null,
    noun: "Risk event",
    reason: "Risk events are not yet a resolvable entity kind.",
  },
  investigation: {
    entity: null,
    noun: "Investigation",
    reason: "An investigation is a container for subjects rather than a subject itself.",
  },
  infrastructure: {
    entity: null,
    noun: "Infrastructure",
    reason: "Infrastructure assets are not yet a resolvable entity kind.",
  },
  geofence: {
    entity: null,
    noun: "Geofence",
    reason: "A geofence is an area, not an entity.",
  },
};

export type SelectionBridgeResult =
  /** Nothing is selected. The caller should clear ambient context. */
  | { readonly status: "cleared" }
  /** The selection resolved to a subject the pipeline can carry. */
  | { readonly status: "opened"; readonly mission: MissionContext }
  /**
   * The selection is real but has no entity representation. Ambient
   * context must be cleared, not left pointing at the previous subject.
   */
  | {
      readonly status: "unsupported";
      readonly kind: MapSelectionKind;
      readonly reason: string;
    };

/**
 * Pull the strongest identifier a selection carries.
 *
 * IMO before MMSI: an IMO is permanent and hull-bound, while an MMSI is
 * reassigned when a vessel changes flag. Absent both, null — a name alone
 * never becomes an identifier here.
 */
function identifierFor(selection: MapSelection): string | null {
  if (selection.kind === "vessel") {
    return selection.imo ?? selection.mmsi ?? null;
  }
  return null;
}

/**
 * Resolve a map selection into operational context.
 *
 * Pure. `label` is the human name the caller already resolved — the
 * selection carries ids, not names, and this module does not fetch.
 * Without one it falls back to the kind's noun and the id, which is
 * honest if plain.
 */
export function missionForSelection(
  selection: MapSelection | null,
  options: { readonly label?: string | null; readonly now?: number } = {},
): SelectionBridgeResult {
  if (!selection) return { status: "cleared" };

  const mapping = SELECTION_ENTITY[selection.kind];

  if (mapping.entity === null) {
    return {
      status: "unsupported",
      kind: selection.kind,
      reason: mapping.reason ?? `${mapping.noun} cannot be used as operational context.`,
    };
  }

  const label = options.label?.trim() || `${mapping.noun} ${selection.id}`;

  return {
    status: "opened",
    mission: openMission(
      { kind: mapping.entity, label, identifier: identifierFor(selection) },
      options.now,
    ),
  };
}

/**
 * Whether a new selection should replace the mission currently open.
 *
 * Used to avoid rebuilding an identical context on every render. Compares
 * the investigation id, which `openMission` derives from the identifier
 * or the label — so Vessel A → Vessel B differs, and Vessel A → Vessel A
 * does not.
 */
export function missionChanged(
  current: MissionContext | null,
  next: MissionContext | null,
): boolean {
  return (current?.investigationId ?? null) !== (next?.investigationId ?? null);
}
