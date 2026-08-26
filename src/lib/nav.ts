import {
  Anchor,
  BellRing,
  Boxes,
  Building2,
  Database,
  FileText,
  DollarSign,
  FolderArchive,
  Gauge,
  Gavel,
  LayoutDashboard,
  Library,
  Map,
  Network,
  Plug,
  Radar,
  Search,
  ShieldCheck,
  Ship,
  Sparkles,
  TrendingUp,
  Users,
  Activity,
  Briefcase,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  subtitle?: string;
  url: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Seaphore navigation — six environments, not a list of modules.
 *
 * NAV-1: Mission first, then the intelligence lifecycle. Unchanged.
 * NAV-3: Search is a command-surface tool, not a sidebar item. Unchanged.
 * NAV-4: the groups are an operating model. An officer moves
 *        Mission → Lifecycle → Operations → Evidence → Risk → System,
 *        and each entry opens a working environment rather than a CRUD
 *        page. Groups that named implementation history — "Intelligence
 *        Centres", "Command & Risk", "Workflows & Queues" — are gone; the
 *        routes they held are consolidated behind the environment that
 *        owns them, recorded in {@link CONSOLIDATED_ROUTES}.
 *
 * ## Nothing here is aspirational
 *
 * Every item resolves to a route that exists and works. Five items named
 * in the target model — Assess, Verification & Inspection, Clearance &
 * Approvals, Enforcement Cases, Settings — have no environment behind
 * them: the concepts appear inside Compliance, DecideCase, Ports, Vessel
 * and investigations-workflow, but none has a route of its own. They are
 * deliberately absent rather than pointed at an approximation, because a
 * sidebar entry that lands somewhere other than its label teaches
 * officers the menu is decorative. See `navigation-ia.test.ts`.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Mission",
    items: [
      // Three environments, three different questions. Mission Control
      // asks what matters nationally, Maritime Command what is happening
      // operationally, Command Center what requires coordinated action.
      { title: "Mission Control", subtitle: "National Overview", url: "/", icon: LayoutDashboard },
      { title: "Maritime Command", subtitle: "Live Operational Map", url: "/maritime", icon: Map },
      {
        title: "Command Center",
        subtitle: "Coordinated Command Action",
        url: "/command-center",
        icon: Sparkles,
      },
      {
        title: "NIMASA Copilot",
        subtitle: "Intelligence Orchestration",
        url: "/copilot",
        icon: Sparkles,
      },
    ],
  },
  {
    label: "Intelligence Lifecycle",
    items: [
      { title: "Detect", subtitle: "Signals & Anomalies", url: "/detect", icon: Radar },
      // Understand is the ownership and relationship picture — building
      // entity context is what that environment already does.
      {
        title: "Understand",
        subtitle: "Entities & Relationships",
        url: "/ownership",
        icon: Building2,
      },
      { title: "Investigate", subtitle: "Cases & Evidence", url: "/investigate", icon: Search },
      {
        title: "Decide & Coordinate",
        subtitle: "Decisions, Approvals & Handoffs",
        url: "/decide",
        icon: Gavel,
      },
      {
        title: "Institutional Memory",
        subtitle: "History & Outcomes",
        url: "/memory",
        icon: Library,
      },
    ],
  },
  {
    label: "Maritime Operations",
    items: [
      {
        title: "Vessel & Voyage Operations",
        subtitle: "Identity, Movement & Calls",
        url: "/vessel",
        icon: Ship,
      },
      { title: "Port Operations", subtitle: "Nigerian Port Estate", url: "/ports", icon: Anchor },
      {
        title: "Manifests & Cargo",
        subtitle: "Declarations, Cargo & Containers",
        url: "/manifest",
        icon: Boxes,
      },
      {
        title: "Revenue & Receipts",
        subtitle: "Assessment & Collection",
        url: "/revenue",
        icon: DollarSign,
      },
    ],
  },
  {
    label: "Intelligence & Evidence",
    items: [
      {
        title: "Intelligence Workspace",
        subtitle: "Cross-Domain Working Surface",
        url: "/workspace",
        icon: Briefcase,
      },
      {
        title: "Evidence & Documents",
        subtitle: "Records, Lineage & Packages",
        url: "/evidence",
        icon: FolderArchive,
      },
      /*
       * Reachable, at last.
       *
       * The Briefing Centre is a complete environment — reports assembled
       * from Canonical UIP snapshots — and it was consolidated behind
       * Institutional Memory, whose label says nothing about producing a
       * report. An officer could reach it only from the `generate-report`
       * command action or by knowing the URL.
       *
       * Consolidation was the right instinct and the wrong target: the
       * capability is materially distinct from "history and outcomes",
       * and it has a real destination, so it gets its own entry rather
       * than a hop through a label that does not describe it.
       */
      {
        title: "Briefing Centre",
        subtitle: "Reports & Packages",
        url: "/briefing-centre",
        icon: FileText,
      },
      {
        title: "Knowledge Graph",
        subtitle: "Entity Relationships",
        url: "/knowledge-graph",
        icon: Network,
      },
      {
        title: "Predictive Intelligence",
        subtitle: "Forward Signals",
        url: "/predictions",
        icon: TrendingUp,
      },
      {
        title: "Operational Intelligence",
        subtitle: "Patterns & Lessons",
        url: "/operational-knowledge",
        icon: Library,
      },
    ],
  },
  {
    label: "Risk & Compliance",
    items: [
      {
        title: "Risk Intelligence",
        subtitle: "Aggregated National Exposure",
        url: "/national-risk",
        icon: Gauge,
      },
      {
        title: "Compliance Monitoring",
        subtitle: "Obligations & Exceptions",
        url: "/compliance",
        icon: ShieldCheck,
      },
      {
        title: "Watchlists",
        subtitle: "Watched Entities & Matches",
        url: "/alerts",
        icon: BellRing,
      },
      {
        title: "Revenue Assurance",
        subtitle: "Leakage & Discrepancy",
        url: "/revenue-leakage",
        icon: DollarSign,
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        title: "Data Sources",
        subtitle: "Provider Coverage",
        url: "/data-sources",
        icon: Database,
      },
      {
        title: "Integrations",
        subtitle: "Connectors & Credentials",
        url: "/admin/connectors",
        icon: Plug,
      },
      { title: "Users & Roles", subtitle: "Access & Permissions", url: "/admin", icon: Users },
      {
        title: "System Health",
        subtitle: "Runtime & Observability",
        url: "/observability",
        icon: Activity,
      },
    ],
  },
];

