/**
 * SPRINT CAP-03 — Cargo Knowledge Graph · canonical model helpers.
 *
 * Pure functions: id-namespace → chain role, grade algebra, edge labels.
 * No I/O, no state, no provider awareness.
 */
import type { EvidenceGrade } from "@/services/ial/types";
import type { CargoEdgeType, CargoNodeRole } from "./types";

const GRADE_RANK: Record<EvidenceGrade, number> = {
  VERIFIED: 5,
  CORROBORATED: 4,
  OBSERVED: 3,
  REPORTED: 2,
  INFERRED: 1,
  UNKNOWN: 0,
};
const GRADE_BY_RANK: EvidenceGrade[] = [
  "UNKNOWN",
  "INFERRED",
  "REPORTED",
  "OBSERVED",
  "CORROBORATED",
  "VERIFIED",
];

export function strongestGrade(grades: ReadonlyArray<EvidenceGrade>): EvidenceGrade {
  if (grades.length === 0) return "UNKNOWN";
  return GRADE_BY_RANK[Math.max(...grades.map((g) => GRADE_RANK[g] ?? 0))];
}

export function weakestGrade(grades: ReadonlyArray<EvidenceGrade>): EvidenceGrade {
  if (grades.length === 0) return "UNKNOWN";
  return GRADE_BY_RANK[Math.min(...grades.map((g) => GRADE_RANK[g] ?? 0))];
}

/**
 * Chain role from the canonical id namespace, per CAPABILITY.CARGO v1.0.
 * The namespace is the ONLY disambiguator — cargo sub-types deliberately
 * share `EntityKind = "cargo"` so the v1.0 entity freeze stays intact.
 */
export function cargoRoleOf(entityId: string, kind?: string): CargoNodeRole {
  const id = entityId.toLowerCase();
  if (id.startsWith("cargo:manifest:")) return "manifest";
  if (id.startsWith("cargo:bol:") || id.startsWith("cargo:bl:")) return "bill-of-lading";
  if (id.startsWith("cargo:container:")) return "container";
  if (id.startsWith("cargo:item:")) return "cargo-item";
  if (id.startsWith("cargo:commodity:")) return "commodity";
  if (id.startsWith("cargo:hs:")) return "hs-code";
  if (id.startsWith("cargo:declaration:")) return "shipment";
  if (id.startsWith("cargo:assessment:")) return "revenue";
  if (id.startsWith("cargo:inspection:")) return "inspection";
  if (id.startsWith("cargo:investigation:") || id.startsWith("investigation:"))
    return "investigation";
  if (id.startsWith("cargo:shipment:")) return "shipment";
  if (id.startsWith("portcall:") || id.startsWith("port-call:")) return "port-call";
  if (id.startsWith("voyage:")) return "voyage";
  if (id.startsWith("vessel:")) return "vessel";
  if (id.startsWith("port:")) return "port";
  if (id.startsWith("company:") || id.startsWith("person:")) return "company";
  // Fall back to the canonical entity kind — never guess a cargo sub-type.
  switch (kind) {
    case "vessel":
      return "vessel";
    case "port":
      return "port";
    case "voyage":
      return "voyage";
    case "company":
    case "person":
      return "company";
    default:
      return "shipment";
  }
}

export const CARGO_ROLE_LABEL: Record<CargoNodeRole, string> = {
  company: "Company",
  shipment: "Shipment",
  manifest: "Manifest",
  "bill-of-lading": "Bill of Lading",
  container: "Container",
  "cargo-item": "Cargo Item",
  commodity: "Commodity",
  "hs-code": "HS Code",
  voyage: "Voyage",
  vessel: "Vessel",
  port: "Port",
  "port-call": "Port Call",
  inspection: "Inspection",
  revenue: "Revenue",
  investigation: "Investigation",
};

export const CARGO_EDGE_LABEL: Record<CargoEdgeType, string> = {
  shipped_by: "shipped by",
  consigned_to: "consigned to",
  carried_by: "carried by",
  filed_by: "filed by",
  declared_for: "declared for",
  lodged_at: "lodged at",
  contains: "contains",
  covers: "covers",
  stows: "stows",
  is_commodity: "is commodity",
  classified_as: "classified as",
  declares: "declares",
  has_leg: "has leg",
  occurs_at: "occurs at",
  moved_at: "moved at",
  operated_by: "operated by",
  inspected_by: "inspected by",
  subject_of_inspection: "subject of inspection",
  assesses: "assesses",
  generates_revenue: "generates revenue",
  part_of_investigation: "part of investigation",
};

/**
 * `rel.*` field → edge type. Relationships are carried as canonical id
 * references inside `NormalizedEvidence.fields`, exactly as frozen in
 * CAPABILITY.CARGO v1.0 §1. The edge points FROM the evidence entity TO
 * the referenced entity unless `reverse` is set.
 */
export interface RelBinding {
  readonly field: string;
  readonly type: CargoEdgeType;
  /** When true the edge is emitted as referenced → entity. */
  readonly reverse?: boolean;
}

export const CARGO_REL_BINDINGS: ReadonlyArray<RelBinding> = [
  { field: "rel.shipper", type: "shipped_by" },
  { field: "rel.consignee", type: "consigned_to" },
  { field: "rel.carrier", type: "carried_by" },
  { field: "rel.declarant", type: "filed_by" },
  { field: "rel.voyage", type: "declared_for" },
  { field: "rel.portOfDischarge", type: "lodged_at" },
  { field: "rel.port", type: "occurs_at" },
  { field: "rel.manifest", type: "contains", reverse: true },
  { field: "rel.bol", type: "covers", reverse: true },
  { field: "rel.container", type: "stows", reverse: true },
  { field: "rel.commodity", type: "is_commodity" },
  { field: "rel.hsCode", type: "classified_as" },
  { field: "rel.declaration", type: "assesses" },
  { field: "rel.portCall", type: "moved_at" },
  { field: "rel.vessel", type: "carried_by" },
  { field: "rel.operator", type: "operated_by" },
  { field: "rel.inspection", type: "subject_of_inspection" },
  { field: "rel.inspector", type: "inspected_by" },
  { field: "rel.assessment", type: "generates_revenue" },
  { field: "rel.investigation", type: "part_of_investigation" },
];
