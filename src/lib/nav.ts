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
  BellRing,
  Settings,
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
 * Seaphore navigation model — mirrors the Intelligence Lifecycle
 * (Detect → Investigate → Decide → Share → Learn) plus the domain
 * Intelligence Centers.
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
    ],
  },
  {
    label: "Intelligence Lifecycle",
    items: [
      { title: "Detect", subtitle: "Intelligence Feed", url: "/detect", icon: Radar },
      { title: "Investigate", subtitle: "Case Workspace", url: "/investigate", icon: Search },
      { title: "Decision Support", subtitle: "Recommendations", url: "/decision-support", icon: Gavel },
      { title: "Share", subtitle: "Briefings & Collaboration", url: "/share", icon: Share2 },
      { title: "Institutional Memory", subtitle: "Knowledge & Learning", url: "/institutional-memory", icon: Library },
    ],
  },
  {
    label: "Intelligence Centers",
    items: [
      { title: "Manifest Intelligence", url: "/manifest-intelligence", icon: FileText },
      { title: "Cargo Intelligence", url: "/cargo-intelligence", icon: Package },
      { title: "Revenue Intelligence", url: "/revenue-intelligence", icon: DollarSign },
      { title: "Vessel Intelligence", url: "/vessel-intelligence", icon: Ship },
      { title: "Port Operations", url: "/port-operations", icon: Anchor },
      { title: "Compliance Intelligence", url: "/compliance-intelligence", icon: ShieldCheck },
      { title: "Ownership Intelligence", url: "/ownership-intelligence", icon: Building2 },
      { title: "Evidence Library", url: "/evidence-library", icon: FolderArchive },
      { title: "Alerts Center", url: "/alerts-center", icon: BellRing },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Administration", subtitle: "System Management", url: "/administration", icon: Settings },
    ],
  },
];
