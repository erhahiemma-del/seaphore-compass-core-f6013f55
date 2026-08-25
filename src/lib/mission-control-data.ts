/**
 * Mission Control mock intelligence data.
 *
 * Numbers, deltas, and priorities are realistic placeholders that ship
 * with the Monitor stage until live integrations land. All figures
 * respect the confidence contract — each metric is annotated with the
 * confidence tier the panel must render.
 */
import type { ConfidenceTier } from "@/components/intelligence/ConfidenceChip";
import type { RiskLevel } from "@/components/intelligence/RiskPill";

export type MetricKey = "manifest" | "vessel" | "container" | "revenue" | "risk" | "historical";

export interface RibbonKpi {
  key: string;
  metricKey: MetricKey;
  title: string;
  metric: string;
  descriptor: string;
  confidence: ConfidenceTier;
  handoff: string;
  hint: string;
}

export const RIBBON_KPIS: RibbonKpi[] = [
  {
    key: "revenue-intelligence",
    metricKey: "revenue",
    title: "Revenue at Risk",
    metric: "—",
    descriptor: "Revenue leakage identified",
    confidence: "inferred",
    handoff: "/revenue",
    hint: "Model-estimated revenue leakage",
  },
  {
    key: "manifest-intelligence",
    metricKey: "manifest",
    title: "Manifest Exceptions",
    metric: "—",
    descriptor: "Manifest records indexed",
    confidence: "observed",
    handoff: "/manifest",
    hint: "Direct count of indexed manifest records",
  },
  {
    key: "risk-intelligence",
    metricKey: "risk",
    title: "Pending Assessments",
    metric: "—",
    descriptor: "Assessments awaiting officer review",
    confidence: "inferred",
    handoff: "/detect",
    hint: "Aggregate detection confidence score",
  },
  {
    key: "vessel-intelligence",
    metricKey: "vessel",
    title: "Vessels at Sea",
    metric: "—",
    descriptor: "Vessels tracked at sea",
    confidence: "observed",
    handoff: "/vessel",
    hint: "Active vessel profiles under management",
  },
  {
    key: "container-intelligence",
    metricKey: "container",
    title: "Ports Active",
    metric: "—",
    descriptor: "Ports reporting activity",
    confidence: "observed",
    handoff: "/cargo",
    hint: "Container movement events across ports",
  },
  {
    key: "historical-intelligence",
    metricKey: "historical",
    title: "Investigations",
    metric: "—",
    descriptor: "Investigation records in scope",
    confidence: "observed",
    handoff: "/memory",
    hint: "Years of historical intelligence coverage",
  },
];


export interface FeedRow {
  id: string;
  title: string;
  subtitle: string;
  time: string;
  severity: "high" | "medium" | "low" | "info";
  risk: RiskLevel;
  confidence: ConfidenceTier;
  entityId: string;
  voyageId?: string;
  investigationId?: string;
}

export const INTELLIGENCE_FEED: FeedRow[] = [
  {
    id: "SIG-00891",
    title: "AIS Blackout Observed",
    subtitle: "MV Ocean Pearl · signal lost 2h 14m in Gulf of Guinea",
    time: "09:12",
    severity: "high",
    risk: "HIGH",
    confidence: "observed",
    entityId: "VE-00042",
    voyageId: "VY-00251",
    investigationId: "INV-2026-00431",
  },
  {
    id: "SIG-00892",
    title: "Manifest Submitted",
    subtitle: "BOL #MSKU1234567 · Antwerp → Lagos",
    time: "09:24",
    severity: "info",
    risk: "MEDIUM",
    confidence: "verified",
    entityId: "VE-00051",
    voyageId: "VY-00252",
  },
  {
    id: "SIG-00893",
    title: "Revenue Discrepancy Observed",
    subtitle: "Potential under-declaration estimated at ₦98M · MV Ocean Pearl",
    time: "09:41",
    severity: "high",
    risk: "HIGH",
    confidence: "inferred",
    entityId: "VE-00042",
  },
  {
    id: "SIG-00894",
    title: "Watchlist Match",
    subtitle: "Owner network overlaps with OFAC SDN entry (2 hops)",
    time: "09:58",
    severity: "high",
    risk: "HIGH",
    confidence: "verified",
    entityId: "VE-00067",
  },
  {
    id: "SIG-00895",
    title: "Congestion Rising · Apapa",
    subtitle: "Predicted queue length +18% next 24h",
    time: "10:02",
    severity: "medium",
    risk: "MEDIUM",
    confidence: "inferred",
    entityId: "PT-LAGOS",
  },
  {
    id: "SIG-00896",
    title: "Ownership Change Detected",
    subtitle: "MV Crimson Endeavour beneficial owner updated 3d ago",
    time: "10:15",
    severity: "medium",
    risk: "MEDIUM",
    confidence: "inferred",
    entityId: "VE-00088",
  },
  {
    id: "SIG-00897",
    title: "Duplicate Manifest Cluster",
    subtitle: "4 BOL numbers reused across 3 shippers this week",
    time: "10:28",
    severity: "medium",
    risk: "MEDIUM",
    confidence: "inferred",
    entityId: "SH-11024",
  },
];

