/**
 * Seaphore lifecycle DEMO fixtures — Detect · Investigate · Decide · Share · Memory.
 *
 * ## Nothing in this file is an observation
 *
 * Every vessel, IMO, event, risk level and timestamp here is invented to
 * exercise the lifecycle surfaces. None of it came from a provider, and
 * no officer should ever act on it.
 *
 * Three properties keep that legible rather than merely stated:
 *
 *   - Confidence never exceeds `unconfirmed`. A fixture cannot claim to
 *     have been observed or verified, because it was neither.
 *   - IMO numbers carry a `DEMO-` prefix. A bare seven-digit number is
 *     indistinguishable from a real registry entry, and some of these
 *     collide with real vessels.
 *   - Timestamps are simulation offsets (`T−12 min`), never wall-clock
 *     recency. "12 min ago" is a claim that something just happened.
 *
 * The surfaces that render this must mark themselves with
 * `DemoDataNotice`. See `src/lib/demo/gate.ts` for the production guard.
 */

import type { ConfidenceTier } from "@/components/intelligence/ConfidenceChip";
import type { RiskLevel } from "@/components/intelligence/RiskPill";

// ─────────────────────────────────────────────────────────────────────────────
// DET — Detect (Intelligence Feed)
// ─────────────────────────────────────────────────────────────────────────────

export type SignalDomain =
  | "Manifest"
  | "Cargo"
  | "Revenue"
  | "Vessel Movement"
  | "Port Operations"
  | "Ownership"
  | "Compliance"
  | "Alerts";

export const SIGNAL_DOMAINS: SignalDomain[] = [
  "Manifest",
  "Cargo",
  "Revenue",
  "Vessel Movement",
  "Port Operations",
  "Ownership",
  "Compliance",
  "Alerts",
];

export type SignalStatus = "NEW" | "ACK";

export interface Signal {
  id: string;
  title: string;
  detail: string;
  domain: SignalDomain;
  risk: RiskLevel;
  confidence: ConfidenceTier;
  detectedAt: string; // ISO
  detectedLabel: string;
  status: SignalStatus;
  entityId?: string;
  investigationId?: string;
  vessel?: string;
  imo?: string;
}

export const SIGNALS: Signal[] = [
  {
    id: "SIG-01142",
    title: "AIS blackout observed on MV Ocean Pearl",
    detail: "2h 14m gap in transit lane, off Bonny",
    domain: "Vessel Movement",
    risk: "HIGH",
    confidence: "unconfirmed",
    detectedAt: "2026-06-04T09:12:00Z",
    detectedLabel: "T−12 min",
    status: "NEW",
    entityId: "VE-00042",
    investigationId: "INV-2026-00431",
    vessel: "MV Ocean Pearl",
    imo: "DEMO-9432187",
  },
  {
    id: "SIG-01141",
    title: "Declared cargo weight 18% below scale reading",
    detail: "BOL #MSKU8842119 · Steel products",
    domain: "Cargo",
    risk: "HIGH",
    confidence: "inferred",
    detectedAt: "2026-06-04T08:38:00Z",
    detectedLabel: "T−38 min",
    status: "NEW",
    entityId: "MF-00988",
    investigationId: "INV-2026-00420",
  },
  {
    id: "SIG-01140",
    title: "Beneficial owner change · Crimson Endeavour Ltd",
    detail: "3 new shell links observed within 30 days",
    domain: "Ownership",
    risk: "HIGH",
    confidence: "inferred",
    detectedAt: "2026-06-04T07:41:00Z",
    detectedLabel: "T−1 h",
    status: "ACK",
    entityId: "CO-00317",
    investigationId: "INV-2026-00429",
  },
  {
    id: "SIG-01139",
    title: "Sanction watchlist match · Blue Horizon Shipping",
    detail: "2-hop link to OFAC SDN via director",
    domain: "Compliance",
    risk: "HIGH",
    confidence: "unconfirmed",
    detectedAt: "2026-06-04T07:02:00Z",
    detectedLabel: "T−1 h",
    status: "NEW",
    entityId: "CO-00204",
    investigationId: "INV-2026-00425",
  },
  {
    id: "SIG-01138",
    title: "HS code mismatch · declared vs. observed",
    detail: "BOL #APLU7712004 · rebar declared, coils observed",
    domain: "Manifest",
    risk: "MEDIUM",
    confidence: "unconfirmed",
    detectedAt: "2026-06-04T06:44:00Z",
    detectedLabel: "T−1 h",
    status: "NEW",
    investigationId: "INV-2026-00432",
  },
  {
    id: "SIG-01137",
    title: "Revenue basis anomaly · duty base 22% below peers",
    detail: "Consignee Northgate Logistics · 3-month rolling",
    domain: "Revenue",
    risk: "MEDIUM",
    confidence: "inferred",
    detectedAt: "2026-06-04T05:10:00Z",
    detectedLabel: "T−3 h",
    status: "NEW",
  },
  {
    id: "SIG-01136",
    title: "Apapa berth queue depth exceeds 30",
    detail: "Congestion index 88 · critical band",
    domain: "Port Operations",
    risk: "MEDIUM",
    confidence: "unconfirmed",
    detectedAt: "2026-06-04T04:22:00Z",
    detectedLabel: "T−4 h",
    status: "ACK",
  },
  {
    id: "SIG-01135",
    title: "Duplicate BOL number across two consignments",
    detail: "BOL #MSKU8842119 filed twice within 48h",
    domain: "Manifest",
    risk: "MEDIUM",
    confidence: "unconfirmed",
    detectedAt: "2026-06-04T03:00:00Z",
    detectedLabel: "T−6 h",
    status: "ACK",
  },
  {
    id: "SIG-01134",
    title: "Container seal mismatch on arrival",
    detail: "MSKU 8842119 · original vs. presented",
    domain: "Cargo",
    risk: "LOW",
    confidence: "unconfirmed",
    detectedAt: "2026-06-04T01:15:00Z",
    detectedLabel: "T−8 h",
    status: "ACK",
  },
  {
    id: "SIG-01133",
    title: "New vessel entering EEZ · first observation",
    detail: "MV Bonny Trader · IMO DEMO-9781200",
    domain: "Vessel Movement",
    risk: "LOW",
    confidence: "unconfirmed",
    detectedAt: "2026-06-03T22:03:00Z",
    detectedLabel: "T−11 h",
    status: "ACK",
  },
];

