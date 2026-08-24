/**
 * Map selection — what the officer currently has open.
 *
 * ## Why a discriminated union rather than an id and a type tag
 *
 * The map's previous selection was `selectedEntityId` plus
 * `selectedEntityImo`: two loose fields that encoded "this is a vessel"
 * in their names. Adding a port meant either a second pair of fields or
 * an id whose meaning depended on context — and both produce the class of
 * bug where a port id is read as a vessel id and the drawer renders
 * confidently about the wrong object.
 *
 * A discriminated union makes that unrepresentable. Each variant carries
 * exactly the identifiers its kind needs: a vessel may have an IMO, a
 * terminal must know its port, a SAR detection must know its scene.
 *
 * ## Selection is a reference, never a payload
 *
 * A selection names an object; it never carries its intelligence. The
 * drawer resolves the reference against whichever service owns that kind
 * — vessels from the vessel source, findings from the intelligence
 * registry, detections from `services/eo`. Embedding data here would
 * create a second, staler copy of every entity on the map.
 */
import type { LonLat } from "./types";

/** Every object kind an officer can select. */
export type MapSelectionKind =
  | "vessel"
  | "port"
  | "terminal"
  | "berth"
  | "anchorage"
  | "zone"
  | "incident"
  | "sar-detection"
  | "ais-gap"
  | "risk-event"
  | "investigation"
  | "infrastructure"
  | "geofence";

interface SelectionBase {
  readonly id: string;
  /**
   * Where to centre when the selection is restored from a URL and the
   * owning service has not loaded yet. Optional — absent means "leave the
   * viewport alone", which is correct for a selection made by clicking.
   */
  readonly focus?: LonLat;
}

export type MapSelection =
  | (SelectionBase & {
      readonly kind: "vessel";
      /** Null is ordinary: GFW publishes no IMO. */
      readonly imo: string | null;
      readonly mmsi?: string | null;
    })
  | (SelectionBase & { readonly kind: "port" })
  | (SelectionBase & { readonly kind: "terminal"; readonly portId: string })
  | (SelectionBase & { readonly kind: "berth"; readonly terminalId: string })
  | (SelectionBase & { readonly kind: "anchorage"; readonly portId: string })
  | (SelectionBase & { readonly kind: "zone"; readonly zoneType: string })
  | (SelectionBase & {
      readonly kind: "incident";
      /** Which source reported it — NOSDRA, and later others. */
      readonly source: string;
    })
  | (SelectionBase & { readonly kind: "sar-detection"; readonly sceneId: string })
  | (SelectionBase & { readonly kind: "ais-gap"; readonly mmsi: string })
  | (SelectionBase & { readonly kind: "risk-event"; readonly subjectId: string })
  | (SelectionBase & { readonly kind: "investigation" })
  | (SelectionBase & { readonly kind: "infrastructure"; readonly assetType: string })
  | (SelectionBase & { readonly kind: "geofence" });

/**
 * Operating mode — the intelligence context the officer is working in.
 *
 * **Not `ViewMode`.** `ViewMode` is 2D/3D, a rendering concern. Overloading
 * it would recreate the vocabulary drift the orchestration layer removed
 * in G6.0: one name, two meanings, and a consumer that cannot tell which
 * it has.
 *
 * Mode changes what the map is *for*, not how it draws.
 */
export type OperatingMode =
  | "NATIONAL"
  | "PORT"
  | "VESSEL"
  | "INCIDENT"
  | "INVESTIGATION"
  | "HISTORY"
  | "REPLAY";

export const OPERATING_MODES: readonly OperatingMode[] = [
  "NATIONAL",
  "PORT",
  "VESSEL",
  "INCIDENT",
  "INVESTIGATION",
  "HISTORY",
  "REPLAY",
] as const;

/** Officer-facing labels. */
export const OPERATING_MODE_LABELS: Readonly<Record<OperatingMode, string>> = {
  NATIONAL: "National",
  PORT: "Port",
  VESSEL: "Vessel",
  INCIDENT: "Incident",
  INVESTIGATION: "Investigation",
  HISTORY: "History",
  REPLAY: "Replay",
};

/** One line describing what each mode answers. */
export const OPERATING_MODE_DESCRIPTIONS: Readonly<Record<OperatingMode, string>> = {
  NATIONAL: "What is happening in Nigerian waters.",
  PORT: "What is happening at one port.",
  VESSEL: "What one vessel is doing, and has done.",
  INCIDENT: "What is around an environmental or security incident.",
  INVESTIGATION: "Everything gathered against one case.",
  HISTORY: "What happened over a chosen period.",
  REPLAY: "Playback of a period, in sequence.",
};

/**
 * The mode a selection implies.
 *
 * Selecting a port is how an officer says "show me this port" — asking
 * them to then change mode by hand would be asking twice. Returns null
 * when the kind carries no mode of its own, leaving the current mode
 * alone rather than forcing one.
 */
