/**
 * Ownership Intelligence Centre — extended dataset.
 *
 * Sits on top of the shared intel-centre mock (COMPANIES / VESSELS /
 * OWNERSHIP_EDGES) and adds the persons, timeline events, investigations,
 * evidence categories, insights, recommended actions and similar networks
 * that the Ownership workspace surfaces. Replace with live Supabase reads
 * as the ownership graph tables come online — shapes are stable.
 */
import type { ConfidenceTier } from "@/components/intelligence/ConfidenceChip";
import { COMPANIES, VESSELS, OWNERSHIP_EDGES, PORTS } from "@/lib/intel-centre-data";

export type PersonRole = "Beneficial Owner" | "Director" | "Shareholder" | "Manager" | "Officer";

export interface OwnershipPerson {
  id: string;
  name: string;
  role: PersonRole;
  companyId: string;
  stakePct?: number;
  country: string;
  pep: boolean;
  sanctioned: boolean;
  verified: ConfidenceTier;
  firstSeen: string;
}

export const PERSONS: OwnershipPerson[] = [
  {
    id: "p-adewale-ogunleye",
    name: "Mr. Adewale Ogunleye",
    role: "Beneficial Owner",
    companyId: "co-oceanline",
    stakePct: 75,
    country: "Nigeria",
    pep: true,
    sanctioned: false,
    verified: "verified",
    firstSeen: "2018-04-12",
  },
  {
    id: "p-funke-ogunleye",
    name: "Mrs. Funke Ogunleye",
    role: "Beneficial Owner",
    companyId: "co-oceanline",
    stakePct: 25,
    country: "Nigeria",
    pep: false,
    sanctioned: false,
    verified: "verified",
    firstSeen: "2018-04-12",
  },
  {
    id: "p-mk-bello",
    name: "M. K. Bello",
    role: "Director",
    companyId: "co-delta",
    country: "Nigeria",
    pep: false,
    sanctioned: false,
    verified: "observed",
    firstSeen: "2016-06-18",
  },
  {
    id: "p-chukwuma-okoro",
    name: "A. Chukwuma Okoro",
    role: "Director",
    companyId: "co-trident",
    country: "Cyprus",
    pep: true,
    sanctioned: true,
    verified: "verified",
    firstSeen: "2019-11-02",
  },
  {
    id: "p-sj-adeleke",
    name: "S. J. Adeleke",
    role: "Shareholder",
    companyId: "co-gulfmar",
    stakePct: 40,
    country: "UAE",
    pep: false,
    sanctioned: false,
    verified: "inferred",
    firstSeen: "2021-01-24",
  },
  {
    id: "p-r-ibrahim",
    name: "R. Ibrahim",
    role: "Shareholder",
    companyId: "co-oceanline",
    stakePct: 15,
    country: "Nigeria",
    pep: false,
    sanctioned: false,
    verified: "observed",
    firstSeen: "2020-08-19",
  },
  {
    id: "p-e-okafor",
    name: "E. Okafor",
    role: "Officer",
    companyId: "co-atlaslog",
    country: "Nigeria",
    pep: false,
    sanctioned: false,
    verified: "verified",
    firstSeen: "2015-02-11",
  },
  {
    id: "p-l-schmidt",
    name: "L. Schmidt",
    role: "Director",
    companyId: "co-northstar",
    country: "Liberia",
    pep: false,
    sanctioned: false,
    verified: "observed",
    firstSeen: "2017-05-30",
  },
];

export type OwnershipEventKind =
  | "Company Incorporated"
  | "Ownership Transfer"
  | "New Director Appointed"
  | "Beneficial Owner Change"
  | "Operator Change"
  | "Shareholding Change"
  | "Vessel Acquired"
  | "Vessel Divested"
  | "Sanctions Match";

export interface OwnershipEvent {
  id: string;
  date: string; // ISO
  kind: OwnershipEventKind;
  entityId: string;
  summary: string;
  confidence: ConfidenceTier;
}