/** DET-1 counts per tab. */
export function signalCountsByDomain(): Record<SignalDomain | "All", number> {
  const out = { All: SIGNALS.length } as Record<SignalDomain | "All", number>;
  for (const d of SIGNAL_DOMAINS) {
    out[d] = SIGNALS.filter((s) => s.domain === d).length;
  }
  return out;
}

/** DET-2 signal ribbon aggregates. */
export interface SignalRibbon {
  total: { value: number; delta: number };
  high: { value: number; delta: number };
  medium: { value: number; delta: number };
  low: { value: number; delta: number };
  fresh: { value: number; delta: number };
  ack: { value: number; delta: number };
  confidence: ConfidenceTier;
}

export const SIGNAL_RIBBON: SignalRibbon = {
  total: { value: SIGNALS.length, delta: 3 },
  high: { value: SIGNALS.filter((s) => s.risk === "HIGH").length, delta: 2 },
  medium: { value: SIGNALS.filter((s) => s.risk === "MEDIUM").length, delta: 1 },
  low: { value: SIGNALS.filter((s) => s.risk === "LOW").length, delta: 0 },
  fresh: { value: SIGNALS.filter((s) => s.status === "NEW").length, delta: 4 },
  ack: { value: SIGNALS.filter((s) => s.status === "ACK").length, delta: -1 },
  confidence: "unconfirmed",
};

/** DET-3 stacked bar chart data (last 24h in 2h buckets). */
export interface TimelineBucket {
  label: string;
  High: number;
  Medium: number;
  Low: number;
  Info: number;
}

export const SIGNAL_TIMELINE_24H: TimelineBucket[] = [
  { label: "00", High: 0, Medium: 1, Low: 2, Info: 3 },
  { label: "02", High: 1, Medium: 0, Low: 1, Info: 2 },
  { label: "04", High: 0, Medium: 2, Low: 1, Info: 1 },
  { label: "06", High: 1, Medium: 3, Low: 2, Info: 4 },
  { label: "08", High: 2, Medium: 2, Low: 1, Info: 3 },
  { label: "10", High: 3, Medium: 1, Low: 0, Info: 2 },
  { label: "12", High: 2, Medium: 2, Low: 2, Info: 1 },
  { label: "14", High: 1, Medium: 3, Low: 1, Info: 2 },
  { label: "16", High: 2, Medium: 1, Low: 3, Info: 3 },
  { label: "18", High: 1, Medium: 2, Low: 1, Info: 2 },
  { label: "20", High: 0, Medium: 1, Low: 2, Info: 1 },
  { label: "22", High: 1, Medium: 0, Low: 1, Info: 2 },
];

export const SIGNAL_TIMELINE_6H: TimelineBucket[] = [
  { label: "04:00", High: 0, Medium: 1, Low: 1, Info: 2 },
  { label: "05:00", High: 1, Medium: 0, Low: 2, Info: 1 },
  { label: "06:00", High: 0, Medium: 2, Low: 1, Info: 2 },
  { label: "07:00", High: 2, Medium: 1, Low: 1, Info: 3 },
  { label: "08:00", High: 1, Medium: 2, Low: 2, Info: 2 },
  { label: "09:00", High: 3, Medium: 1, Low: 1, Info: 2 },
];

