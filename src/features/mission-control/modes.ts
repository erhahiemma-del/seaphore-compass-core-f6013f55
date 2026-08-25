/**
 * Mission Control operational modes.
 *
 * Eight lenses over one intelligence environment, not eight pages. The
 * distinction is the whole design: a mode is *configuration* — which
 * KPIs lead, which map layers are lit, which panels are promoted and
 * which intelligence categories are surfaced — applied to the same
 * components reading the same services. Duplicating the surface per mode
 * would give eight things to keep in step and seven chances to drift.
 *
 * ## What a mode may and may not change
 *
 * A mode changes *emphasis*. It never changes truth. Switching to
 * Revenue Assurance promotes revenue KPIs and reorders panels; it does
 * not alter a figure, relax a confidence tier, or make an unconnected
 * provider appear connected. Every value stays whatever the coverage
 * model and the intelligence broker report it to be, in every mode.
 *
 * That matters here more than it looks. The reference design for this
 * surface shows populated counters — vessels at sea, revenue at risk, a
 * confidence percentage. In this deployment no AIS provider is
 * connected, so the honest value behind most of those is
 * `AWAITING_CREDENTIALS`, and `KpiCoverage` already models exactly that.
 * A mode selects which KPIs an officer sees first. It cannot invent one.
 *
 * ## Why this module is pure
 *
 * Same reasoning as `perspective.ts` and `camera.ts`: the policy is data
 * about layout, so it is testable without rendering anything. The shell
 * reads a mode and arranges itself; it holds no opinion of its own.
 */
import type { KpiDomainKey } from "@/lib/intelligence/coverage-model";

/** The eight lenses. Ids are URL-safe — a mode is a shareable view. */
export type MissionModeId =
  | "national-overview"
  | "operational-pressure"
  | "investigation-focus"
  | "revenue-assurance"
  | "compliance-review"
  | "port-intelligence"
  | "incident-response"
  | "executive-briefing";

/**
 * Panels the shell can arrange.
 *
 * Named for what they answer rather than where they sit, so a mode
 * expresses priority without also dictating pixels — the grid decides
 * placement from the order it is given.
 */
export type MissionPanelId =
  | "national-map"
  | "priority-intelligence"
  | "active-workflows"
  | "revenue-overview"
  | "incidents"
  | "data-confidence"
  | "work-queue"
  | "activity-timeline"
  | "focus-lens"
  | "data-sources"
  | "system-status";

/**
 * Logical map layers a mode may light.
 *
 * Deliberately the *logical* keys the layer registry already owns, not
 * MapLibre render-layer ids. A mode asks for "ports"; which render
 * layers that resolves to stays the registry's decision, exactly as it
 * does for the officer's own toggles.
 */
export type MissionMapLayerKey =
  | "vessels"
  | "ports"
  | "voyages"
  | "eezBoundary"
  | "graticule"
  | "buildings"
  | "investigArea";

/** Which intelligence categories a mode promotes in the priority panel. */
export type IntelligenceCategory = "critical" | "requires-review" | "monitor" | "informational";

export interface MissionMode {
  readonly id: MissionModeId;
  readonly label: string;
  /** One line stating what this lens is for. Shown as the tab's title. */
  readonly purpose: string;
  /**
   * KPI domains this mode leads with, most important first.
   *
   * Domains, not values — the coverage model supplies the number and its
   * state. A domain absent here is not hidden, only demoted, because an
   * officer in Revenue Assurance still needs to see that AIS is down.
   */
  readonly leadKpis: readonly KpiDomainKey[];
  /** Panels in priority order. The grid places them; this ranks them. */
  readonly panels: readonly MissionPanelId[];
  /** Logical layers switched on when entering this mode. */
  readonly mapLayers: readonly MissionMapLayerKey[];
  /** Intelligence categories promoted in the priority panel. */
  readonly intelligence: readonly IntelligenceCategory[];
}

/**
 * The mode table.
 *
 * Every mode carries the full panel list. Ordering is the mechanism, not
 * omission — a lens that *removed* incidents would let an officer in
 * Revenue Assurance miss a critical incident entirely, which is the
 * failure a national picture exists to prevent. Modes reorder; they do
 * not conceal.
 */
