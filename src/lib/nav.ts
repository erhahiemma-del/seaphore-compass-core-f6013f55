import {
  Database,
  LayoutDashboard,
  Map,
  Radar,
  Search,
  Gavel,
  Share2,
  Library,
  FileText,
  Package,
  DollarSign,
  Ship,
  Anchor,
  ShieldCheck,
  Building2,
  FolderArchive,
  FileSearch,
  BellRing,
  Settings,
  Sparkles,
  Target,
  ClipboardList,
  Coins,
  Gauge,
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
 * Seaphore navigation model — canonical routes per Screen Inventory &
 * Navigation Map (Part 05).
 *
 * NAV-1: sidebar lifecycle order is fixed.
 * NAV-2: Intelligence Centres group appears BELOW the lifecycle group.
 * NAV-3: Search is a top-bar tool, not a sidebar item.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Mission",
    items: [
      { title: "Mission Control", subtitle: "National Overview", url: "/", icon: LayoutDashboard },
      { title: "Maritime Command", subtitle: "Live Operational Map", url: "/maritime", icon: Map },
      {
        title: "Command Center",
        subtitle: "Mission Control AI",
        url: "/command-center",
        icon: Sparkles,
      },
      {
        title: "NIMASA Copilot",
        subtitle: "Intelligence Orchestration",
        url: "/copilot",
        icon: Sparkles,
      },
      {
        title: "Mission Planning",
        subtitle: "Operational Missions",
        url: "/missions",
        icon: Target,
      },
    ],
  },
  {
    label: "Intelligence Lifecycle",
    items: [
      { title: "Detect", subtitle: "Intelligence Feed", url: "/detect", icon: Radar },
      { title: "Investigate", subtitle: "Case Workspace", url: "/investigate", icon: Search },
      { title: "Decision Support", subtitle: "Recommendations", url: "/decide", icon: Gavel },
      { title: "Share", subtitle: "Briefings & Collaboration", url: "/share", icon: Share2 },
      {
        title: "Institutional Memory",
        subtitle: "Knowledge & Learning",
        url: "/memory",
        icon: Library,
      },
    ],
  },
  {
    label: "Workflows & Queues",
    items: [
      {
        title: "Active Workflows",
        subtitle: "Stage Progression",
        url: "/investigations-workflow",
        icon: ClipboardList,
      },
      { title: "My Queue", subtitle: "Awaiting My Decision", url: "/decide/queue", icon: Gavel },
      {
        title: "Investigations",
        subtitle: "Case Dashboard",
        url: "/investigations",
        icon: FileSearch,
      },
      { title: "Sharing Queue", subtitle: "Awaiting Release", url: "/share/queue", icon: Share2 },
    ],
  },
  {
    label: "Maritime Operations",
    items: [
      { title: "Vessels", subtitle: "Identity & Particulars", url: "/vessel", icon: Ship },
      { title: "Ports", subtitle: "Nigerian Port Estate", url: "/ports", icon: Anchor },
      { title: "Manifests", subtitle: "Declared Cargo", url: "/manifest", icon: FileText },
      { title: "Cargo", subtitle: "Movement & Containers", url: "/cargo", icon: Package },
      {
        title: "Cargo Workspace",
        subtitle: "Working Surface",
        url: "/cargo-workspace",
        icon: Package,
      },
      {
        title: "Companies & Ownership",
        subtitle: "Corporate Control",
        url: "/ownership",
        icon: Building2,
      },
    ],
  },
  {
    label: "Risk & Compliance",
    items: [
      { title: "Alerts", subtitle: "Signals Requiring Review", url: "/alerts", icon: BellRing },
      {
        title: "Compliance",
        subtitle: "Requirements & Exceptions",
        url: "/compliance",
        icon: ShieldCheck,
      },
      { title: "Revenue", subtitle: "Assessment & Collection", url: "/revenue", icon: DollarSign },
      {
        title: "Revenue Assurance",
        subtitle: "Leakage & Discrepancy",
        url: "/revenue-leakage",
        icon: Coins,
      },
      {
        title: "National Risk",
        subtitle: "Aggregated Exposure",
        url: "/national-risk",
        icon: Gauge,
      },
    ],
  },
  {
    label: "Evidence & Knowledge",
    items: [
      {
        title: "Evidence Library",
        subtitle: "Collected Records",
        url: "/evidence",
        icon: FolderArchive,
      },
      {
        title: "Intelligence Evidence",
        subtitle: "Lineage & Verification",
        url: "/intelligence-evidence",
        icon: FolderArchive,
      },
      {
        title: "Knowledge Graph",
        subtitle: "Entity Relationships",
        url: "/knowledge-graph",
        icon: Database,
      },
      {
        title: "Operational Knowledge",
        subtitle: "Patterns & Lessons",
        url: "/operational-knowledge",
        icon: Library,
      },
      {
        title: "Briefing Centre",
        subtitle: "Executive Summaries",
        url: "/briefing-centre",
        icon: FileText,
      },
      {
        title: "Predictive Intelligence",
        subtitle: "Forward Signals",
        url: "/predictions",
        icon: Gauge,
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        title: "Intelligence Sources",
        subtitle: "Provider Coverage",
        url: "/data-sources",
        icon: Database,
      },
      { title: "Administration", subtitle: "System Management", url: "/admin", icon: Settings },
    ],
  },
];