export const SIGNAL_TIMELINE_7D: TimelineBucket[] = [
  { label: "May 29", High: 6, Medium: 12, Low: 9, Info: 14 },
  { label: "May 30", High: 4, Medium: 10, Low: 11, Info: 12 },
  { label: "May 31", High: 8, Medium: 9, Low: 8, Info: 10 },
  { label: "Jun 01", High: 5, Medium: 14, Low: 10, Info: 13 },
  { label: "Jun 02", High: 9, Medium: 11, Low: 7, Info: 15 },
  { label: "Jun 03", High: 7, Medium: 13, Low: 12, Info: 11 },
  { label: "Jun 04", High: 10, Medium: 8, Low: 9, Info: 12 },
];

/** DET-4 domain distribution. */
export interface DomainSlice {
  domain: SignalDomain;
  count: number;
}
export const SIGNALS_BY_DOMAIN: DomainSlice[] = SIGNAL_DOMAINS.map((d) => ({
  domain: d,
  count:
    SIGNALS.filter((s) => s.domain === d).length +
    // pad realistic distribution
    {
      Manifest: 12,
      Cargo: 9,
      Revenue: 8,
      "Vessel Movement": 14,
      "Port Operations": 6,
      Ownership: 5,
      Compliance: 7,
      Alerts: 3,
    }[d],
}));

/** DET-5 heatmap matrix. */
export const RISK_HEATMAP: Array<{
  domain: SignalDomain;
  High: number;
  Medium: number;
  Low: number;
}> = [
  { domain: "Manifest", High: 3, Medium: 8, Low: 4 },
  { domain: "Cargo", High: 5, Medium: 6, Low: 2 },
  { domain: "Revenue", High: 2, Medium: 7, Low: 1 },
  { domain: "Vessel Movement", High: 6, Medium: 5, Low: 3 },
  { domain: "Port Operations", High: 1, Medium: 4, Low: 3 },
  { domain: "Ownership", High: 4, Medium: 2, Low: 0 },
  { domain: "Compliance", High: 5, Medium: 2, Low: 1 },
  { domain: "Alerts", High: 2, Medium: 1, Low: 1 },
];

/** DET-6 signal-type tiles. */
export type SignalType =
  | "Anomalies"
  | "Discrepancies"
  | "Duplicates"
  | "Changes"
  | "Gaps"
  | "Matches";

export const SIGNAL_TYPE_TILES: Array<{
  type: SignalType;
  count: number;
  confidence: ConfidenceTier;
}> = [
  { type: "Anomalies", count: 27, confidence: "unconfirmed" },
  { type: "Discrepancies", count: 19, confidence: "inferred" },
  { type: "Duplicates", count: 8, confidence: "unconfirmed" },
  { type: "Changes", count: 34, confidence: "unconfirmed" },
  { type: "Gaps", count: 12, confidence: "inferred" },
  { type: "Matches", count: 6, confidence: "unconfirmed" },
];

/** DET-9 copilot summary cards. */
export interface CopilotCard {
  title: string;
  observation: string;
  confidence: ConfidenceTier;
}

