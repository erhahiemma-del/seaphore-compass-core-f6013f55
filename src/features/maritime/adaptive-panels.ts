/**
 * Which `WorkspacePlan` panels Maritime Command can honestly render.
 *
 * ## Why this is a subset and not a switch over all 21
 *
 * `PanelId` spans the whole product — `ownership-graph`, `revenue-chart`,
 * `cargo-breakdown` and `compliance-violations` are the subject matter of
 * `/ownership`, `/revenue`, `/cargo` and `/compliance`, which are built,
 * routed and navigable today.
 *
 * Maritime Command is one surface. Rendering all 21 kinds inside it would
 * mean reimplementing five existing routes in the map shell — five second
 * sources of truth for data those routes already own. So the map renders
 * the panels it genuinely serves, and for the rest it says which surface
 * owns them and links there.
 *
 * That distinction is the point: a panel the officer cannot see here is
 * either *served elsewhere* (there is a link) or *not built* (it is named
 * as such). Neither is silent omission, which the plan's own `collapsed`
 * field exists to prevent.
 */
import type { PanelId, WorkspacePlan } from "@/services/orchestration";

/** Panels Maritime Command renders itself. */
export type MaritimePanelId = Extract<
  PanelId,
  "fleet-map" | "fleet-kpis" | "executive-summary" | "vessel-snapshot" | "timeline" | "evidence"
>;

/**
 * The six panels this surface owns, mapped to what the officer sees.
 *
 * Each maps onto a component Maritime Command already mounts — this adds
 * no new intelligence surface, it only decides ordering and visibility.
 */
export const MARITIME_PANELS: Readonly<Record<MaritimePanelId, string>> = {
  "executive-summary": "Executive Brief",
  "fleet-kpis": "National Picture",
  "fleet-map": "Map",
  "vessel-snapshot": "Vessel Context",
  timeline: "Timeline",
  evidence: "Evidence",
};

/** Panels owned by another surface, and the route that owns them. */
export const PANEL_ROUTES: Partial<Readonly<Record<PanelId, { label: string; url: string }>>> = {
  "ownership-graph": { label: "Ownership Intelligence", url: "/ownership" },
  "company-fleet": { label: "Ownership Intelligence", url: "/ownership" },
  "revenue-chart": { label: "Revenue Intelligence", url: "/revenue" },
  "cargo-breakdown": { label: "Cargo Intelligence", url: "/cargo" },
  "manifest-timeline": { label: "Manifest Intelligence", url: "/manifest" },
  "compliance-violations": { label: "Compliance Intelligence", url: "/compliance" },
  "port-traffic": { label: "Port Operations", url: "/ports" },
  "port-congestion": { label: "Port Operations", url: "/ports" },
};

export function isMaritimePanel(panel: PanelId): panel is MaritimePanelId {
  return panel in MARITIME_PANELS;
}

/** A panel the plan asked for that this surface does not render. */
export interface ElsewherePanel {
  readonly panel: PanelId;
  readonly label: string;
  /** Route that owns it, or null when nothing renders it yet. */
  readonly url: string | null;
}

export interface ResolvedPanels {
  /** Maritime panels to mount, in the plan's reading order. */
  readonly rendered: readonly MaritimePanelId[];
  /** Requested panels another surface owns, or which do not exist yet. */
  readonly elsewhere: readonly ElsewherePanel[];
}

/**
 * Split a plan's panels into what this surface shows and what it does not.
 *
 * Order is the plan's, preserved exactly — `planWorkspace` decided what
 * the officer should weigh first, and re-sorting here would quietly
 * override that decision.
 */
export function resolvePanels(plan: WorkspacePlan): ResolvedPanels {
  const rendered: MaritimePanelId[] = [];
  const elsewhere: ElsewherePanel[] = [];

  for (const panel of plan.panels) {
    if (isMaritimePanel(panel)) {
      rendered.push(panel);
      continue;
    }
    const route = PANEL_ROUTES[panel];
    elsewhere.push({
      panel,
      label: route?.label ?? panel,
      url: route?.url ?? null,
    });
  }

  return { rendered, elsewhere };
}