export const OWNERSHIP_EVENTS: OwnershipEvent[] = [
  {
    id: "e1",
    date: "2013-03-12",
    kind: "Company Incorporated",
    entityId: "co-oceanline",
    summary: "OceanLine Shipping SA incorporated in Panama",
    confidence: "verified",
  },
  {
    id: "e2",
    date: "2016-06-18",
    kind: "Ownership Transfer",
    entityId: "co-oceanline",
    summary: "50% stake transferred to holding vehicle in Cyprus",
    confidence: "verified",
  },
  {
    id: "e3",
    date: "2018-01-24",
    kind: "New Director Appointed",
    entityId: "co-delta",
    summary: "M. K. Bello appointed director — Delta Freight Ltd",
    confidence: "verified",
  },
  {
    id: "e4",
    date: "2021-04-03",
    kind: "Beneficial Owner Change",
    entityId: "co-oceanline",
    summary: "Beneficial owner disclosure updated — 75 / 25 split",
    confidence: "verified",
  },
  {
    id: "e5",
    date: "2022-08-14",
    kind: "Operator Change",
    entityId: "v-ocean-pearl",
    summary: "Operator changed from OceanLine SA to Delta Freight",
    confidence: "observed",
  },
  {
    id: "e6",
    date: "2024-02-11",
    kind: "Shareholding Change",
    entityId: "co-gulfmar",
    summary: "Shareholding restructured — S. J. Adeleke 40%",
    confidence: "inferred",
  },
  {
    id: "e7",
    date: "2026-01-05",
    kind: "Vessel Acquired",
    entityId: "co-northstar",
    summary: "MV Serengeti Bay acquired from Baltic Holdings",
    confidence: "verified",
  },
  {
    id: "e8",
    date: "2026-04-22",
    kind: "Sanctions Match",
    entityId: "co-trident",
    summary: "OFAC SDN match on beneficial owner cluster",
    confidence: "verified",
  },
];

export interface RelatedInvestigation {
  id: string;
  entityId: string;
  entityName: string;
  type: string;
  risk: "High" | "Medium" | "Low";
  officer: string;
  opened: string;
  status: "Open" | "In Progress" | "Escalated" | "Closed";
}

export const RELATED_INVESTIGATIONS: RelatedInvestigation[] = [
  {
    id: "INV-2026-00431",
    entityId: "co-oceanline",
    entityName: "OceanLine Shipping SA",
    type: "Ownership Change",
    risk: "High",
    officer: "John Bello",
    opened: "2026-05-20",
    status: "Open",
  },
  {
    id: "INV-2026-00321",
    entityId: "co-delta",
    entityName: "Crimson Marine Services",
    type: "Beneficial Ownership",
    risk: "High",
    officer: "Mary Akinyemi",
    opened: "2026-05-15",
    status: "In Progress",
  },
  {
    id: "INV-2026-00215",
    entityId: "co-trident",
    entityName: "Oceanic Holdings Ltd.",
    type: "Corporate Link Analysis",
    risk: "Medium",
    officer: "Ibrahim Yusuf",
    opened: "2026-04-28",
    status: "Open",
  },
  {
    id: "INV-2026-00102",
    entityId: "co-gulfmar",
    entityName: "Global Chartering Inc.",
    type: "Sanctions Evasion",
    risk: "High",
    officer: "John Bello",
    opened: "2026-04-12",
    status: "Open",
  },
];

export interface EvidenceBundle {
  key: string;
  label: string;
  count: number;
}

export const SUPPORTING_EVIDENCE: EvidenceBundle[] = [
  { key: "cac", label: "CAC Records", count: 24 },
  { key: "imo", label: "IMO Records", count: 18 },
  { key: "reg", label: "Registration Docs", count: 37 },
  { key: "sanctions", label: "Sanctions Lists", count: 9 },
  { key: "bol", label: "Bills of Lading", count: 112 },
  { key: "history", label: "Ownership History", count: 36 },
  { key: "audit", label: "Audit Trail", count: 58 },
  { key: "other", label: "Other Documents", count: 21 },
];