export const AI_SIGNAL_SUMMARY: CopilotCard[] = [
  {
    title: "Clustering of AIS gaps near Bonny",
    observation: "6 vessels have observed transit-lane blackouts averaging 2h in the past 24h.",
    confidence: "unconfirmed",
  },
  {
    title: "Manifest discrepancies rising in steel-products lane",
    observation: "Declared vs. scale weights diverge by >15% on 9 filings this week.",
    confidence: "inferred",
  },
  {
    title: "Shell-network expansion around Crimson Endeavour Ltd",
    observation: "3 newly registered entities share a director with existing watchlist companies.",
    confidence: "inferred",
  },
  {
    title: "Congestion at Apapa remains in critical band",
    observation: "Berth queue depth has stayed above 30 for a fourth consecutive day.",
    confidence: "unconfirmed",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// INV — Investigate (Voyage Workspace)
// ─────────────────────────────────────────────────────────────────────────────

export interface Investigation {
  id: string;
  mission: string;
  vessel: string;
  imo: string;
  flag: string;
  voyage: string;
  route: string;
  cargoDeclared: string;
  arrival: string;
  keySignal: string;
  risk: RiskLevel;
  confidencePct: number;
  officer: string;
  status: "Open" | "In Review" | "Awaiting Decision" | "Closed";
  opened: string;
  updated: string;
  entityId: string;
  ownerId: string;
}

export const INVESTIGATIONS: Investigation[] = [
  {
    id: "INV-2026-00431",
    mission: "Gulf of Guinea Watch",
    vessel: "MV Ocean Pearl",
    imo: "DEMO-9432187",
    flag: "Panama",
    voyage: "VY-2026-00251",
    route: "Lagos → Bonny → Apapa",
    cargoDeclared: "Steel coils (4,200t)",
    arrival: "05 Jun 2026 · 14:30 UTC",
    keySignal: "AIS blackout 2h 14m",
    risk: "HIGH",
    confidencePct: 86,
    officer: "Cdr. J. Bello",
    status: "In Review",
    opened: "03 Jun 2026",
    updated: "T−12 min",
    entityId: "VE-00042",
    ownerId: "CO-00204",
  },
  {
    id: "INV-2026-00429",
    mission: "Ownership Watch",
    vessel: "MV Crimson Endeavour",
    imo: "DEMO-9187562",
    flag: "Liberia",
    voyage: "VY-2026-00248",
    route: "Onne → Apapa",
    cargoDeclared: "Container mixed (1,800 TEU)",
    arrival: "06 Jun 2026 · 09:00 UTC",
    keySignal: "Beneficial owner change",
    risk: "HIGH",
    confidencePct: 72,
    officer: "A. Okonkwo",
    status: "Open",
    opened: "02 Jun 2026",
    updated: "T−38 min",
    entityId: "VE-00071",
    ownerId: "CO-00317",
  },
  {
    id: "INV-2026-00425",
    mission: "Sanctions Watch",
    vessel: "Blue Horizon",
    imo: "DEMO-9722145",
    flag: "Marshall Islands",
    voyage: "VY-2026-00243",
    route: "Bonny → Warri",
    cargoDeclared: "Crude oil (18,400 mt)",
    arrival: "07 Jun 2026 · 22:00 UTC",
    keySignal: "OFAC 2-hop match",
    risk: "HIGH",
    confidencePct: 91,
    officer: "F. Adeyemi",
    status: "Awaiting Decision",
    opened: "01 Jun 2026",
    updated: "T−1 h",
    entityId: "VE-00088",
    ownerId: "CO-00204",
  },
  {
    id: "INV-2026-00420",
    mission: "Revenue Assurance",
    vessel: "MV Star of Lagos",
    imo: "DEMO-9601028",
    flag: "Nigeria",
    voyage: "VY-2026-00239",
    route: "Tin Can → Apapa",
    cargoDeclared: "Rebar (2,100t)",
    arrival: "05 Jun 2026 · 08:15 UTC",
    keySignal: "Declared weight 18% low",
    risk: "MEDIUM",
    confidencePct: 68,
    officer: "R. Musa",
    status: "Open",
    opened: "30 May 2026",
    updated: "T−2 h",
    entityId: "VE-00105",
    ownerId: "CO-00417",
  },
];

export function investigationById(id: string): Investigation {
  return INVESTIGATIONS.find((i) => i.id === id) ?? INVESTIGATIONS[0];
}

/** INV-3 case-progress checklist. */
export interface ChecklistStep {
  label: string;
  done: boolean;
}
export const CASE_PROGRESS: ChecklistStep[] = [
  { label: "Initial Assessment", done: true },
  { label: "Data Collection", done: true },
  { label: "Entity Resolution", done: true },
  { label: "Evidence Gathering", done: true },
  { label: "Analysis", done: true },
  { label: "Recommendation", done: false },
  { label: "Officer Decision", done: false },
  { label: "Sharing", done: false },
];

/** INV-4/INV-5 knowledge-graph nodes + edges. */
export type GraphNodeKind = "vessel" | "company" | "person" | "port" | "cargo" | "manifest";

export interface GraphNode {
  id: string;
  label: string;
  kind: GraphNodeKind;
  x: number; // 0..100 (Force layout home coordinates)
  y: number;
  risk?: RiskLevel;
  /** 0..100 confidence score used by the KG "Confidence ≥" filter. */
  confidence?: number;
  /** True if this node has attached evidence — drives "Evidence only" filter. */
  evidence?: boolean;
  /** Timeline position 0..100 — used by the timeline scrubber & play. */
  t?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  label: string;
  /** Timeline position 0..100 — hidden when scrubber cursor < t. */
  t?: number;
  /** Optional relationship-type key for the relationship filter. */
  type?: string;
}

export const GRAPH_NODES: GraphNode[] = [
  {
    id: "v1",
    label: "MV Ocean Pearl",
    kind: "vessel",
    x: 50,
    y: 42,
    risk: "HIGH",
    confidence: 88,
    evidence: true,
    t: 5,
  },
  {
    id: "co1",
    label: "Blue Horizon Shipping",
    kind: "company",
    x: 22,
    y: 24,
    risk: "HIGH",
    confidence: 82,
    evidence: true,
    t: 15,
  },
  { id: "co2", label: "Northgate Logistics", kind: "company", x: 78, y: 26, confidence: 62, t: 30 },
  {
    id: "co3",
    label: "Crimson Endeavour Ltd",
    kind: "company",
    x: 15,
    y: 62,
    risk: "HIGH",
    confidence: 55,
    t: 40,
  },
  { id: "p1", label: "K. Adebayo (Director)", kind: "person", x: 8, y: 40, confidence: 50, t: 20 },
  {
    id: "p2",
    label: "M. Ibrahim (Beneficial Owner)",
    kind: "person",
    x: 30,
    y: 78,
    confidence: 44,
    t: 70,
  },
  { id: "pt1", label: "Bonny", kind: "port", x: 60, y: 74, confidence: 92, evidence: true, t: 50 },
  { id: "pt2", label: "Apapa", kind: "port", x: 82, y: 60, confidence: 92, evidence: true, t: 55 },
  { id: "pt3", label: "Lagos", kind: "port", x: 82, y: 82, confidence: 92, t: 60 },
  {
    id: "c1",
    label: "Steel coils · 4,200t",
    kind: "cargo",
    x: 50,
    y: 12,
    confidence: 72,
    evidence: true,
    t: 35,
  },
  {
    id: "m1",
    label: "BOL #MSKU8842119",
    kind: "manifest",
    x: 68,
    y: 20,
    confidence: 80,
    evidence: true,
    t: 45,
  },
];

export const GRAPH_EDGES: GraphEdge[] = [
  { from: "co1", to: "v1", label: "owns", type: "owns", t: 15 },
  { from: "co3", to: "v1", label: "operates", type: "operates", t: 40 },
  { from: "p1", to: "co1", label: "director of", type: "director of", t: 20 },
  { from: "p2", to: "co3", label: "beneficial owner", type: "beneficial owner", t: 70 },
  { from: "v1", to: "pt1", label: "AIS blackout", type: "AIS blackout", t: 50 },
  { from: "v1", to: "pt2", label: "declared arrival", type: "declared arrival", t: 55 },
  { from: "v1", to: "pt3", label: "prior port", type: "prior port", t: 60 },
  { from: "c1", to: "v1", label: "manifested on", type: "manifested on", t: 35 },
  { from: "m1", to: "c1", label: "declares", type: "declares", t: 45 },
  { from: "co2", to: "m1", label: "consignee", type: "consignee", t: 45 },
];

/**
 * Deterministic per-investigation subgraph. The default MV Ocean Pearl case
 * (INV-2026-00431) reuses GRAPH_NODES/GRAPH_EDGES; other investigations get
 * a topology-preserving graph populated from Investigation metadata so the
 * KG reflects the case the officer opened.
 */
export function graphForInvestigation(inv: Investigation): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  focalId: string;
} {
  if (inv.id === "INV-2026-00431") {
    return { nodes: GRAPH_NODES, edges: GRAPH_EDGES, focalId: "v1" };
  }
  const ports = inv.route
    .split(/→|->|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  const portNodes: GraphNode[] = ports.map((p, i) => ({
    id: `pt${i + 1}`,
    label: p,
    kind: "port",
    x: 58 + i * 12,
    y: 68 + (i % 2) * 12,
    confidence: 90,
    evidence: true,
    t: 50 + i * 5,
  }));
  const portEdges: GraphEdge[] = ports.map((_, i) => ({
    from: "v1",
    to: `pt${i + 1}`,
    label: i === 0 ? "AIS blackout" : i === 1 ? "declared arrival" : "prior port",
    type: i === 0 ? "AIS blackout" : i === 1 ? "declared arrival" : "prior port",
    t: 50 + i * 5,
  }));
  const nodes: GraphNode[] = [
    {
      id: "v1",
      label: inv.vessel,
      kind: "vessel",
      x: 50,
      y: 42,
      risk: inv.risk,
      confidence: inv.confidencePct,
      evidence: true,
      t: 5,
    },
    {
      id: "co1",
      label: `${inv.vessel.split(" ").slice(-1)[0]} Holdings`,
      kind: "company",
      x: 22,
      y: 24,
      risk: inv.risk,
      confidence: 78,
      evidence: true,
      t: 15,
    },
    {
      id: "co2",
      label: "Declared Consignee",
      kind: "company",
      x: 78,
      y: 26,
      confidence: 60,
      t: 30,
    },
    {
      id: "co3",
      label: `${inv.flag} Operating Co.`,
      kind: "company",
      x: 15,
      y: 62,
      risk: "MEDIUM",
      confidence: 55,
      t: 40,
    },
    { id: "p1", label: "Registered Director", kind: "person", x: 8, y: 40, confidence: 52, t: 20 },
    { id: "p2", label: "Beneficial Owner", kind: "person", x: 30, y: 78, confidence: 45, t: 70 },
    ...portNodes,
    {
      id: "c1",
      label: inv.cargoDeclared,
      kind: "cargo",
      x: 50,
      y: 12,
      confidence: 72,
      evidence: true,
      t: 35,
    },
    {
      id: "m1",
      label: `BOL · ${inv.voyage}`,
      kind: "manifest",
      x: 68,
      y: 20,
      confidence: 80,
      evidence: true,
      t: 45,
    },
  ];
  const edges: GraphEdge[] = [
    { from: "co1", to: "v1", label: "owns", type: "owns", t: 15 },
    { from: "co3", to: "v1", label: "operates", type: "operates", t: 40 },
    { from: "p1", to: "co1", label: "director of", type: "director of", t: 20 },
    { from: "p2", to: "co3", label: "beneficial owner", type: "beneficial owner", t: 70 },
    ...portEdges,
    { from: "c1", to: "v1", label: "manifested on", type: "manifested on", t: 35 },
    { from: "m1", to: "c1", label: "declares", type: "declares", t: 45 },
    { from: "co2", to: "m1", label: "consignee", type: "consignee", t: 45 },
  ];
  return { nodes, edges, focalId: "v1" };
}

/** INV-6 copilot recommendations, similarity, entity facts. */
export interface CopilotRecommendation {
  title: string;
  detail: string;
  risk: RiskLevel;
}

export const COPILOT_RECOMMENDATIONS: CopilotRecommendation[] = [
  {
    title: "Request AIS reconstruction for blackout window",
    detail: "Source: satellite AIS provider · 09:12–11:26 UTC",
    risk: "HIGH",
  },
  {
    title: "Cross-check consignee against Northgate Logistics prior filings",
    detail: "3-month look-back on duty-base anomalies",
    risk: "MEDIUM",
  },
  {
    title: "Retrieve corporate registry filing for Blue Horizon Shipping",
    detail: "Confirm current director list before Decision Support",
    risk: "MEDIUM",
  },
];

export interface HistoricalSimilarity {
  caseRef: string;
  summary: string;
  revenueLoss: string;
  outcome: string;
  matchPct: number;
}

export const HISTORICAL_SIMILARITY: HistoricalSimilarity[] = [
  {
    caseRef: "INV-2025-00874",
    summary: "AIS gap + owner shift · steel cargo",
    revenueLoss: "₦412M",
    outcome: "Duty reassessed",
    matchPct: 87,
  },
  {
    caseRef: "INV-2025-00612",
    summary: "Bonny transit blackout · same operator group",
    revenueLoss: "₦180M",
    outcome: "Escalated to EFCC",
    matchPct: 74,
  },
  {
    caseRef: "INV-2024-00330",
    summary: "Manifest weight discrepancy · rebar/coils swap",
    revenueLoss: "₦95M",
    outcome: "Fine issued",
    matchPct: 61,
  },
];

export interface RelatedInvestigation {
  id: string;
  entity: string;
  risk: RiskLevel;
  status: string;
}

export const RELATED_INVESTIGATIONS: RelatedInvestigation[] = [
  {
    id: "INV-2026-00425",
    entity: "Blue Horizon Shipping",
    risk: "HIGH",
    status: "Awaiting Decision",
  },
  { id: "INV-2026-00429", entity: "Crimson Endeavour Ltd", risk: "HIGH", status: "Open" },
  { id: "INV-2026-00420", entity: "MV Star of Lagos", risk: "MEDIUM", status: "Open" },
];

/** INV-8 AI findings table. */
export interface AIFinding {
  id: number;
  title: string;
  category: SignalDomain;
  confidencePct: number;
  evidenceCount: number;
  /** Simulation timestamp. Nothing here was observed. */
  firstSeen: string;
  status: "NEW" | "REVIEW";
  explanation: string;
  keyIndicators: string[];
}

export const AI_FINDINGS: AIFinding[] = [
  {
    id: 1,
    title: "AIS transit gap coincides with cargo re-declaration window",
    category: "Vessel Movement",
    confidencePct: 88,
    evidenceCount: 6,
    firstSeen: "04 Jun 09:12",
    status: "REVIEW",
    explanation:
      "MV Ocean Pearl is observed with a 2h 14m AIS gap that overlaps a subsequent BOL amendment.",
    keyIndicators: [
      "Satellite AIS confirms no transponder signal 09:12–11:26",
      "BOL amendment logged at 11:04 by consignee",
      "Prior 90 days show 0 blackouts on this vessel",
    ],
  },
  {
    id: 2,
    title: "Consignee duty base 22% below peer median",
    category: "Revenue",
    confidencePct: 74,
    evidenceCount: 4,
    firstSeen: "03 Jun 21:40",
    status: "NEW",
    explanation:
      "Northgate Logistics duty base for HS 7213 is observed 22% below the 12-month peer median.",
    keyIndicators: ["Peer set: 8 consignees, HS 7213 lane", "Rolling 3-month divergence widening"],
  },
  {
    id: 3,
    title: "Ownership graph adds three shell links in 30 days",
    category: "Ownership",
    confidencePct: 69,
    evidenceCount: 5,
    firstSeen: "02 Jun 14:12",
    status: "NEW",
    explanation:
      "Crimson Endeavour Ltd is observed connected to three newly registered entities via shared director.",
    keyIndicators: ["Shared director K. Adebayo", "Entities registered in same 30-day window"],
  },
  {
    id: 4,
    title: "Duplicate BOL filed within 48h",
    category: "Manifest",
    confidencePct: 96,
    evidenceCount: 2,
    firstSeen: "03 Jun 08:00",
    status: "REVIEW",
    explanation: "BOL #MSKU8842119 is observed on two consignments filed 48h apart.",
    keyIndicators: ["Exact BOL number match", "Different consignee IDs"],
  },
];

/** INV-7 counters. */
export const INV_BOTTOM_COUNTS = {
  findings: AI_FINDINGS.length,
  rules: 7,
  evidence: 14,
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared — Evidence, Files, Rules, Audit
// ─────────────────────────────────────────────────────────────────────────────

export interface EvidenceItem {
  id: string;
  title: string;
  type: "PDF" | "IMG" | "AIS" | "CSV" | "GRAPH";
  source: string;
  timestamp: string;
  confidence: ConfidenceTier;
  size: string;
}

export const EVIDENCE_ITEMS: EvidenceItem[] = [
  {
    id: "EV-1",
    title: "Satellite AIS extract · 04 Jun 09:00–12:00",
    type: "AIS",
    source: "SpireGlobal",
    timestamp: "04 Jun 12:04",
    confidence: "unconfirmed",
    size: "142 KB",
  },
  {
    id: "EV-2",
    title: "Bill of Lading #MSKU8842119",
    type: "PDF",
    source: "Terminal Operator",
    timestamp: "04 Jun 08:42",
    confidence: "unconfirmed",
    size: "312 KB",
  },
  {
    id: "EV-3",
    title: "Weighbridge photo · gate 4",
    type: "IMG",
    source: "Apapa Terminal CCTV",
    timestamp: "04 Jun 09:11",
    confidence: "unconfirmed",
    size: "1.4 MB",
  },
  {
    id: "EV-4",
    title: "Ownership graph snapshot",
    type: "GRAPH",
    source: "Seaphore KG",
    timestamp: "04 Jun 10:20",
    confidence: "inferred",
    size: "—",
  },
  {
    id: "EV-5",
    title: "Duty computation worksheet",
    type: "CSV",
    source: "Revenue Ledger",
    timestamp: "04 Jun 07:58",
    confidence: "unconfirmed",
    size: "18 KB",
  },
];

export interface RuleTrigger {
  id: string;
  title: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  hits: number;
}

export const RULES_TRIGGERED: RuleTrigger[] = [
  { id: "R-014", title: "AIS gap > 60 min in restricted lane", impact: "HIGH", hits: 1 },
  { id: "R-027", title: "Declared vs scale weight variance > 10%", impact: "HIGH", hits: 1 },
  { id: "R-041", title: "Beneficial owner change within 60 days", impact: "MEDIUM", hits: 1 },
  { id: "R-055", title: "Duty base below peer median > 15%", impact: "MEDIUM", hits: 1 },
  { id: "R-062", title: "Duplicate BOL within 48h", impact: "MEDIUM", hits: 1 },
  { id: "R-071", title: "Watchlist 2-hop match", impact: "HIGH", hits: 1 },
  { id: "R-088", title: "Container seal mismatch on arrival", impact: "LOW", hits: 1 },
];

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
  kind: "System" | "Officer" | "Data" | "Export" | "Share";
}

export const AUDIT_TRAIL: AuditEvent[] = [
  {
    id: "A-1",
    at: "04 Jun 12:04 UTC",
    actor: "Seaphore Ingest",
    action: "Signal ingested",
    detail: "SIG-01142 · AIS blackout",
    kind: "System",
  },
  {
    id: "A-2",
    at: "04 Jun 12:07 UTC",
    actor: "Seaphore Copilot",
    action: "Finding generated",
    detail: "F-1 · AIS gap coincides with re-declaration",
    kind: "System",
  },
  {
    id: "A-3",
    at: "04 Jun 12:14 UTC",
    actor: "Cdr. J. Bello",
    action: "Case opened",
    detail: "INV-2026-00431",
    kind: "Officer",
  },
  {
    id: "A-4",
    at: "04 Jun 12:22 UTC",
    actor: "Cdr. J. Bello",
    action: "Evidence attached",
    detail: "EV-1, EV-2, EV-3",
    kind: "Officer",
  },
  {
    id: "A-5",
    at: "04 Jun 12:41 UTC",
    actor: "Seaphore Rules Engine",
    action: "Rules triggered",
    detail: "R-014, R-027, R-071",
    kind: "System",
  },
  {
    id: "A-6",
    at: "04 Jun 13:02 UTC",
    actor: "Ownership Service",
    action: "Graph refreshed",
    detail: "+3 nodes, +5 edges",
    kind: "Data",
  },
  {
    id: "A-7",
    at: "04 Jun 13:18 UTC",
    actor: "Cdr. J. Bello",
    action: "Note added",
    detail: "Requested corporate registry pull",
    kind: "Officer",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SH — Share
// ─────────────────────────────────────────────────────────────────────────────

export type OutputType =
  | "Generate Brief"
  | "Generate PDF"
  | "Generate Word"
  | "Intelligence Pack"
  | "Email"
  | "WhatsApp"
  | "Print"
  | "Archive";

export const SHARE_OUTPUTS: OutputType[] = [
  "Generate Brief",
  "Generate PDF",
  "Generate Word",
  "Intelligence Pack",
  "Email",
  "WhatsApp",
  "Print",
  "Archive",
];

export type Classification = "OFFICIAL–SENSITIVE" | "RESTRICTED" | "CONFIDENTIAL";

export const CLASSIFICATIONS: Classification[] = [
  "OFFICIAL–SENSITIVE",
  "RESTRICTED",
  "CONFIDENTIAL",
];

export const LANGUAGES = ["English", "French", "Portuguese"] as const;
export type Language = (typeof LANGUAGES)[number];

export const AGENCY_RECIPIENTS = [
  { id: "CUSTOMS", name: "Nigeria Customs Service" },
  { id: "NAVY", name: "Nigerian Navy" },
  { id: "MARINE_POLICE", name: "Marine Police" },
  { id: "NPA", name: "Nigerian Ports Authority" },
  { id: "NIMASA", name: "NIMASA" },
  { id: "EFCC", name: "EFCC" },
  { id: "NDLEA", name: "NDLEA" },
];

export interface RecentShare {
  id: string;
  investigationId: string;
  title: string;
  date: string;
}

export const RECENT_SHARES: RecentShare[] = [
  {
    id: "SH-2041",
    investigationId: "INV-2026-00425",
    title: "Sanctions match briefing — Blue Horizon",
    date: "03 Jun 2026",
  },
  {
    id: "SH-2040",
    investigationId: "INV-2026-00420",
    title: "Revenue anomaly — MV Star of Lagos",
    date: "02 Jun 2026",
  },
  {
    id: "SH-2039",
    investigationId: "INV-2026-00429",
    title: "Ownership expansion — Crimson Endeavour",
    date: "01 Jun 2026",
  },
  {
    id: "SH-2038",
    investigationId: "INV-2026-00418",
    title: "Duplicate BOL brief — MSKU8842119",
    date: "30 May 2026",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MEM — Institutional Memory
// ─────────────────────────────────────────────────────────────────────────────

export interface EntityProfile {
  id: string;
  name: string;
  imo?: string;
  kind: "Vessel" | "Company" | "Person" | "Port";
  flag?: string;
  riskScore: number;
  confidence: ConfidenceTier;
  totalVessels: number;
  totalVoyages: number;
  revenueAtRisk: string;
  investigatedCount: number;
  openInvestigations: number;
  closedInvestigations: number;
  riskLevel: RiskLevel;
  trend: "rising" | "falling" | "stable";
  firstSeen: string;
  lastSeen: string;
  knownSince: string;
  watchlist: boolean;
}

export const MEMORY_ENTITY: EntityProfile = {
  id: "VE-00042",
  name: "MV Ocean Pearl",
  imo: "DEMO-9432187",
  kind: "Vessel",
  flag: "Panama",
  riskScore: 82,
  confidence: "inferred",
  totalVessels: 1,
  totalVoyages: 47,
  revenueAtRisk: "₦612M",
  investigatedCount: 6,
  openInvestigations: 2,
  closedInvestigations: 4,
  riskLevel: "HIGH",
  trend: "rising",
  firstSeen: "12 Feb 2023",
  lastSeen: "04 Jun 2026",
  knownSince: "3 years",
  watchlist: true,
};

export interface KeyInsight {
  observation: string;
  confidence: ConfidenceTier;
}

export const MEMORY_INSIGHTS: KeyInsight[] = [
  {
    observation: "Recurring AIS gaps observed on Bonny transit lane over 18 months.",
    confidence: "unconfirmed",
  },
  {
    observation: "Beneficial ownership has shifted twice within the tracking window.",
    confidence: "inferred",
  },
  {
    observation: "Duty base for steel-products lane is inferred below peer median.",
    confidence: "inferred",
  },
  {
    observation: "No sanctions match verified in current watchlist snapshot.",
    confidence: "unconfirmed",
  },
];

export interface SimilarEntity {
  id: string;
  name: string;
  matchPct: number;
}
export const SIMILAR_ENTITIES: SimilarEntity[] = [
  { id: "VE-00088", name: "Blue Horizon", matchPct: 84 },
  { id: "VE-00105", name: "MV Star of Lagos", matchPct: 71 },
  { id: "VE-00071", name: "MV Crimson Endeavour", matchPct: 64 },
];

export const MEMORY_TABS = [
  { key: "profiles", label: "Entity Profiles" },
  { key: "history", label: "Case History" },
  { key: "lessons", label: "Lessons Learned" },
  { key: "patterns", label: "Patterns Library" },
  { key: "officers", label: "Officer Directory" },
  { key: "revenue", label: "Revenue Intelligence" },
  { key: "graph", label: "Knowledge Graph", isNew: true },
] as const;

export type MemoryTabKey = (typeof MEMORY_TABS)[number]["key"];

export const ENTITY_SUBTABS = [
  "Overview",
  "Risk",
  "Relationships",
  "Fleet",
  "Owners",
  "History",
  "Financial",
  "Compliance",
  "Timeline",
  "Documents",
  "Investigations",
  "Connected Ports",
  "Sanctions",
  "Patterns",
  "Offences",
] as const;
export type EntitySubtab = (typeof ENTITY_SUBTABS)[number];

export const AUDIT_FILTERS = [
  "All Events",
  "System",
  "Officer",
  "Data Changes",
  "Exports",
  "Shares",
] as const;
