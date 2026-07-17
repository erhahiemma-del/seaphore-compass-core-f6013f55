/**
 * Intelligence Modes — the interactive entity chips beneath the
 * Mission Intelligence Command Bar.
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

export interface IntelligenceMode {
  /** Canonical dispatcher entity key. */
  key: EntityType;
  /** Chip label shown to officers. */
  label: string;
  /** Icon slot key (bound to a lucide icon in the UI). */
  icon:
    | "hash"
    | "anchor"
    | "building"
    | "manifest"
    | "container"
    | "bol"
    | "voyage"
    | "port";
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
    label: "IMO",
    icon: "hash",
    shortcut: 1,
    placeholder: "Search IMO Number…",
    helper: "Find vessel information using an IMO number.",
    prefix: "IMO: ",
    aiContext: "IMO Intelligence",
    suggestions: [
      "View vessel profile",
      "Show ownership history",
      "Last known position",
      "Previous investigations",
    ],
  },
  {
    key: "vessel",
    label: "Vessel",
    icon: "anchor",
    shortcut: 2,
    placeholder: "Search Vessel Name or IMO…",
    helper: "Search vessels by name or registration.",
    prefix: "VESSEL: ",
    aiContext: "Vessel Intelligence",
    suggestions: [
      "Behavioural anomalies",
      "Port call history",
      "Flag changes",
      "AIS gaps",
    ],
  },
  {
    key: "company",
    label: "Company",
    icon: "building",
    shortcut: 3,
    placeholder: "Search Shipping Company…",
    helper: "Search shipping companies and ownership records.",
    prefix: "COMPANY: ",
    aiContext: "Company Intelligence",
    suggestions: [
      "Beneficial owners",
      "Suspicious ownership patterns",
      "Related vessels",
      "Sanctions exposure",
    ],
  },
  {
    key: "manifest",
    label: "Manifest",
    icon: "manifest",
    shortcut: 4,
    placeholder: "Search Manifest Number…",
    helper: "Locate manifests and related cargo records.",
    prefix: "MANIFEST: ",
    aiContext: "Manifest Intelligence",
    suggestions: [
      "Find duplicate manifests",
      "Revenue discrepancies",
      "Missing documentation",
      "Validation status",
    ],
  },
  {
    key: "container",
    label: "Container",
    icon: "container",
    shortcut: 5,
    placeholder: "Search Container Number…",
    helper: "Track individual containers across voyages.",
    prefix: "CONTAINER: ",
    aiContext: "Container Intelligence",
    suggestions: [
      "Track container",
      "Seal verification",
      "Cargo history",
      "Inspection records",
    ],
  },
  {
    key: "bol",
    label: "BOL",
    icon: "bol",
    shortcut: 6,
    placeholder: "Search Bill of Lading Number…",
    helper: "Locate bills of lading and consignment chains.",
    prefix: "BOL: ",
    aiContext: "Bill of Lading Intelligence",
    suggestions: [
      "Consignor / consignee chain",
      "Linked manifests",
      "Payment terms anomalies",
      "Endorsement history",
    ],
  },
  {
    key: "voyage",
    label: "Voyage",
    icon: "voyage",
    shortcut: 7,
    placeholder: "Search Voyage Reference…",
    helper: "Explore voyages, legs, and deviations.",
    prefix: "VOYAGE: ",
    aiContext: "Voyage Intelligence",
    suggestions: [
      "Route deviations",
      "STS events",
      "Dark periods",
      "ETA vs actual",
    ],
  },
  {
    key: "port",
    label: "Port",
    icon: "port",
    shortcut: 8,
    placeholder: "Search Port Name or UN/LOCODE…",
    helper: "Search ports and port intelligence.",
    prefix: "PORT: ",
    aiContext: "Port Intelligence",
    suggestions: [
      "Congestion analysis",
      "Risk heatmap",
      "Expected arrivals",
      "Compliance alerts",
    ],
  },
];

export const MODE_BY_KEY: Record<EntityType, IntelligenceMode> =
  Object.fromEntries(INTELLIGENCE_MODES.map((m) => [m.key, m])) as Record<
    EntityType,
    IntelligenceMode
  >;

export const DEFAULT_MODE: EntityType = "imo";

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
