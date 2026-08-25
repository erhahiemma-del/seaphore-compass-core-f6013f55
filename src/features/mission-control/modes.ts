/**
 * Mission Control operational modes.
 *
 * Eight lenses over one intelligence environment, not eight pages. The
 * distinction is the whole design: a mode is *configuration* — which
 * KPIs lead, which panels are promoted, which layers are recommended and
 * which intelligence categories surface — applied to the same components
 * reading the same services. Duplicating the surface per mode would give
 * eight things to keep in step and seven chances to drift.
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
  | "national-picture"
  | "vessel-operations"
  | "revenue-assurance"
  | "risk-compliance"
  | "port-intelligence"
  | "investigation"
  | "decision-coordination"
  | "strategic-intelligence";

/**
 * The regions Mission Control renders, as logical ids.
 *
 * Named for the component each corresponds to, so a mode's ordering can
 * be checked against what the page actually contains rather than against
 * an aspirational layout. No JSX, no routes, no values — see the tests.
 */
export type MissionPanelId =
  | "maritime-picture"
  | "intelligence-feed"
  | "revenue-assurance"
  | "manifest-intelligence"
  | "compliance-watchlist"
  | "port-operations"
  | "cargo-workspace"
  | "todays-priorities"
  | "recent-briefings"
  | "focus-rail";

/**
 * The panels a mode is actually permitted to reorder.
 *
 * Not every region can move without the page appearing to lurch. The map
 * and the intelligence feed share an asymmetric two-column row and are
 * the officer's spatial anchor — swapping them would resize both and
 * make the surface feel unstable, which the composition rules explicitly
 * forbid. The four operational panels below sit in a uniform grid, so
 * reordering them changes reading order and nothing else.
 *
 * This is the honest boundary of "dynamic composition": modes reorder
 * what can be reordered safely, and the rest of the page stays where the
 * officer left it.
 */
export const COMPOSABLE_PANELS: readonly MissionPanelId[] = [
  "revenue-assurance",
  "manifest-intelligence",
  "compliance-watchlist",
  "port-operations",
] as const;

/**
 * Logical map layers a mode may recommend.
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

/**
 * A suggested next step.
 *
 * Deliberately static per mode rather than derived: what a lens is *for*
 * does not change with the data, and deriving it would make the panel's
 * contents depend on provider availability — so an officer whose AIS
 * feed is down would also lose the action that tells them to go and
 * check provider health.
 *
 * Whether an action is *enabled* is a runtime question and belongs to
 * the component, which can read coverage and workflow state. This module
 * only says which actions belong to which lens.
 */
export interface RecommendedAction {
  readonly id: string;
  readonly label: string;
  /** An existing application route. Never a placeholder. */
  readonly href: string;
  /** One line on why this lens suggests it. */
  readonly rationale: string;
}

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
  /**
   * Layers this lens recommends.
   *
   * A recommendation, never an instruction — see `map-recommendation.ts`
   * for why a mode may not write the officer's active layers.
   */
  readonly mapLayers: readonly MissionMapLayerKey[];
  /** Intelligence categories promoted in the priority panel. */
  readonly intelligence: readonly IntelligenceCategory[];
  /**
   * What this lens suggests the officer does next, in order.
   *
   * Every action names an existing route. An action that led nowhere
   * would be worse than no action at all — it teaches an officer that
   * the surface is decorative. A test asserts every `href` here is a
   * route that actually exists in the router.
   */
  readonly actions: readonly RecommendedAction[];
}

/**
 * The mode table.
 *
 * Every mode carries the full panel list. Ordering is the mechanism, not
 * omission — a lens that *removed* the compliance panel would let an
 * officer in Revenue Assurance miss a watchlist match entirely, which is
 * the failure a national picture exists to prevent. Modes reorder; they
 * do not conceal.
 */
