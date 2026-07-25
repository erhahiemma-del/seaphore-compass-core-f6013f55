/**
 * Cross-connector conflict detection.
 *
 * A conflict is a set of evidence items that make incompatible claims about
 * the same entity+dimension. Detection is deterministic and evidence-anchored;
 * every conflict cites the underlying evidence ids so investigators can
 * inspect the raw statements. Golden Rule: conflicts are surfaced, not hidden.
 */
import type { IntelligenceEvidenceItem, EvidenceEntityRef } from "@/lib/evidence/intelligence-evidence";

export type ConflictDimension =
  | "identity"
  | "sanctions"
  | "ownership"
  | "movement"
  | "assessment";

export interface EvidenceConflict {
  id: string;
  dimension: ConflictDimension;
  /** Officer-facing entity name for the conflict. */
  entity: string;
  entityId?: string;
  /** Short officer-facing description. */
  description: string;
  /** All evidence items that participate in the conflict. */
  evidenceIds: string[];
  /** Distinct connectors that contributed conflicting evidence. */
  connectors: string[];
}

function entityKeyForConflict(e: EvidenceEntityRef): string {
  return `${e.type}:${(e.id ?? e.name).toLowerCase()}`;
}

function entityForItem(item: IntelligenceEvidenceItem): EvidenceEntityRef | undefined {
  if (item.entities && item.entities[0]) return item.entities[0];
  if (item.subject) return { type: "vessel", name: item.subject };
  return undefined;
}

/**
 * Group evidence by (entity, dimension) and flag groups where connectors
 * disagree — divergent status ("rejected" vs "verified"), or divergent
 * confidence chips ("VERIFIED" vs "UNCONFIRMED"), or explicit "conflicting".
 */
export function detectConflicts(items: IntelligenceEvidenceItem[]): EvidenceConflict[] {
  const buckets = new Map<string, IntelligenceEvidenceItem[]>();
  for (const it of items) {
    const dim = dimensionFor(it);
    if (!dim) continue;
    const ent = entityForItem(it);
    if (!ent) continue;
    const key = `${entityKeyForConflict(ent)}|${dim}`;
    const arr = buckets.get(key) ?? [];
    arr.push(it);
    buckets.set(key, arr);
  }

  const conflicts: EvidenceConflict[] = [];
  for (const [key, group] of buckets) {
    if (group.length < 2) continue;
    const statuses = new Set(group.map((g) => g.status));
    const chips = new Set(group.map((g) => g.confidence));
    const flagged =
      statuses.has("conflicting") ||
      (statuses.has("rejected") && statuses.has("verified")) ||
      (chips.has("VERIFIED") && chips.has("UNCONFIRMED"));
    if (!flagged) continue;
    const ent = entityForItem(group[0])!;
    const [, dim] = key.split("|") as [string, ConflictDimension];
    const connectors = Array.from(
      new Set(group.map((g) => g.connector).filter((c): c is string => Boolean(c))),
    );
    conflicts.push({
      id: `conflict.${key}`,
      dimension: dim,
      entity: ent.name,
      entityId: ent.id,
      description: describeConflict(dim, group),
      evidenceIds: group.map((g) => g.id),
      connectors,
    });
  }

  return conflicts.sort((a, b) => b.evidenceIds.length - a.evidenceIds.length);
}

function dimensionFor(it: IntelligenceEvidenceItem): ConflictDimension | undefined {
  switch (it.evidenceType) {
    case "identity":
      return "identity";
    case "sanctions":
      return "sanctions";
    case "ownership":
      return "ownership";
    case "movement":
    case "ais-continuity":
      return "movement";
    case "assessment":
      return "assessment";
    default:
      return undefined;
  }
}

function describeConflict(
  dim: ConflictDimension,
  group: IntelligenceEvidenceItem[],
): string {
  const sources = Array.from(new Set(group.map((g) => g.source))).slice(0, 3);
  const suffix = sources.length ? ` (${sources.join(" · ")})` : "";
  switch (dim) {
    case "identity":
      return `Connectors disagree on identity resolution${suffix}.`;
    case "sanctions":
      return `Sanctions status conflicts across connectors${suffix}.`;
    case "ownership":
      return `Beneficial-ownership evidence conflicts${suffix}.`;
    case "movement":
      return `Movement / AIS evidence conflicts${suffix}.`;
    case "assessment":
      return `Assessment outputs disagree${suffix}.`;
  }
}
