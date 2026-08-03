/**
 * Evidence Library — enriched seed model.
 *
 * The public.evidence table is intentionally generic (id, investigation_id,
 * evidence_type, source, storage_path, ...). The Library workspace needs
 * many derived UI concerns — confidence, size, tags, linked entities,
 * chain-of-custody — that are computed/mapped in the service layer.
 * When the DB is empty we seed from this module so officers see a live-feel
 * workspace; when rows exist the service maps them onto this shape.
 */
import type { ConfidenceTier } from "@/components/intelligence/ConfidenceChip";
import { PORTS, VESSELS } from "@/lib/intel-centre-data";

const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

export type EvidenceKind =
  | "Bill of Lading"
  | "Import Manifest"
  | "Manifest"
  | "Invoice"
  | "Container List"
  | "Cargo Declaration"
  | "Inspection Report"
  | "Photo"
  | "AIS Track"
  | "Certificate"
  | "Payment Receipt";

export type EvidenceCategory =
  "Documents" | "Media" | "AIS Records" | "Manifests" | "Bills of Lading";

export type EvidenceClassification =
  "Official Document" | "Field Capture" | "System Ingest" | "Third-Party Feed" | "OSINT";

export interface EvidenceItem {
  id: string;
  refNumber: string;
  kind: EvidenceKind;
  category: EvidenceCategory;
  format: "PDF" | "JPG" | "PNG" | "CSV" | "XML" | "JSON";
  classification: EvidenceClassification;
  source: string;
  confidence: ConfidenceTier;
  confidenceScore: number; // 0..100
  uploadedAt: string;
  uploadedBy: string;
  sizeKb: number;
  linkedVesselId?: string;
  linkedPortCode?: string;
  linkedCompany?: string;
  linkedVoyage?: string;
  linkedInvestigation?: string;
  tags: string[];
  description: string;
  // Chain of custody entries. Rendered in the CoC strip.
  custody: CustodyEntry[];
}

export interface CustodyEntry {
  step:
    | "Uploaded"
    | "Verified"
    | "Reviewed"
    | "Referenced by AI"
    | "Used in Investigation"
    | "Officer Decision"
    | "Shared"
    | "Archived";
  at: string;
  by: string;
}

const nowIso = new Date().toISOString();

function stdCustody(uploadedAt: string, uploader: string, invId?: string): CustodyEntry[] {
  return [
    { step: "Uploaded", at: uploadedAt, by: uploader },
    { step: "Verified", at: uploadedAt, by: "Mary Akinyemi" },
    { step: "Reviewed", at: uploadedAt, by: "Ibrahim Yusuf" },
    { step: "Referenced by AI", at: uploadedAt, by: "Seaphore Copilot" },
    { step: "Used in Investigation", at: uploadedAt, by: invId ?? "INV-2026-00431" },
    { step: "Officer Decision", at: uploadedAt, by: "John Bello" },
    { step: "Shared", at: uploadedAt, by: "NPA" },
  ];
}