export const MISSION_MODES: Readonly<Record<MissionModeId, MissionMode>> = {
  "national-picture": {
    id: "national-picture",
    label: "National Overview",
    purpose: "The whole picture — what is happening across Nigerian waters now.",
    leadKpis: ["vessel", "risk", "revenue", "manifest", "container", "historical"],
    panels: [
      "maritime-picture",
      "intelligence-feed",
      "port-operations",
      "revenue-assurance",
      "compliance-watchlist",
      "manifest-intelligence",
      "cargo-workspace",
      "todays-priorities",
      "recent-briefings",
      "focus-rail",
    ],
    mapLayers: ["vessels", "ports", "eezBoundary", "graticule"],
    intelligence: ["critical", "requires-review", "monitor", "informational"],
    actions: [
      {
        id: "review-priority",
        label: "Review priority intelligence",
        href: "/detect",
        rationale: "What the detection layer has surfaced but nobody has triaged.",
      },
      {
        id: "source-health",
        label: "Review source health",
        href: "/data-sources",
        rationale: "The national picture is only as complete as the feeds behind it.",
      },
      {
        id: "open-command",
        label: "Open Command Center",
        href: "/command-center",
        rationale: "Where a national priority becomes coordinated work.",
      },
    ],
  },

  "vessel-operations": {
    id: "vessel-operations",
    label: "Vessel Operations",
    purpose: "Movement, voyages and port calls — and whether AIS can see them.",
    leadKpis: ["vessel", "container", "manifest", "risk", "revenue", "historical"],
    panels: [
      "maritime-picture",
      "port-operations",
      "intelligence-feed",
      "manifest-intelligence",
      "compliance-watchlist",
      "revenue-assurance",
      "cargo-workspace",
      "todays-priorities",
      "recent-briefings",
      "focus-rail",
    ],
    mapLayers: ["vessels", "voyages", "ports", "graticule"],
    intelligence: ["requires-review", "critical", "monitor", "informational"],
    actions: [
      {
        id: "vessel-register",
        label: "Open vessel register",
        href: "/vessel",
        rationale: "Identity and particulars for the hulls in the picture.",
      },
      {
        id: "provider-health",
        label: "Check AIS provider health",
        href: "/admin/provider-health",
        rationale: "Movement intelligence depends on a connected AIS provider.",
      },
      {
        id: "maritime-command",
        label: "Open Maritime Command",
        href: "/maritime",
        rationale: "The live map with the full operational layer set.",
      },
    ],
  },

  "revenue-assurance": {
    id: "revenue-assurance",
    label: "Revenue Assurance",
    purpose: "Assessed against collected — discrepancies, leakage and exposure.",
    leadKpis: ["revenue", "manifest", "container", "vessel", "risk", "historical"],
    panels: [
      "revenue-assurance",
      "manifest-intelligence",
      "maritime-picture",
      "intelligence-feed",
      "port-operations",
      "compliance-watchlist",
      "cargo-workspace",
      "todays-priorities",
      "recent-briefings",
      "focus-rail",
    ],
    mapLayers: ["ports", "voyages", "vessels"],
    intelligence: ["requires-review", "critical", "monitor", "informational"],
    actions: [
      {
        id: "revenue-leakage",
        label: "Investigate revenue leakage",
        href: "/revenue-leakage",
        rationale: "Where assessed and collected diverge.",
      },
      {
        id: "revenue-workspace",
        label: "Open revenue workspace",
        href: "/revenue",
        rationale: "Assessments, receipts and outstanding positions.",
      },
      {
        id: "manifest-review",
        label: "Review manifests",
        href: "/manifest",
        rationale: "Cargo declared is the basis of every assessment.",
      },
    ],
  },

  "risk-compliance": {
    id: "risk-compliance",
    label: "Risk & Compliance",
    purpose: "Requirements, exceptions and the risk signals behind them.",
    leadKpis: ["risk", "manifest", "vessel", "container", "revenue", "historical"],
    panels: [
      "compliance-watchlist",
      "intelligence-feed",
      "maritime-picture",
      "revenue-assurance",
      "manifest-intelligence",
      "port-operations",
      "todays-priorities",
      "cargo-workspace",
      "recent-briefings",
      "focus-rail",
    ],
    mapLayers: ["vessels", "ports", "eezBoundary"],
    intelligence: ["critical", "requires-review", "monitor", "informational"],
    actions: [
      {
        id: "compliance",
        label: "Open compliance monitoring",
        href: "/compliance",
        rationale: "Requirements, exceptions and what is outstanding.",
      },
      {
        id: "national-risk",
        label: "Review national risk picture",
        href: "/national-risk",
        rationale: "Aggregated risk across the maritime environment.",
      },
      {
        id: "ownership",
        label: "Inspect ownership exposure",
        href: "/ownership",
        rationale: "Corporate control is where compliance risk concentrates.",
      },
    ],
  },

  "port-intelligence": {
    id: "port-intelligence",
    label: "Port Intelligence",
    purpose: "The estate — approaches, calls and activity at each port.",
    leadKpis: ["container", "manifest", "vessel", "revenue", "risk", "historical"],
    panels: [
      "port-operations",
      "maritime-picture",
      "manifest-intelligence",
      "intelligence-feed",
      "compliance-watchlist",
      "revenue-assurance",
      "cargo-workspace",
      "todays-priorities",
      "recent-briefings",
      "focus-rail",
    ],
    // Buildings only earn their place here: they draw nothing below zoom
    // 13, and this is the lens an officer inspects a berth from.
    mapLayers: ["ports", "vessels", "buildings", "graticule"],
    intelligence: ["monitor", "requires-review", "critical", "informational"],
    actions: [
      {
        id: "ports",
        label: "Open port operations",
        href: "/ports",
        rationale: "The canonical Nigerian port estate.",
      },
      {
        id: "cargo",
        label: "Review cargo movement",
        href: "/cargo",
        rationale: "What is moving through the estate.",
      },
      {
        id: "maritime-map",
        label: "Open the map at port scale",
        href: "/maritime",
        rationale: "Approaches, berths and spatial context.",
      },
    ],
  },

  investigation: {
    id: "investigation",
    label: "Investigation",
    purpose: "Open cases, the evidence behind them and what they are waiting on.",
    leadKpis: ["risk", "vessel", "manifest", "historical", "revenue", "container"],
    panels: [
      "intelligence-feed",
      "focus-rail",
      "compliance-watchlist",
      "maritime-picture",
      "manifest-intelligence",
      "revenue-assurance",
      "port-operations",
      "recent-briefings",
      "todays-priorities",
      "cargo-workspace",
    ],
    // The officer-drawn investigation area is the point of this lens.
    mapLayers: ["investigArea", "vessels", "ports", "graticule"],
    intelligence: ["critical", "requires-review", "monitor", "informational"],
    actions: [
      {
        id: "investigations",
        label: "Open investigations",
        href: "/investigations",
        rationale: "Cases currently under way.",
      },
      {
        id: "open-case",
        label: "Start an investigation",
        href: "/investigate/open",
        rationale: "Turn a signal into a structured case.",
      },
      {
        id: "evidence",
        label: "Review evidence library",
        href: "/evidence",
        rationale: "What has been collected and what still needs verifying.",
      },
    ],
  },

  "decision-coordination": {
    id: "decision-coordination",
    label: "Decision & Coordination",
    /*
     * Not incident response.
     *
     * This lens inherited an incident-first ordering from an earlier
     * taxonomy where it was "Incident Response". The two are different
     * institutional questions: incident response asks "what is
     * happening", this asks "what is waiting on a decision, and who owes
     * it". So the work queue leads, and incidents appear because they
     * *inform* a decision rather than because they are the subject.
     */
    purpose: "What is waiting on a decision, and who owes it.",
    leadKpis: ["risk", "revenue", "manifest", "vessel", "container", "historical"],
    panels: [
      "todays-priorities",
      "intelligence-feed",
      "compliance-watchlist",
      "maritime-picture",
      "revenue-assurance",
      "manifest-intelligence",
      "port-operations",
      "recent-briefings",
      "cargo-workspace",
      "focus-rail",
    ],
    mapLayers: ["vessels", "ports", "investigArea"],
    intelligence: ["requires-review", "critical", "monitor", "informational"],
    actions: [
      {
        id: "decide-queue",
        label: "Open the decision queue",
        href: "/decide/queue",
        rationale: "What is waiting on an officer's decision.",
      },
      {
        id: "workflow",
        label: "Open investigations workflow",
        href: "/investigations-workflow",
        rationale: "Stage progression, assignment and escalation.",
      },
      {
        id: "share-queue",
        label: "Review sharing queue",
        href: "/share/queue",
        rationale: "What is awaiting release to another department.",
      },
    ],
  },

  "strategic-intelligence": {
    id: "strategic-intelligence",
    label: "Strategic Intelligence",
    purpose: "The summary position — what leadership needs, and how sure we are.",
    leadKpis: ["historical", "risk", "revenue", "vessel", "manifest", "container"],
    panels: [
      "recent-briefings",
      "intelligence-feed",
      "maritime-picture",
      "revenue-assurance",
      "compliance-watchlist",
      "manifest-intelligence",
      "port-operations",
      "cargo-workspace",
      "todays-priorities",
      "focus-rail",
    ],
    mapLayers: ["vessels", "ports", "eezBoundary"],
    intelligence: ["critical", "requires-review", "monitor", "informational"],
    actions: [
      {
        id: "briefing",
        label: "Open briefing centre",
        href: "/briefing-centre",
        rationale: "The summary position for leadership.",
      },
      {
        id: "memory",
        label: "Consult institutional memory",
        href: "/memory",
        rationale: "What the institution already learned about this.",
      },
      {
        id: "knowledge-graph",
        label: "Explore the knowledge graph",
        href: "/knowledge-graph",
        rationale: "How entities in the picture connect.",
      },
    ],
  },
} as const;

/** Tab order. Explicit, because object key order is not a design decision. */
export const MISSION_MODE_ORDER: readonly MissionModeId[] = [
  "national-picture",
  "vessel-operations",
  "revenue-assurance",
  "risk-compliance",
  "port-intelligence",
  "investigation",
  "decision-coordination",
  "strategic-intelligence",
] as const;

/** The mode an officer lands on. The whole picture, before any lens. */
export const DEFAULT_MISSION_MODE: MissionModeId = "national-picture";

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
   * lookup is the fix, and the reason a URL is untrusted input even when
   * it is only naming a tab.
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