export const MISSION_MODES: Readonly<Record<MissionModeId, MissionMode>> = {
  "national-overview": {
    id: "national-overview",
    label: "National Overview",
    purpose: "The whole picture — what is happening across Nigerian waters now.",
    leadKpis: ["vessel", "risk", "revenue", "manifest", "container", "historical"],
    panels: [
      "national-map",
      "priority-intelligence",
      "active-workflows",
      "revenue-overview",
      "incidents",
      "data-confidence",
      "work-queue",
      "activity-timeline",
      "focus-lens",
      "data-sources",
      "system-status",
    ],
    mapLayers: ["vessels", "ports", "eezBoundary", "graticule"],
    intelligence: ["critical", "requires-review", "monitor", "informational"],
  },

  "operational-pressure": {
    id: "operational-pressure",
    label: "Operational Pressure",
    purpose: "Where the system is loaded — queues, blockages and workload.",
    leadKpis: ["manifest", "container", "vessel", "revenue", "risk", "historical"],
    panels: [
      "active-workflows",
      "work-queue",
      "national-map",
      "incidents",
      "priority-intelligence",
      "activity-timeline",
      "revenue-overview",
      "data-confidence",
      "focus-lens",
      "data-sources",
      "system-status",
    ],
    mapLayers: ["ports", "vessels", "graticule"],
    intelligence: ["requires-review", "critical", "monitor", "informational"],
  },

  "investigation-focus": {
    id: "investigation-focus",
    label: "Investigation Focus",
    purpose: "Open cases, the evidence behind them and what they are waiting on.",
    leadKpis: ["risk", "vessel", "manifest", "historical", "revenue", "container"],
    panels: [
      "priority-intelligence",
      "focus-lens",
      "active-workflows",
      "national-map",
      "activity-timeline",
      "work-queue",
      "incidents",
      "data-confidence",
      "revenue-overview",
      "data-sources",
      "system-status",
    ],
    // The officer-drawn investigation area is the point of this lens.
    mapLayers: ["investigArea", "vessels", "ports", "graticule"],
    intelligence: ["critical", "requires-review", "monitor", "informational"],
  },

  "revenue-assurance": {
    id: "revenue-assurance",
    label: "Revenue Assurance",
    purpose: "Assessed against collected — discrepancies, leakage and exposure.",
    leadKpis: ["revenue", "manifest", "container", "vessel", "risk", "historical"],
    panels: [
      "revenue-overview",
      "active-workflows",
      "work-queue",
      "priority-intelligence",
      "national-map",
      "activity-timeline",
      "incidents",
      "data-confidence",
      "focus-lens",
      "data-sources",
      "system-status",
    ],
    mapLayers: ["ports", "voyages", "vessels"],
    intelligence: ["requires-review", "critical", "monitor", "informational"],
  },

  "compliance-review": {
    id: "compliance-review",
    label: "Compliance Review",
    purpose: "Requirements, exceptions and what is outstanding against them.",
    leadKpis: ["risk", "manifest", "vessel", "container", "revenue", "historical"],
    panels: [
      "priority-intelligence",
      "active-workflows",
      "work-queue",
      "data-confidence",
      "national-map",
      "incidents",
      "activity-timeline",
      "revenue-overview",
      "focus-lens",
      "data-sources",
      "system-status",
    ],
    mapLayers: ["vessels", "ports", "eezBoundary"],
    intelligence: ["requires-review", "critical", "monitor", "informational"],
  },

  "port-intelligence": {
    id: "port-intelligence",
    label: "Port Intelligence",
    purpose: "The estate — approaches, calls and activity at each port.",
    leadKpis: ["container", "manifest", "vessel", "revenue", "risk", "historical"],
    panels: [
      "national-map",
      "focus-lens",
      "active-workflows",
      "activity-timeline",
      "priority-intelligence",
      "incidents",
      "revenue-overview",
      "work-queue",
      "data-confidence",
      "data-sources",
      "system-status",
    ],
    // Buildings only earn their place here: they draw nothing below zoom
    // 13, and this is the lens an officer inspects a berth from.
    mapLayers: ["ports", "vessels", "buildings", "graticule"],
    intelligence: ["monitor", "requires-review", "critical", "informational"],
  },

  "incident-response": {
    id: "incident-response",
    label: "Incident Response",
    purpose: "What is happening now and who is responding to it.",
    leadKpis: ["risk", "vessel", "container", "manifest", "revenue", "historical"],
    panels: [
      "incidents",
      "national-map",
      "priority-intelligence",
      "activity-timeline",
      "work-queue",
      "active-workflows",
      "focus-lens",
      "data-confidence",
      "revenue-overview",
      "data-sources",
      "system-status",
    ],
    mapLayers: ["vessels", "ports", "investigArea", "eezBoundary"],
    intelligence: ["critical", "requires-review", "monitor", "informational"],
  },

  "executive-briefing": {
    id: "executive-briefing",
    label: "Executive Briefing",
    purpose: "The summary position — what leadership needs, and how sure we are.",
    leadKpis: ["revenue", "risk", "vessel", "manifest", "container", "historical"],
    panels: [
      "data-confidence",
      "priority-intelligence",
      "revenue-overview",
      "national-map",
      "incidents",
      "active-workflows",
      "activity-timeline",
      "work-queue",
      "focus-lens",
      "data-sources",
      "system-status",
    ],
    mapLayers: ["vessels", "ports", "eezBoundary"],
    // Leadership needs the exceptions, not the running commentary.
    intelligence: ["critical", "requires-review", "monitor", "informational"],
  },
} as const;