export const EVIDENCE_LIBRARY: EvidenceItem[] = [
  {
    id: "ev-001",
    refNumber: "MSKU1234567",
    kind: "Bill of Lading",
    category: "Bills of Lading",
    format: "PDF",
    classification: "Official Document",
    source: "Shipping Line",
    confidence: "verified",
    confidenceScore: 98,
    uploadedAt: iso(0.1),
    uploadedBy: "John Bello",
    sizeKb: 1200,
    linkedVesselId: "v-ocean-pearl",
    linkedPortCode: "APAPA",
    linkedCompany: "Global Chartering Inc.",
    linkedVoyage: "LAG20260527",
    linkedInvestigation: "INV-2026-00431",
    tags: ["Revenue", "Import", "Container", "Apapa Port"],
    description: "Original bill of lading for 40ft container from Shanghai to Lagos.",
    custody: stdCustody(iso(0.1), "John Bello", "INV-2026-00431"),
  },
  {
    id: "ev-002",
    refNumber: "NCSM20261SC27001",
    kind: "Import Manifest",
    category: "Manifests",
    format: "PDF",
    classification: "Official Document",
    source: "Customs Service",
    confidence: "verified",
    confidenceScore: 96,
    uploadedAt: iso(0.4),
    uploadedBy: "Mary Akinyemi",
    sizeKb: 820,
    linkedVesselId: "v-ocean-pearl",
    linkedPortCode: "TCIP",
    linkedInvestigation: "INV-2026-00431",
    tags: ["Customs", "Import", "Manifest"],
    description: "Import manifest lodged for MV Ocean Pearl voyage LAG20260527.",
    custody: stdCustody(iso(0.4), "Mary Akinyemi", "INV-2026-00431"),
  },
  {
    id: "ev-003",
    refNumber: "IR-APPA-05272026",
    kind: "Inspection Report",
    category: "Documents",
    format: "PDF",
    classification: "Field Capture",
    source: "PSC Inspection",
    confidence: "observed",
    confidenceScore: 84,
    uploadedAt: iso(0.7),
    uploadedBy: "Ibrahim Yusuf",
    sizeKb: 512,
    linkedVesselId: "v-blue-horizon",
    linkedPortCode: "APAPA",
    linkedInvestigation: "INV-2026-00312",
    tags: ["Inspection", "PSC"],
    description: "Port State Control inspection for MV Blue Horizon on 27 May 2026.",
    custody: stdCustody(iso(0.7), "Ibrahim Yusuf", "INV-2026-00312"),
  },
  {
    id: "ev-004",
    refNumber: "APPA-IMG-55421",
    kind: "Photo",
    category: "Media",
    format: "JPG",
    classification: "Field Capture",
    source: "Officer Camera",
    confidence: "verified",
    confidenceScore: 95,
    uploadedAt: iso(1),
    uploadedBy: "John Bello",
    sizeKb: 3120,
    linkedVesselId: "v-ocean-pearl",
    linkedPortCode: "APAPA",
    linkedInvestigation: "INV-2026-00431",
    tags: ["Container", "Photo"],
    description: "Container photo captured during dockside inspection.",
    custody: stdCustody(iso(1), "John Bello", "INV-2026-00431"),
  },
  {
    id: "ev-005",
    refNumber: "IMO-9837456",
    kind: "AIS Track",
    category: "AIS Records",
    format: "JSON",
    classification: "System Ingest",
    source: "MarineTraffic",
    confidence: "verified",
    confidenceScore: 99,
    uploadedAt: iso(1.3),
    uploadedBy: "System Ingest",
    sizeKb: 44,
    linkedVesselId: "v-ocean-pearl",
    linkedInvestigation: "INV-2026-00431",
    tags: ["AIS", "Track"],
    description: "48-hour AIS track for IMO 9837456 approaching Apapa anchorage.",
    custody: stdCustody(iso(1.3), "System Ingest", "INV-2026-00431"),
  },
  {
    id: "ev-006",
    refNumber: "INV-785421.pdf",
    kind: "Invoice",
    category: "Documents",
    format: "PDF",
    classification: "Third-Party Feed",
    source: "Consignee Filing",
    confidence: "inferred",
    confidenceScore: 72,
    uploadedAt: iso(1.6),
    uploadedBy: "Mary Akinyemi",
    sizeKb: 96,
    linkedCompany: "Global Chartering Inc.",
    linkedInvestigation: "INV-2026-00521",
    tags: ["Invoice", "Commercial"],
    description: "Commercial invoice supplied by consignee, provenance partial.",
    custody: stdCustody(iso(1.6), "Mary Akinyemi", "INV-2026-00521"),
  },
  {
    id: "ev-007",
    refNumber: "PSC-2026-002",
    kind: "Certificate",
    category: "Documents",
    format: "PDF",
    classification: "Official Document",
    source: "Class Society",
    confidence: "verified",
    confidenceScore: 97,
    uploadedAt: iso(2),
    uploadedBy: "System Ingest",
    sizeKb: 604,
    linkedVesselId: "v-gulf-trader",
    linkedInvestigation: "INV-2026-00432",
    tags: ["Certificate", "Compliance"],
    description: "Port State Control clean certificate for MT Gulf Trader.",
    custody: stdCustody(iso(2), "System Ingest", "INV-2026-00432"),
  },
  {
    id: "ev-008",
    refNumber: "CTR-OP-2412",
    kind: "Container List",
    category: "Manifests",
    format: "CSV",
    classification: "Third-Party Feed",
    source: "Terminal Operator",
    confidence: "observed",
    confidenceScore: 88,
    uploadedAt: iso(2.4),
    uploadedBy: "Sahara Cargo Ni.",
    sizeKb: 21,
    linkedVesselId: "v-ocean-pearl",
    linkedPortCode: "APAPA",
    linkedInvestigation: "INV-2026-00431",
    tags: ["Container", "Manifest"],
    description: "40ft container list submitted by terminal operator.",
    custody: stdCustody(iso(2.4), "Sahara Cargo Ni.", "INV-2026-00431"),
  },
  {
    id: "ev-009",
    refNumber: "AIS-NR-8801",
    kind: "AIS Track",
    category: "AIS Records",
    format: "JSON",
    classification: "System Ingest",
    source: "AIS Feed",
    confidence: "observed",
    confidenceScore: 90,
    uploadedAt: iso(3),
    uploadedBy: "System Ingest",
    sizeKb: 14,
    linkedVesselId: "v-niger-runner",
    linkedInvestigation: "INV-2026-00312",
    tags: ["AIS", "Anomaly"],
    description: "AIS snapshot showing gap near restricted zone.",
    custody: stdCustody(iso(3), "System Ingest", "INV-2026-00312"),
  },
  {
    id: "ev-010",
    refNumber: "CD-DS-1907",
    kind: "Cargo Declaration",
    category: "Documents",
    format: "PDF",
    classification: "Official Document",
    source: "Cargo Filing",
    confidence: "observed",
    confidenceScore: 85,
    uploadedAt: iso(3.6),
    uploadedBy: "Officer Bello",
    sizeKb: 208,
    linkedVesselId: "v-delta-star",
    linkedInvestigation: "INV-2026-00521",
    tags: ["Cargo", "Declaration"],
    description: "Cargo declaration lodged by consignor.",
    custody: stdCustody(iso(3.6), "Officer Bello", "INV-2026-00521"),
  },
  {
    id: "ev-011",
    refNumber: "IMG-DS-1907-A",
    kind: "Photo",
    category: "Media",
    format: "JPG",
    classification: "Field Capture",
    source: "Officer Camera",
    confidence: "observed",
    confidenceScore: 82,
    uploadedAt: iso(4),
    uploadedBy: "Officer Bello",
    sizeKb: 2820,
    linkedVesselId: "v-delta-star",
    linkedInvestigation: "INV-2026-00521",
    tags: ["Photo", "Inspection"],
    description: "Deck photo of cargo hatch anomaly.",
    custody: stdCustody(iso(4), "Officer Bello", "INV-2026-00521"),
  },
  {
    id: "ev-012",
    refNumber: "RCP-2412-A44",
    kind: "Payment Receipt",
    category: "Documents",
    format: "PDF",
    classification: "Official Document",
    source: "Bank Feed",
    confidence: "verified",
    confidenceScore: 94,
    uploadedAt: iso(4.5),
    uploadedBy: "Officer Adeyemi",
    sizeKb: 44,
    linkedInvestigation: "INV-2026-00432",
    tags: ["Payment", "Duty"],
    description: "Duty payment receipt reconciled with manifest.",
    custody: stdCustody(iso(4.5), "Officer Adeyemi", "INV-2026-00432"),
  },
];