export interface KeyInsight {
  text: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
}
export const KEY_INSIGHTS: KeyInsight[] = [
  {
    text: "OceanLine Shipping SA has two beneficial owners with 75% and 25% control.",
    severity: "HIGH",
  },
  { text: "Frequent ownership changes detected in the last 24 months.", severity: "MEDIUM" },
  { text: "Links to 3 companies under active investigation.", severity: "HIGH" },
  { text: "Shared director pattern with 7 other high-risk entities.", severity: "MEDIUM" },
  {
    text: "No sanctions match found for current entities (excluding Trident cluster).",
    severity: "LOW",
  },
];

export interface RecommendedAction {
  text: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  confidence: ConfidenceTier;
}
export const RECOMMENDED_ACTIONS: RecommendedAction[] = [
  { text: "Verify beneficial ownership documents", severity: "HIGH", confidence: "verified" },
  { text: "Cross-check with CAC & IMO records", severity: "HIGH", confidence: "verified" },
  { text: "Screen all linked entities for sanctions", severity: "MEDIUM", confidence: "observed" },
  { text: "Review recent vessel transfers", severity: "MEDIUM", confidence: "observed" },
  { text: "Open investigation: Ownership changes", severity: "LOW", confidence: "inferred" },
];

export interface SimilarNetwork {
  name: string;
  similarityPct: number;
}
export const SIMILAR_NETWORKS: SimilarNetwork[] = [
  { name: "Oceanic Holdings Network", similarityPct: 74 },
  { name: "Global Chartering Network", similarityPct: 68 },
  { name: "Atlantic Marine Group Network", similarityPct: 61 },
  { name: "Blue Ocean Consortium", similarityPct: 55 },
];

export interface KpiSpec {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
  tone: "info" | "warn" | "risk" | "ok" | "neutral";
  icon: string; // lucide name key
}

export const OWNERSHIP_KPIS: KpiSpec[] = [
  {
    label: "Companies Investigated",
    value: "1,248",
    delta: "18% vs 30 days",
    trend: "up",
    tone: "info",
    icon: "building",
  },
  {
    label: "Beneficial Owners",
    value: "2,317",
    delta: "12% vs 30 days",
    trend: "up",
    tone: "info",
    icon: "userCheck",
  },
  {
    label: "Ownership Changes (30 Days)",
    value: "154",
    delta: "22% vs 30 days",
    trend: "up",
    tone: "warn",
    icon: "refresh",
  },
  {
    label: "High-Risk Entities",
    value: "87",
    delta: "8% vs 30 days",
    trend: "up",
    tone: "risk",
    icon: "alert",
  },
  {
    label: "Sanctioned Relationships",
    value: "23",
    delta: "0% vs 30 days",
    trend: "flat",
    tone: "risk",
    icon: "ban",
  },
  {
    label: "Active Networks",
    value: "312",
    delta: "15% vs 30 days",
    trend: "up",
    tone: "info",
    icon: "network",
  },
  {
    label: "Linked Vessels",
    value: "2,846",
    delta: "11% vs 30 days",
    trend: "up",
    tone: "info",
    icon: "ship",
  },
  {
    label: "Open Ownership Investigations",
    value: "19",
    delta: "3 vs 30 days",
    trend: "up",
    tone: "warn",
    icon: "folder",
  },
];

// Convenience joins
export function edgesTouching(nodeId: string) {
  return OWNERSHIP_EDGES.filter((e) => e.fromId === nodeId || e.toId === nodeId);
}

export function personsForCompany(companyId: string) {
  return PERSONS.filter((p) => p.companyId === companyId);
}

export function vesselsForCompany(companyId: string) {
  return VESSELS.filter(
    (v) => v.ownerId === companyId || v.operatorId === companyId || v.managerId === companyId,
  );
}

export function portsForCompany(companyId: string) {
  const vessels = vesselsForCompany(companyId);
  const codes = new Set(vessels.map((v) => v.destinationPort));
  return PORTS.filter((p) => codes.has(p.code));
}
