import {
  LayoutDashboard,
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
      {
        title: "Mission Control",
        subtitle: "National Overview",
        url: "/",
        icon: LayoutDashboard,
      },
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
    label: "Intelligence Centres",
    items: [
      { title: "Manifest Intelligence", url: "/manifest", icon: FileText },
      { title: "Cargo Intelligence", url: "/cargo", icon: Package },
      {
        title: "Cargo Workspace",
        subtitle: "CAPABILITY.CARGO · 6 centres",
        url: "/cargo-workspace",
        icon: Package,
      },
      { title: "Revenue Intelligence", url: "/revenue", icon: DollarSign },

      { title: "Vessel Intelligence", url: "/vessel", icon: Ship },
      { title: "Port Operations", url: "/ports", icon: Anchor },
      { title: "Ownership Intelligence", url: "/ownership", icon: Building2 },
      { title: "Compliance Intelligence", url: "/compliance", icon: ShieldCheck },
      { title: "Evidence Library", url: "/evidence", icon: FolderArchive },
      { title: "Intelligence Evidence", subtitle: "Assessment Basis", url: "/intelligence-evidence", icon: FileSearch },
      { title: "Knowledge Graph", subtitle: "Relational Intelligence", url: "/knowledge-graph", icon: Share2 },
      { title: "Predictive Intelligence", subtitle: "PIE · Forecasts & Alerts", url: "/predictions", icon: Radar },
      { title: "Operational Knowledge", subtitle: "OKL · Patterns & Recommendations", url: "/operational-knowledge", icon: Sparkles },
      { title: "Alerts Center", url: "/alerts", icon: BellRing },
    ],
  },
  {
    label: "Command & Risk",
    items: [
      { title: "Mission Planning", subtitle: "AI-Assisted Missions", url: "/missions", icon: Target },
      { title: "Investigation Workflows", subtitle: "Structured Cases", url: "/investigations-workflow", icon: ClipboardList },
      { title: "Investigation Dashboard", subtitle: "MIW · All Cases", url: "/investigations", icon: FolderArchive },
      { title: "Briefing Centre", subtitle: "MIBC · Reports & Exports", url: "/briefing-centre", icon: FileText },
      { title: "Revenue Leakage", subtitle: "Detection & Enforcement", url: "/revenue-leakage", icon: Coins },
      { title: "National Maritime Risk", subtitle: "NMRSE · Composite Scoring", url: "/national-risk", icon: Gauge },

    ],
  },
  {
    label: "System",
    items: [
      { title: "Administration", subtitle: "System Management", url: "/admin", icon: Settings },
    ],
  },
];
