/**
 * EIE · Relationship derivation.
 *
 * Turns evidenced fields on a normalised record into directed, explained
 * relationships. Nothing is inferred beyond what a field asserts: if no
 * record names an owner, no `owns` edge exists — the profile reports the
 * gap instead.
 */
import type { NormalizedEvidence } from "@/services/ial/types";
import type { EieEntityType, EieRelationshipType } from "./types";

export interface RelationshipAssertion {
  readonly type: EieRelationshipType;
  readonly sourceId: string;
  readonly targetId: string;
  readonly targetType: EieEntityType;
  readonly targetLabel: string;
  readonly explanation: string;
}

function slug(v: string): string {
  return v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function text(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function pick(f: Record<string, unknown>, keys: ReadonlyArray<string>): string | null {
  for (const k of keys) {
    const v = text(f[k]);
    if (v) return v;
  }
  return null;
}

/** Mint a canonical id for a counterpart that arrived as a bare value. */
function mint(kind: EieEntityType, value: string): string {
  const v = value.trim();
  if (v.includes(":")) return v;
  switch (kind) {
    case "container":
      return `cargo:container:${v.toUpperCase().replace(/\s+/g, "")}`;
    case "bill-of-lading":
      return `cargo:bol:${v.toUpperCase().replace(/\s+/g, "")}`;
    case "manifest":
      return `cargo:manifest:${v.toUpperCase().replace(/\s+/g, "")}`;
    case "voyage":
      return `voyage:${slug(v)}`;
    case "port":
      return /^[A-Za-z]{5}$/.test(v) ? `port:unlocode:${v.toUpperCase()}` : `port:name:${slug(v)}`;
    case "terminal":
      return `terminal:name:${slug(v)}`;
    case "person":
      return `person:name:${slug(v)}`;
    case "importer":
    case "exporter":
    case "consignee":
      return `${kind}:name:${slug(v)}`;
    case "vessel":
      return /^\d{7}$/.test(v) ? `vessel:imo:${v}` : `vessel:name:${slug(v)}`;
    default:
      return `company:name:${slug(v)}`;
  }
}

interface FieldRule {
  readonly idKeys: ReadonlyArray<string>;
  readonly nameKeys: ReadonlyArray<string>;
  readonly type: EieRelationshipType;
  readonly targetType: EieEntityType;
  /** When true the counterpart is the relationship SOURCE (it acts on us). */
  readonly inbound?: boolean;
  readonly explain: (subject: string, counterpart: string, source: string) => string;
}

const RULES: ReadonlyArray<FieldRule> = [
  {
    idKeys: ["ownerEntityId", "ownerId"],
    nameKeys: ["ownerName", "registeredOwner", "owner"],
    type: "owns",
    targetType: "company",
    inbound: true,
    explain: (s, c, src) => `${c} is recorded as owner of ${s} by ${src}.`,
  },
  {
    idKeys: ["managerEntityId", "managerId"],
    nameKeys: ["managerName", "shipManager", "manager"],
    type: "manages",
    targetType: "company",
    inbound: true,
    explain: (s, c, src) => `${c} is recorded as manager of ${s} by ${src}.`,
  },
  {
    idKeys: ["operatorEntityId", "operatorId"],
    nameKeys: ["operatorName", "commercialOperator", "operator"],
    type: "operates",
    targetType: "company",
    inbound: true,
    explain: (s, c, src) => `${c} is recorded as operator of ${s} by ${src}.`,
  },
  {
    idKeys: ["directorEntityId"],
    nameKeys: ["directorName", "director"],
    type: "director_of",
    targetType: "person",
    inbound: true,
    explain: (s, c, src) => `${c} is recorded as a director of ${s} by ${src}.`,
  },
  {
    idKeys: ["associatedEntityId"],
    nameKeys: ["associatedName"],
    type: "associated_with",
    targetType: "company",
    explain: (s, c, src) => `${s} is linked to ${c} by ${src}.`,
  },
  {
    idKeys: ["portEntityId", "portId"],
    nameKeys: ["portOfCall", "portUnlocode", "portName", "port"],
    type: "called_at",
    targetType: "port",
    explain: (s, c, src) => `${s} was observed at ${c} by ${src}.`,
  },
  {
    idKeys: ["terminalEntityId", "terminalId"],
    nameKeys: ["terminal", "terminalName"],
    type: "berthed_at",
    targetType: "terminal",
    explain: (s, c, src) => `${s} was recorded alongside ${c} by ${src}.`,
  },
  {
    idKeys: ["voyageEntityId", "voyageId"],
    nameKeys: ["voyageNumber", "voyage"],
    type: "performed_voyage",
    targetType: "voyage",
    explain: (s, c, src) => `${s} is linked to voyage ${c} by ${src}.`,
  },
  {
    idKeys: ["containerEntityId"],
    nameKeys: ["containerNumber", "container_no", "containerId"],
    type: "stows",
    targetType: "container",
    explain: (s, c, src) => `${s} is documented against container ${c} by ${src}.`,
  },
  {
    idKeys: ["billOfLadingEntityId"],
    nameKeys: ["billOfLading", "bolNumber", "bl_number"],
    type: "covers",
    targetType: "bill-of-lading",
    explain: (s, c, src) => `${s} is documented on bill of lading ${c} by ${src}.`,
  },
  {
    idKeys: ["manifestEntityId", "manifestId"],
    nameKeys: ["manifestNumber", "manifest"],
    type: "declared_on",
    targetType: "manifest",
    explain: (s, c, src) => `${s} is declared on manifest ${c} by ${src}.`,
  },
  {
    idKeys: ["consigneeEntityId"],
    nameKeys: ["consigneeName", "consignee"],
    type: "consigned_to",
    targetType: "consignee",
    explain: (s, c, src) => `${s} is consigned to ${c} by ${src}.`,
  },
  {
    idKeys: ["importerEntityId"],
    nameKeys: ["importerName", "importer"],
    type: "imported_by",
    targetType: "importer",
    explain: (s, c, src) => `${s} is declared for import by ${c} (${src}).`,
  },
  {
    idKeys: ["exporterEntityId"],
    nameKeys: ["exporterName", "exporter"],
    type: "exported_by",
    targetType: "exporter",
    explain: (s, c, src) => `${s} is declared for export by ${c} (${src}).`,
  },
  {
    idKeys: ["shipperEntityId"],
    nameKeys: ["shipperName", "shipper"],
    type: "shipped_by",
    targetType: "company",
    explain: (s, c, src) => `${s} was shipped by ${c} according to ${src}.`,
  },
  {
    idKeys: ["vesselEntityId"],
    nameKeys: ["vesselImo", "vesselName"],
    type: "carried",
    targetType: "vessel",
    inbound: true,
    explain: (s, c, src) => `${c} carried ${s} according to ${src}.`,
  },
];

/**
 * Every relationship the record asserts about its own entity.
 * Counterpart labels prefer the human name field when present.
 */
export function deriveRelationships(
  record: NormalizedEvidence,
): ReadonlyArray<RelationshipAssertion> {
  const f = record.fields as Record<string, unknown>;
  const subjectId = record.entity.id;
  const subjectLabel = record.entity.label ?? subjectId;
  const out: RelationshipAssertion[] = [];

  for (const rule of RULES) {
    const rawId = pick(f, rule.idKeys);
    const rawName = pick(f, rule.nameKeys);
    if (!rawId && !rawName) continue;
    const targetId = mint(rule.targetType, rawId ?? rawName!);
    if (targetId === subjectId) continue;
    const targetLabel = rawName ?? rawId!;
    const counterpartIsSource = rule.inbound === true;
    out.push({
      type: rule.type,
      sourceId: counterpartIsSource ? targetId : subjectId,
      targetId: counterpartIsSource ? subjectId : targetId,
      targetType: rule.targetType,
      targetLabel,
      explanation: rule.explain(subjectLabel, targetLabel, record.sourceName),
    });
  }
  return out;
}