/* Aggregate helpers used by KPI ribbon + stats donut. */
export const KIND_TO_CATEGORY: Record<EvidenceKind, EvidenceCategory> = {
  "Bill of Lading": "Bills of Lading",
  "Import Manifest": "Manifests",
  Manifest: "Manifests",
  Invoice: "Documents",
  "Container List": "Manifests",
  "Cargo Declaration": "Documents",
  "Inspection Report": "Documents",
  Photo: "Media",
  "AIS Track": "AIS Records",
  Certificate: "Documents",
  "Payment Receipt": "Documents",
};

export function portName(code?: string) {
  if (!code) return undefined;
  return PORTS.find((p) => p.code === code)?.name;
}
export function vesselName(id?: string) {
  if (!id) return undefined;
  return VESSELS.find((v) => v.id === id)?.name;
}

export const AUDIT_ENTRIES = [
  { at: iso(0.1), action: "Shared with NPA", by: "John Bello" },
  { at: iso(0.3), action: "Decision submitted", by: "John Bello" },
  { at: iso(0.5), action: "Used in investigation", by: "Mary Akinyemi" },
  { at: iso(0.7), action: "Analyzed by AI", by: "Seaphore Copilot" },
  { at: iso(1), action: "Reviewed evidence", by: "Ibrahim Yusuf" },
  { at: iso(1.3), action: "Evidence verified", by: "Mary Akinyemi" },
  { at: iso(1.6), action: "Evidence uploaded", by: "John Bello" },
];

/** Last write timestamp — used by "now-Iso" ribbon and freshness labels. */
export const LIBRARY_UPDATED_AT = nowIso;