export const REVENUE_ASSURANCE = {
  expected: { value: "₦18.62B", confidence: "inferred" as ConfidenceTier },
  actual: { value: "₦17.38B", confidence: "inferred" as ConfidenceTier },
  recovered: { value: "₦230M", confidence: "verified" as ConfidenceTier },
  atRisk: { value: "₦1.24B", delta: "+₦180M vs 7d avg", confidence: "inferred" as ConfidenceTier },
  drivers: [
    { name: "HS code mismatch (steel products)", amount: "₦412M" },
    { name: "Under-declared container weight", amount: "₦288M" },
    { name: "Duplicate BOL clusters", amount: "₦196M" },
    { name: "Origin misdeclaration (electronics)", amount: "₦174M" },
    { name: "Missing surcharge line items", amount: "₦168M" },
  ],
};

export const MANIFEST_METRICS = [
  {
    key: "await",
    label: "Awaiting Validation",
    value: 62,
    confidence: "inferred" as ConfidenceTier,
  },
  {
    key: "discrep",
    label: "Discrepancies Observed",
    value: 24,
    confidence: "inferred" as ConfidenceTier,
  },
  {
    key: "changes",
    label: "Changes Detected",
    value: 17,
    confidence: "inferred" as ConfidenceTier,
  },
  { key: "dups", label: "Duplicate Manifests", value: 9, confidence: "inferred" as ConfidenceTier },
  { key: "late", label: "Late Submissions", value: 33, confidence: "inferred" as ConfidenceTier },
];

export const COMPLIANCE_METRICS = [
  {
    key: "sanct",
    label: "Sanctioned Entities Arrived",
    value: 2,
    confidence: "verified" as ConfidenceTier,
  },
  { key: "watch", label: "Watchlist Matches", value: 6, confidence: "verified" as ConfidenceTier },
  {
    key: "alerts",
    label: "Compliance Alerts",
    value: 14,
    confidence: "inferred" as ConfidenceTier,
  },
  {
    key: "hrc",
    label: "High Risk Countries Activity",
    value: 11,
    confidence: "verified" as ConfidenceTier,
  },
];

export interface PortCongestion {
  key: string;
  name: string;
  index: number; // 0-100
  level: "Critical" | "Elevated" | "Normal" | "Low";
  confidence: ConfidenceTier;
}

export const PORT_CONGESTION: PortCongestion[] = [
  { key: "apapa", name: "Apapa", index: 88, level: "Critical", confidence: "observed" },
  { key: "tincan", name: "Tin Can Island", index: 74, level: "Elevated", confidence: "observed" },
  { key: "onne", name: "Onne", index: 52, level: "Normal", confidence: "observed" },
  { key: "phc", name: "Port Harcourt", index: 41, level: "Normal", confidence: "observed" },
  { key: "calabar", name: "Calabar", index: 22, level: "Low", confidence: "observed" },
];

export interface Priority {
  investigationId: string;
  entityName: string;
  entityId: string;
  tag: "HIGH RISK" | "NETWORK EXPANSION" | "SANCTION MATCH" | "DISCREPANCY";
  note: string;
  assignee: string;
  updated: string;
  confidence: ConfidenceTier;
}

export const TODAYS_PRIORITIES: Priority[] = [
  {
    investigationId: "INV-2026-00431",
    entityName: "MV Ocean Pearl",
    entityId: "VE-00042",
    tag: "HIGH RISK",
    note: "AIS blackout observed 2h 14m in transit lane; revenue basis flagged.",
    assignee: "J. Bello",
    updated: "12 min ago",
    confidence: "observed",
  },
  {
    investigationId: "INV-2026-00429",
    entityName: "Crimson Endeavour Ltd",
    entityId: "CO-00317",
    tag: "NETWORK EXPANSION",
    note: "Beneficial ownership shifted; 3 new shell links observed.",
    assignee: "A. Okonkwo",
    updated: "38 min ago",
    confidence: "inferred",
  },
  {
    investigationId: "INV-2026-00425",
    entityName: "Blue Horizon Shipping",
    entityId: "CO-00204",
    tag: "SANCTION MATCH",
    note: "Watchlist match with OFAC SDN (2 hops via director).",
    assignee: "F. Adeyemi",
    updated: "1 h ago",
    confidence: "verified",
  },
  {
    investigationId: "INV-2026-00420",
    entityName: "BOL #MSKU8842119",
    entityId: "MF-00988",
    tag: "DISCREPANCY",
    note: "Declared weight below scale by 18%; HS code mismatch observed.",
    assignee: "R. Musa",
    updated: "2 h ago",
    confidence: "inferred",
  },
];

export interface Briefing {
  id: string;
  title: string;
  date: string;
  author: string;
  format: "PDF" | "DOCX";
  confidence: ConfidenceTier;
}

export const RECENT_BRIEFINGS: Briefing[] = [
  {
    id: "BR-1042",
    title: "Weekly Maritime Threat Posture — Week 21",
    date: "27 May 2026",
    author: "AI System · reviewed by Cdr. Bello",
    format: "PDF",
    confidence: "inferred",
  },
  {
    id: "BR-1041",
    title: "Revenue Leakage Deep-Dive · Steel Products",
    date: "26 May 2026",
    author: "F. Adeyemi",
    format: "PDF",
    confidence: "inferred",
  },
  {
    id: "BR-1040",
    title: "Sanctions Watch · Gulf of Guinea",
    date: "25 May 2026",
    author: "Compliance Cell",
    format: "DOCX",
    confidence: "verified",
  },
  {
    id: "BR-1039",
    title: "Apapa Congestion Forecast · 30-day",
    date: "24 May 2026",
    author: "AI System",
    format: "PDF",
    confidence: "inferred",
  },
  {
    id: "BR-1038",
    title: "Ownership Graph Update · MV Crimson Endeavour",
    date: "23 May 2026",
    author: "A. Okonkwo",
    format: "PDF",
    confidence: "inferred",
  },
];
