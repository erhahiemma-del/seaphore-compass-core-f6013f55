/**
 * Deterministic reading of map-control instructions.
 *
 * The Copilot may propose an action; it may never mutate the map. This
 * module is where a sentence becomes one of the closed `CopilotAction`
 * variants, by rule and against the registries that own the real names —
 * `layerRegistry` for layers, `EARTH_CAMERA_PRESETS` for views. Nothing
 * here calls the map: `executeCopilotAction` remains the only dispatcher,
 * and it re-validates every id it is handed.
 *
 * ## Rules, not a model
 *
 * A language model deciding to hide a layer is a picture changing for a
 * reason no officer can audit. So intent for these eleven actions is
 * matched by explicit phrasing, and an unmatched sentence returns `null`
 * — which means "this was not a map instruction", and the caller answers
 * it some other way. Guessing would turn an ordinary question into a
 * camera movement.
 *
 * ## It never invents a subject
 *
 * Vessel-scoped controls act on the vessel already under discussion.
 * Resolving a hull from loose words here is how the wrong ship ends up
 * under replay, on a briefing, or in front of an officer as evidence.
 */
import { EARTH_CAMERA_PRESETS } from "@/services/geospatial/earth-presets";
import { layerRegistry } from "@/services/geospatial/layer-registry";
import type { RiskLevel } from "@/services/geospatial/types";

import type { CopilotAction } from "./copilot-actions";

export interface MapControlTranslation {
  readonly kind: "ACTION";
  readonly action: CopilotAction;
  readonly speech: string;
}

export interface MapControlUnresolved {
  readonly kind: "UNRESOLVED";
  readonly speech: string;
}

export type MapControlReading = MapControlTranslation | MapControlUnresolved | null;

export interface MapControlInput {
  readonly text: string;
  readonly contextVesselImo: string | null;
  readonly contextVesselName?: string;
}

/** Officer wording that reaches the same layer, beyond its registered label. */
const LAYER_ALIASES: Readonly<Record<string, string>> = {
  vessels: "vessels",
  ships: "vessels",
  traffic: "vessels",
  ports: "ports",
  anchorages: "anchorages",
  anchorage: "anchorages",
  weather: "weather",
  findings: "intelligenceFindings",
  incidents: "incidents",
  berths: "berths",
  terminals: "terminals",
  routes: "routes",
  graticule: "graticule",
  eez: "nigeria-eez",
  buildings: "buildings",
};

const RISK_WORDS: Readonly<Record<string, Exclude<RiskLevel, "UNKNOWN" | "CLEAN">>> = {
  critical: "CRITICAL",
  "high-risk": "HIGH",
  "high risk": "HIGH",
  high: "HIGH",
  medium: "MEDIUM",
  moderate: "MEDIUM",
  low: "LOW",
};

export function readMapControl(input: MapControlInput): MapControlReading {
  const said = input.text.trim();
  if (said.length === 0) return null;
  const lower = said.toLowerCase();

  const layer = layerInstruction(lower);
  if (layer) return layer;

  const replay = replayInstruction(lower, input);
  if (replay) return replay;

  const evidence = evidenceInstruction(lower, input);
  if (evidence) return evidence;

  const compare = compareInstruction(lower, input);
  if (compare) return compare;

  const brief = briefInstruction(lower, input);
  if (brief) return brief;

  const filter = filterInstruction(lower);
  if (filter) return filter;

  /*
   * Presets last. "Show Apapa" is a place instruction the existing
   * navigation translator already handles well; a preset only wins when
   * the officer asked for a view or a scope the places registry has no
   * framing for.
   */
  return presetInstruction(lower);
}

function layerInstruction(lower: string): MapControlReading {
  const show = /\b(show|display|turn on|enable|add)\b.*\blayer\b/.test(lower);
  const hide = /\b(hide|turn off|disable|remove|drop)\b.*\blayer\b/.test(lower);
  if (!show && !hide) return null;

  const named = resolveLayer(lower);
  if (!named) {
    return {
      kind: "UNRESOLVED",
      speech: "I did not recognise that layer. Ask for one of the layers listed in the map panel.",
    };
  }
  return show
    ? {
        kind: "ACTION",
        action: { type: "SHOW_LAYER", layerId: named.id },
        speech: `Showing the ${named.label} layer.`,
      }
    : {
        kind: "ACTION",
        action: { type: "HIDE_LAYER", layerId: named.id },
        speech: `Hiding the ${named.label} layer.`,
      };
}

function resolveLayer(lower: string): { readonly id: string; readonly label: string } | null {
  for (const definition of layerRegistry.list()) {
    if (
      lower.includes(definition.label.toLowerCase()) ||
      lower.includes(definition.id.toLowerCase())
    )
      return { id: definition.id, label: definition.label };
  }
  for (const [word, id] of Object.entries(LAYER_ALIASES)) {
    if (!new RegExp(`\\b${word}\\b`).test(lower)) continue;
    const definition = layerRegistry.list().find((entry) => entry.id === id);
    if (definition) return { id: definition.id, label: definition.label };
  }
  return null;
}

