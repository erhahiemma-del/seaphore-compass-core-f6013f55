import {
  Anchor,
  BellRing,
  Boxes,
  Building2,
  Database,
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
  // Institutional Memory owns briefings.
  "/briefing-centre": "/memory",
};

/** Every url an officer can reach from the sidebar, directly or after one hop. */
export function reachableRoutes(): readonly string[] {
  return [
    ...NAV_GROUPS.flatMap((g) => g.items.map((i) => i.url)),
    ...Object.keys(CONSOLIDATED_ROUTES),
  ];
}
