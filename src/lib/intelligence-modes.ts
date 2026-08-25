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
  icon:
    | "overview"
    | "vessel"
    | "revenue"
    | "risk"
    | "investigation"
    | "port"
    | "incident"
    | "briefing";

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
  /**
   * Contextual search domains this lens emphasises. Presentation-only —
   * Global Search stays universal; this changes emphasis, never results.
   */
  contextDomains: readonly string[];
}

export const INTELLIGENCE_MODES: IntelligenceMode[] = [
  {
    key: "imo",
    label: "National Overview",
    icon: "overview",
    shortcut: 1,
    placeholder: "Search maritime intelligence…",
    helper: "Search across the national maritime operating picture.",
    prefix: "IMO: ",
    aiContext: "National Maritime Overview",
    contextDomains: ["national activity", "ports", "vessels", "incidents", "routes", "zones"],
    suggestions: ["Apapa arrivals", "High-risk vessels", "Revenue watch", "Open investigations"],
  },
  {
    key: "vessel",
    label: "Vessel Operations",
    icon: "vessel",
    shortcut: 2,
    placeholder: "Search AIS anomalies…",
    helper: "Investigate vessel movement, gaps and route behaviour.",
    prefix: "VESSEL: ",
    aiContext: "AIS Investigation",
    contextDomains: ["IMO", "MMSI", "vessel", "voyage", "movement", "last position"],
    suggestions: ["AIS gaps", "Route deviations", "Dark periods", "Port call history"],
  },
  {
    key: "manifest",
    label: "Revenue Assurance",
    icon: "revenue",
    shortcut: 3,
    placeholder: "Search revenue evidence…",
    helper: "Review manifests, cargo declarations and leakage indicators.",
    prefix: "MANIFEST: ",
    aiContext: "Revenue Assurance",
    contextDomains: ["manifests", "cargo", "quantity", "voyage", "company", "discrepancies"],
    suggestions: [
      "Revenue discrepancies",
      "Duplicate manifests",
      "HS code mismatch",
      "Under-declaration",
    ],
  },
  {
    key: "container",
    label: "Risk & Compliance",
    icon: "risk",
    shortcut: 4,
    placeholder: "Search compliance cases…",
    helper: "Review sanctions, watchlist and inspection evidence.",
    prefix: "CONTAINER: ",
    aiContext: "Compliance Review",
    contextDomains: ["vessels", "companies", "sanctions", "watchlists", "incidents"],
    suggestions: [
      "Watchlist matches",
      "Sanctions exposure",
      "Inspection records",
      "Seal verification",
    ],
  },
  {
    key: "company",
    label: "Investigation",
    icon: "investigation",
    shortcut: 5,
    placeholder: "Search ownership networks…",
    helper: "Investigate companies, beneficial owners and related vessels.",
    prefix: "COMPANY: ",
    aiContext: "Ownership Investigation",
    contextDomains: ["vessels", "companies", "incidents", "evidence", "cases"],
    suggestions: ["Open cases", "Linked companies", "Evidence packages", "Related vessels"],
  },
  {
    key: "port",
    label: "Port Intelligence",
    icon: "port",
    shortcut: 6,
    placeholder: "Search port operations…",
    helper: "Review port congestion, arrivals and berth-level context.",
    prefix: "PORT: ",
    aiContext: "Port Congestion",
    contextDomains: [
      "ports",
      "port calls",
      "arrivals",
      "congestion",
      "anchorage",
      "berth activity",
    ],
    suggestions: ["Congestion analysis", "Expected arrivals", "Anchorage queue", "Berth delays"],
  },
  {
    key: "bol",
    label: "Incident Response",
    icon: "incident",
    shortcut: 7,
    placeholder: "Search incidents and disruption…",
    helper: "Assess incidents, weather and maritime disruption signals.",
    prefix: "BOL: ",
    aiContext: "Environmental Risk",
    contextDomains: ["incidents", "vessels", "locations", "events", "zones"],
    suggestions: ["Active incidents", "Affected zones", "Vessels in area", "Recent events"],
  },
  {
    key: "voyage",
    label: "Executive Briefing",
    icon: "briefing",
    shortcut: 8,
    placeholder: "Search vessel risk…",
    helper: "Review vessel exposure, behaviour and intelligence history.",
    prefix: "VOYAGE: ",
    aiContext: "Vessel Risk",
    contextDomains: [
      "national patterns",
      "strategic risk",
      "revenue",
      "compliance",
      "major events",
      "trends",
    ],
    suggestions: ["National patterns", "Strategic risk", "Revenue trend", "Major events"],
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