function presetInstruction(lower: string): MapControlReading {
  if (!/\b(fly|zoom|take me|show|go)\b/.test(lower)) return null;
  /*
   * Only wording that names a scope or a view. Without this the word
   * "show" alone would drag any sentence mentioning Nigeria into a
   * camera movement.
   */
  if (!/\b(view|globe|global|world|scope|earth|preset)\b/.test(lower)) return null;

  const preset = EARTH_CAMERA_PRESETS.find(
    (entry) => lower.includes(entry.label.toLowerCase()) || lower.includes(entry.id),
  );
  const globe = /\b(globe|global|world|earth)\b/.test(lower)
    ? EARTH_CAMERA_PRESETS.find((entry) => entry.id === "global")
    : undefined;
  const chosen = preset ?? globe;
  if (!chosen) return null;
  return {
    kind: "ACTION",
    action: { type: "FLY_TO", presetId: chosen.id },
    speech: `Moving to the ${chosen.label} view.`,
  };
}

function filterInstruction(lower: string): MapControlReading {
  if (!/\b(filter|only show|show only|narrow|just)\b/.test(lower)) return null;
  if (!/\b(vessel|vessels|ship|ships|fleet)\b/.test(lower) && !/\brisk\b/.test(lower)) return null;

  for (const [word, level] of Object.entries(RISK_WORDS)) {
    if (!lower.includes(word)) continue;
    return {
      kind: "ACTION",
      action: { type: "FILTER_VESSELS", patch: { riskLevel: level } },
      /*
       * States the narrowing, not a count. The honest total stays behind
       * the map, and promising a number before the predicate ran would be
       * an answer nobody computed.
       */
      speech: `Narrowing the fleet to ${level.toLowerCase()} risk. The full total stays available behind the filter.`,
    };
  }
  return {
    kind: "UNRESOLVED",
    speech:
      "I can narrow the fleet by risk, type, flag, destination, arrival window or position age. Which one?",
  };
}

function replayInstruction(lower: string, input: MapControlInput): MapControlReading {
  if (!/\b(replay|rewind|playback|play back)\b/.test(lower)) return null;

  if (/\b(stop|pause|end|halt)\b/.test(lower)) {
    return { kind: "ACTION", action: { type: "STOP_REPLAY" }, speech: "Pausing the replay." };
  }

  if (!input.contextVesselImo) {
    return {
      kind: "UNRESOLVED",
      speech: "Which vessel should I replay? Select it first.",
    };
  }
  const hours = readHours(lower);
  return {
    kind: "ACTION",
    action: { type: "START_REPLAY", imo: input.contextVesselImo, hours },
    speech: hours
      ? `Replaying the last ${hours} hours recorded for ${input.contextVesselName ?? input.contextVesselImo}.`
      : `Replaying the movement recorded for ${input.contextVesselName ?? input.contextVesselImo}.`,
  };
}

function readHours(lower: string): number | undefined {
  const match = lower.match(/\b(\d{1,3})\s*(?:h|hr|hrs|hour|hours)\b/);
  if (match) return Number(match[1]);
  return /\bday\b/.test(lower) ? 24 : undefined;
}

function evidenceInstruction(lower: string, input: MapControlInput): MapControlReading {
  if (!/\b(evidence|provenance|sources?|citations?)\b/.test(lower)) return null;
  if (!/\b(show|open|see|view|where|what)\b/.test(lower)) return null;
  if (!input.contextVesselImo) {
    return {
      kind: "UNRESOLVED",
      speech: "Which vessel's evidence would you like? Select it first.",
    };
  }
  return {
    kind: "ACTION",
    action: { type: "SHOW_EVIDENCE", imo: input.contextVesselImo },
    speech: `Opening the evidence held for ${input.contextVesselName ?? input.contextVesselImo}, with its sources and confidence.`,
  };
}

function compareInstruction(lower: string, input: MapControlInput): MapControlReading {
  if (!/\b(compare|versus|vs\.?|side by side)\b/.test(lower)) return null;
  return {
    kind: "ACTION",
    action: {
      type: "COMPARE_ENTITIES",
      imos: input.contextVesselImo ? [input.contextVesselImo] : [],
    },
    speech: "Checking whether a comparison is available.",
  };
}

function briefInstruction(lower: string, input: MapControlInput): MapControlReading {
  if (!/\b(brief|briefing|report|summary|summarise|summarize)\b/.test(lower)) return null;
  if (!/\b(generate|create|compile|produce|write|prepare|give me|make)\b/.test(lower)) return null;
  return {
    kind: "ACTION",
    action: {
      type: "GENERATE_BRIEF",
      imo: input.contextVesselImo ?? undefined,
      subject: input.contextVesselName,
    },
    speech: input.contextVesselName
      ? `Compiling a briefing on ${input.contextVesselName}. It will carry its sources and confidence.`
      : "Compiling a briefing on the current picture. It will carry its sources and confidence.",
  };
}