export function modeForSelection(selection: MapSelection | null): OperatingMode | null {
  if (!selection) return null;
  switch (selection.kind) {
    case "vessel":
      return "VESSEL";
    case "port":
    case "terminal":
    case "berth":
    case "anchorage":
      return "PORT";
    case "incident":
      return "INCIDENT";
    case "investigation":
      return "INVESTIGATION";
    // A SAR detection, AIS gap, zone, geofence or infrastructure asset is
    // read *within* whatever context the officer is already in. Forcing a
    // mode change would throw away the frame they built.
    default:
      return null;
  }
}

/** Stable key for a selection, for React keys and equality checks. */
export function selectionKey(selection: MapSelection | null): string {
  return selection ? `${selection.kind}:${selection.id}` : "none";
}

export function isSameSelection(a: MapSelection | null, b: MapSelection | null): boolean {
  return selectionKey(a) === selectionKey(b);
}

/** Officer-facing label for the selection, before its data resolves. */
export function describeSelection(selection: MapSelection | null): string {
  if (!selection) return "Nothing selected";
  switch (selection.kind) {
    case "vessel":
      return selection.imo ? `Vessel · IMO ${selection.imo}` : `Vessel · ${selection.id}`;
    case "sar-detection":
      return `SAR detection · scene ${selection.sceneId}`;
    case "ais-gap":
      return `AIS gap · MMSI ${selection.mmsi}`;
    case "terminal":
      return `Terminal · ${selection.id}`;
    default:
      return `${selection.kind.replace("-", " ")} · ${selection.id}`;
  }
}

/* ── URL serialisation ─────────────────────────────────────────── */

/**
 * Encode a selection compactly for the URL.
 *
 * `kind:id` covers most kinds; variants with a second identifier append
 * it. Deliberately terse — this rides in a query string an officer may
 * paste into a message.
 */
export function encodeSelection(selection: MapSelection | null): string | null {
  if (!selection) return null;
  switch (selection.kind) {
    case "vessel":
      return `vessel:${selection.id}${selection.imo ? `:${selection.imo}` : ""}`;
    case "terminal":
      return `terminal:${selection.id}:${selection.portId}`;
    case "berth":
      return `berth:${selection.id}:${selection.terminalId}`;
    case "anchorage":
      return `anchorage:${selection.id}:${selection.portId}`;
    case "zone":
      return `zone:${selection.id}:${selection.zoneType}`;
    case "incident":
      return `incident:${selection.id}:${selection.source}`;
    case "sar-detection":
      return `sar-detection:${selection.id}:${selection.sceneId}`;
    case "ais-gap":
      return `ais-gap:${selection.id}:${selection.mmsi}`;
    case "risk-event":
      return `risk-event:${selection.id}:${selection.subjectId}`;
    case "infrastructure":
      return `infrastructure:${selection.id}:${selection.assetType}`;
    default:
      return `${selection.kind}:${selection.id}`;
  }
}

/**
 * Decode a selection from the URL.
 *
 * Returns null on anything malformed. A shared link with a corrupted
 * selection should open the map with nothing selected, never with a
 * half-built selection the drawer then renders against.
 */
export function decodeSelection(raw: string | null | undefined): MapSelection | null {
  if (!raw) return null;
  const [kind, id, extra] = raw.split(":");
  if (!kind || !id) return null;

  switch (kind as MapSelectionKind) {
    case "vessel":
      return { kind: "vessel", id, imo: extra ?? null };
    case "port":
      return { kind: "port", id };
    case "terminal":
      return extra ? { kind: "terminal", id, portId: extra } : null;
    case "berth":
      return extra ? { kind: "berth", id, terminalId: extra } : null;
    case "anchorage":
      return extra ? { kind: "anchorage", id, portId: extra } : null;
    case "zone":
      return extra ? { kind: "zone", id, zoneType: extra } : null;
    case "incident":
      return extra ? { kind: "incident", id, source: extra } : null;
    case "sar-detection":
      return extra ? { kind: "sar-detection", id, sceneId: extra } : null;
    case "ais-gap":
      return extra ? { kind: "ais-gap", id, mmsi: extra } : null;
    case "risk-event":
      return extra ? { kind: "risk-event", id, subjectId: extra } : null;
    case "investigation":
      return { kind: "investigation", id };
    case "infrastructure":
      return extra ? { kind: "infrastructure", id, assetType: extra } : null;
    case "geofence":
      return { kind: "geofence", id };
    default:
      return null;
  }
}

/* ── Compatibility ─────────────────────────────────────────────── */

/**
 * Build a selection from the legacy vessel-only fields.
 *
 * @deprecated Migration shim. `selectedEntityId`/`selectedEntityImo` are
 * derived from `selection` and will be removed once every reader has
 * moved to `MapState.selection`. There is one source of truth — the
 * union — and these are projections of it, never a parallel store.
 */
export function selectionFromLegacy(
  entityId: string | null,
  imo: string | null,
): MapSelection | null {
  if (!entityId) return null;
  return { kind: "vessel", id: entityId, imo };
}
