/**
 * Intelligence Modes — workflow mission contexts for the Mission
 * Intelligence Command Bar.
 *
 * Each mode is a self-contained intelligence context:
 *   - chip identity (label, icon key)
 *   - search UX (placeholder, helper text, prefix)
 *   - suggested queries
 *   - AI awareness label (used to prime Copilot / Gemini prompts)
 *   - keyboard shortcut (Alt+N)
 *
 * The chip's dispatch target is defined in `command-dispatch.ts`
 * via TYPE_ROUTE so the routing layer stays a single source of truth.
 */

import type { EntityType } from "@/lib/command-dispatch";
import type { MapSelectionKind } from "@/services/geospatial/selection";

export interface IntelligenceMode {
  /** Canonical dispatcher entity key. */
  key: EntityType;
   /** Mission label shown to officers. */
  label: string;
  /** Icon slot key (bound to a lucide icon in the UI). */
  icon: "hash" | "anchor" | "building" | "manifest" | "container" | "bol" | "voyage" | "port";
  /** Alt+N shortcut number (1-based, 0 = no shortcut). */
  shortcut: number;
  /** Search input placeholder. */
  placeholder: string;
  /** Sub-caption beneath the search input. */
  helper: string;
  /** Prefix auto-inserted into the search input (e.g. "IMO: "). */
  prefix: string;
  /** Human-readable AI context label. */
  aiContext: string;
  /** Suggested one-tap intelligence queries for this mode. */
  suggestions: string[];
}

export const INTELLIGENCE_MODES: IntelligenceMode[] = [
  {
    key: "imo",
    label: "National Overview",
    icon: "hash",
    shortcut: 1,
    placeholder: "Search maritime intelligence…",
    helper: "Search across the national maritime operating picture.",
    prefix: "IMO: ",
    aiContext: "National Maritime Overview",
    suggestions: ["Apapa arrivals", "High-risk vessels", "Revenue watch", "Open investigations"],
  },
  {
    key: "vessel",
    label: "AIS Investigation",
    icon: "anchor",
    shortcut: 2,
    placeholder: "Search AIS anomalies…",
    helper: "Investigate vessel movement, gaps and route behaviour.",
    prefix: "VESSEL: ",
    aiContext: "AIS Investigation",
    suggestions: ["AIS gaps", "Route deviations", "Dark periods", "Port call history"],
  },
  {
    key: "company",
    label: "Ownership Investigation",
    icon: "building",
    shortcut: 3,
    placeholder: "Search ownership networks…",
    helper: "Investigate companies, beneficial owners and related vessels.",
    prefix: "COMPANY: ",
    aiContext: "Ownership Investigation",
    suggestions: ["Beneficial owners", "Shell links", "Related vessels", "Director changes"],
  },
  {
    key: "manifest",
    label: "Revenue Assurance",
    icon: "manifest",
    shortcut: 4,
    placeholder: "Search revenue evidence…",
    helper: "Review manifests, cargo declarations and leakage indicators.",
    prefix: "MANIFEST: ",
    aiContext: "Revenue Assurance",
    suggestions: ["Revenue discrepancies", "Duplicate manifests", "HS code mismatch", "Under-declaration"],
  },
  {
    key: "container",
    label: "Compliance Review",
    icon: "container",
    shortcut: 5,
    placeholder: "Search compliance cases…",
    helper: "Review sanctions, watchlist and inspection evidence.",
    prefix: "CONTAINER: ",
    aiContext: "Compliance Review",
    suggestions: ["Watchlist matches", "Sanctions exposure", "Inspection records", "Seal verification"],
  },
  {
    key: "bol",
    label: "Environmental Risk",
    icon: "bol",
    shortcut: 6,
    placeholder: "Search environmental risk…",
    helper: "Assess weather, port conditions and maritime disruption signals.",
    prefix: "BOL: ",
    aiContext: "Environmental Risk",
    suggestions: ["Weather disruption", "Sea-state risk", "Port delay drivers", "Expected arrivals"],
  },
  {
    key: "voyage",
    label: "Vessel Risk",
    icon: "voyage",
    shortcut: 7,
    placeholder: "Search vessel risk…",
    helper: "Review vessel exposure, behaviour and intelligence history.",
    prefix: "VOYAGE: ",
    aiContext: "Vessel Risk",
    suggestions: ["Risk exposure", "Flag changes", "STS events", "Previous investigations"],
  },
  {
    key: "port",
    label: "Port Congestion",
    icon: "port",
    shortcut: 8,
    placeholder: "Search port operations…",
    helper: "Review port congestion, arrivals and berth-level context.",
    prefix: "PORT: ",
    aiContext: "Port Congestion",
    suggestions: ["Congestion analysis", "Expected arrivals", "Anchorage queue", "Berth delays"],
  },
];

export const MODE_BY_KEY: Record<EntityType, IntelligenceMode> = Object.fromEntries(
  INTELLIGENCE_MODES.map((m) => [m.key, m]),
) as Record<EntityType, IntelligenceMode>;

export const DEFAULT_MODE: EntityType = "imo";

/**
 * The mode a selection implies, or null when it implies none.
 *
 * Deliberately partial. `EntityType` covers eight search vocabularies;
 * `MapSelectionKind` covers thirteen things on a map, and most of them
 * — an AIS gap, a SAR detection, a geofence — have no search vocabulary
 * of their own. Mapping those to some near-neighbour would silently
 * retarget the officer's next search at the wrong index.
 *
 * Null means "this selection says nothing about how you want to search",
 * and the caller leaves the mode alone. That is the honest answer far
 * more often than a forced match.
 */
export function modeForSelectionKind(kind: MapSelectionKind | null): EntityType | null {
  switch (kind) {
    case "vessel":
      return "vessel";
    // A terminal, berth or anchorage is somewhere inside a port, and port
    // search is the vocabulary that reaches all three.
    case "port":
    case "terminal":
    case "berth":
    case "anchorage":
      return "port";
    default:
      return null;
  }
}

/**
 * Strip the mode prefix from a raw input, leaving only the user's query.
 * Case-insensitive on the prefix token.
 */
export function stripPrefix(raw: string, mode: IntelligenceMode): string {
  const p = mode.prefix.trim().toUpperCase();
  const trimmed = raw.trimStart();
  if (trimmed.toUpperCase().startsWith(p)) {
    return trimmed.slice(p.length).trimStart();
  }
  return raw.trim();
}