/**
 * Where a route went when it lost its own sidebar entry.
 *
 * Consolidation is not deletion. Each route below still exists, still
 * works, and is still linked from the environment that now owns it — this
 * records which one, so a capability cannot quietly become unreachable
 * because a menu item was removed.
 *
 * `navigation-ia.test.ts` asserts that every route reachable before this
 * change is either a sidebar item or listed here with a parent that is
 * itself a sidebar item. That is what makes "nothing is lost" checkable
 * rather than merely claimed.
 */
export const CONSOLIDATED_ROUTES: Readonly<Record<string, string>> = {
  // Investigate owns the case surfaces.
  "/investigations": "/investigate",
  "/investigations-workflow": "/investigate",
  // Decide & Coordinate owns queues, sharing and mission planning.
  "/decide/queue": "/decide",
  "/share": "/decide",
  "/share/queue": "/decide",
  "/missions": "/decide",
  // Manifests & Cargo owns the cargo surfaces.
  "/cargo": "/manifest",
  "/cargo-workspace": "/manifest",
  // Evidence & Documents owns evidence lineage.
  "/intelligence-evidence": "/evidence",
};

/**
 * What a screen is called, resolved from the navigation model.
 *
 * The sidebar already stores a title and a subtitle for every
 * environment, yet roughly thirty screens passed their own literals into
 * the shell — and the two had drifted. The sidebar said Detect ·
 * "Signals & Anomalies" while the screen said "Intelligence Feed"; it
 * said "Identity, Movement & Calls" while the screen said "Vessel
 * Intelligence". An officer reading the menu and then the header was
 * told two different things about where they were.
 *
 * Resolution order, and why each step exists:
 *
 *   1. the sidebar entry itself
 *   2. the environment that owns a consolidated route, so `/share`
 *      presents as Decide & Coordinate rather than as a page with no
 *      identity — it is deliberately not a sidebar environment
 *   3. the nearest ancestor, so `/investigate/INV-2026-00431` inherits
 *      Investigate rather than falling off the model
 *
 * Returns `null` rather than a placeholder. A screen with no identity is
 * a screen missing from the navigation model, and
 * {@link routeIdentityOrThrow} makes that loud instead of rendering
 * chrome with a blank title.
 */
export interface RouteIdentity {
  readonly title: string;
  readonly subtitle?: string;
}

export function routeIdentity(pathname: string): RouteIdentity | null {
  const path = normalisePath(pathname);
  const items = NAV_GROUPS.flatMap((g) => g.items);

  const exact = items.find((i) => normalisePath(i.url) === path);
  if (exact) return { title: exact.title, subtitle: exact.subtitle };

  const owner = CONSOLIDATED_ROUTES[path];
  if (owner) {
    const ownerItem = items.find((i) => normalisePath(i.url) === normalisePath(owner));
    if (ownerItem) return { title: ownerItem.title, subtitle: ownerItem.subtitle };
  }

  /*
   * Longest ancestor wins, so a nested route cannot be claimed by a
   * shorter, unrelated prefix. "/" is excluded from prefix matching for
   * exactly that reason — every path starts with it, and Mission Control
   * would otherwise absorb the entire application.
   */
  const ancestors = [...items.map((i) => i.url), ...Object.keys(CONSOLIDATED_ROUTES)]
    .map(normalisePath)
    .filter((url) => url !== "/" && path.startsWith(`${url}/`))
    .sort((a, b) => b.length - a.length);

  for (const ancestor of ancestors) {
    const identity = routeIdentity(ancestor);
    if (identity) return identity;
  }

  return null;
}

/**
 * The same resolution, but a missing entry is a failure.
 *
 * A screen the navigation model does not know about is a defect in the
 * model, not something to paper over: blank chrome would ship it
 * silently. `navigation-ia.test.ts` asserts every reachable route
 * resolves, so this fires for a developer long before an officer.
 */
export function routeIdentityOrThrow(pathname: string): RouteIdentity {
  const identity = routeIdentity(pathname);
  if (identity) return identity;
  throw new Error(
    `No navigation identity for "${pathname}". Add it to NAV_GROUPS, or record its owner in ` +
      `CONSOLIDATED_ROUTES, so the sidebar and the screen header agree on what this environment is called.`,
  );
}

/** Trailing slashes are a routing detail, not an identity difference. */
function normalisePath(pathname: string): string {
  if (!pathname.startsWith("/")) return `/${pathname}`;
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/** Every url an officer can reach from the sidebar, directly or after one hop. */
export function reachableRoutes(): readonly string[] {
  return [
    ...NAV_GROUPS.flatMap((g) => g.items.map((i) => i.url)),
    ...Object.keys(CONSOLIDATED_ROUTES),
  ];
}