/** Tab order. Explicit, because object key order is not a design decision. */
export const MISSION_MODE_ORDER: readonly MissionModeId[] = [
  "national-overview",
  "operational-pressure",
  "investigation-focus",
  "revenue-assurance",
  "compliance-review",
  "port-intelligence",
  "incident-response",
  "executive-briefing",
] as const;

/** The mode an officer lands on. The whole picture, before any lens. */
export const DEFAULT_MISSION_MODE: MissionModeId = "national-overview";

/**
 * Resolve a mode id from an untrusted source — a URL, a stored value.
 *
 * Falls back to the default rather than throwing: a stale link is a
 * reason to show the national picture, not an error page.
 */
export function resolveMissionMode(id: string | null | undefined): MissionMode {
  /*
   * `Object.hasOwn`, not `in`.
   *
   * `in` walks the prototype chain, so `"__proto__"`, `"toString"` and
   * `"constructor"` all answer true and this returned something that is
   * not a mode at all — a crafted or merely stale link produced an
   * object with no `id`, and the shell rendered nothing. Own-property
   * lookup is the fix, and the reason a URL is untrusted input even
   * when it is only naming a tab.
   */
  if (id && Object.hasOwn(MISSION_MODES, id)) return MISSION_MODES[id as MissionModeId];
  return MISSION_MODES[DEFAULT_MISSION_MODE];
}

/**
 * Rank for one panel under one mode. Lower sorts first.
 *
 * A panel the mode does not list sorts last rather than disappearing —
 * see the note on the mode table about reordering rather than
 * concealing.
 */
export function panelRank(mode: MissionMode, panel: MissionPanelId): number {
  const index = mode.panels.indexOf(panel);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/** Panels in this mode's order, with anything unlisted appended. */
export function orderPanels(
  mode: MissionMode,
  available: readonly MissionPanelId[],
): readonly MissionPanelId[] {
  return [...available].sort((a, b) => panelRank(mode, a) - panelRank(mode, b));
}

/**
 * KPI domains in this mode's order, with anything unlisted appended.
 *
 * Demotion, never omission: an officer reading Revenue Assurance still
 * needs to see that the vessel feed is down, because it is the reason
 * half their revenue picture is unverifiable.
 */
export function orderKpis(
  mode: MissionMode,
  available: readonly KpiDomainKey[],
): readonly KpiDomainKey[] {
  const rank = (key: KpiDomainKey) => {
    const index = mode.leadKpis.indexOf(key);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...available].sort((a, b) => rank(a) - rank(b));
}
