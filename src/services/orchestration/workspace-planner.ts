/**
 * LAYER 4.1 — Workspace Planner.
 *
 * Turns one understanding into the layout that answers it: which panels
 * mount, which collapse, and what the officer is told about coverage
 * before they read a single number.
 *
 * ## It plans; it does not decide
 *
 * The workspace mode was already chosen during understanding. This module
 * reads `WORKSPACE_CONTRACTS` — the one place per-workspace behaviour is
 * defined — and assembles the plan. It introduces no second opinion about
 * which workspace an officer should be in.
 */
import { WORKSPACE_CONTRACTS, type PanelId } from "./workspace-contracts";
import type { Workspace } from "./types";
import type { QueryUnderstanding } from "./understanding/types";

/**
 * What the officer is told the system looked at.
 *
 * Shown before results, so a thin answer is legible as thin coverage
 * rather than as an absence of findings.
 */
export interface SearchTransparency {
  /** Datasets actually queried, named as an officer would name them. */
  readonly searching: readonly string[];
  readonly scope: string;
  readonly time: string;
  /** True when the officer did not state a period and one was assumed. */
  readonly timeInferred: boolean;
  readonly sourceCount: number;
  /** Datasets the question wanted that nothing can serve, with reasons. */
  readonly gaps: readonly { readonly dataset: string; readonly reason: string }[];
}

export interface WorkspacePlan {
  readonly workspace: Workspace;
  readonly label: string;
  /** Panels to mount, in reading order. */
  readonly panels: readonly PanelId[];
  /**
   * Panels deliberately withheld for this question. Named so the layout is
   * auditable — a panel missing by design should be distinguishable from a
   * panel missing by bug.
   */
  readonly collapsed: readonly PanelId[];
  readonly actions: readonly { readonly id: string; readonly label: string }[];
  readonly transparency: SearchTransparency;
  /** Subject the layout centres on, when the question had one. */
  readonly subjectLabel: string | null;
}

const DATASET_LABELS: Readonly<Record<string, string>> = {
  "fleet-positions": "Fleet Database",
  "ais-events": "AIS",
  "risk-modules": "Risk Engine",
  "ownership-registry": "Ownership",
  "sanctions-lists": "Sanctions",
  "compliance-records": "Compliance",
  "port-calls": "Ports",
  manifests: "Manifests",
  "revenue-assessments": "Revenue",
  weather: "Weather",
};

const SCOPE_LABELS: Readonly<Record<QueryUnderstanding["scope"], string>> = {
  global: "Global",
  fleet: "Global Fleet",
  entity: "Selected Vessel",
  company: "Company",
  port: "Port",
  area: "Area",
  session: "This Session",
};

/** Every panel the system can mount, for computing what a layout withholds. */
const ALL_PANELS: readonly PanelId[] = [
  "fleet-map",
  "fleet-table",
  "fleet-kpis",
  "executive-summary",
  "top-alerts",
  "recommended-actions",
  "vessel-snapshot",
  "timeline",
  "evidence",
  "reasoning",
  "risk-card",
  "ownership-graph",
  "company-fleet",
  "manifest-timeline",
  "cargo-breakdown",
  "revenue-chart",
  "compliance-violations",
  "port-traffic",
  "port-congestion",
  "voyage-path",
  "pattern-chart",
  "decision-queue",
];

export function planWorkspace(understanding: QueryUnderstanding): WorkspacePlan {
  const workspace = understanding.workspaceMode;
  const contract = WORKSPACE_CONTRACTS[workspace];
  const panels = contract.panels ?? ["executive-summary", "evidence"];
  const mounted = new Set<PanelId>(panels);

  const searching = understanding.plan.datasets.map(
    (dataset) => DATASET_LABELS[dataset] ?? dataset,
  );

  return {
    workspace,
    label: contract.label,
    panels,
    collapsed: ALL_PANELS.filter((panel) => !mounted.has(panel)),
    actions: contract.actions,
    transparency: {
      searching,
      scope: SCOPE_LABELS[understanding.scope],
      time: understanding.timeWindow.label,
      timeInferred: understanding.timeWindow.inferred,
      sourceCount: searching.length,
      gaps: understanding.plan.unavailable.map((item) => ({
        dataset: DATASET_LABELS[item.dataset] ?? item.dataset,
        reason: item.reason,
      })),
    },
    subjectLabel: understanding.primaryEntity?.text ?? null,
  };
}
