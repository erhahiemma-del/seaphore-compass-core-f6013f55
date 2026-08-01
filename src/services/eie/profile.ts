/**
 * EIE · Entity Profile.
 *
 * Assembles the officer-facing profile for one entity: summary, timeline,
 * relationships, evidence, risk and related investigations — plus the
 * named gaps. What the platform does not know is stated, never implied.
 */
import type { EvidenceGrade } from "@/services/ial/types";
import type { EntityRegistry } from "./registry";
import {
  strongestGrade,
  weakestGrade,
  type EieEntityProfile,
  type EieInvestigationLink,
  type EieRelatedEntity,
  type EieRisk,
} from "./types";

export interface BuildProfileOptions {
  /** Investigations the caller knows reference this entity. */
  readonly investigations?: ReadonlyArray<EieInvestigationLink>;
  readonly timelineLimit?: number;
}

const SANCTION_FIELDS = ["sanctioned", "sanctionList", "listName", "program", "designation"];
const RISK_FIELDS = ["riskScore", "risk_score", "riskLevel", "detentions", "deficiencies"];

function computeRisk(
  entity: ReturnType<EntityRegistry["get"]> extends infer T ? NonNullable<T> : never,
): EieRisk {
  const drivers: { label: string; grade: EvidenceGrade; evidenceIds: string[] }[] = [];
  let numericScore: number | null = null;

  for (const ref of entity.evidence) {
    if (ref.kind === "sanctions") {
      drivers.push({
        label: `Sanctions screening record from ${ref.sourceName}`,
        grade: ref.grade,
        evidenceIds: [ref.evidenceId],
      });
    }
    if (ref.kind === "compliance") {
      drivers.push({
        label: `Compliance record from ${ref.sourceName}`,
        grade: ref.grade,
        evidenceIds: [ref.evidenceId],
      });
    }
  }

  for (const key of SANCTION_FIELDS) {
    const v = entity.attributes[key];
    if (v !== undefined && v !== false && v !== "") {
      drivers.push({
        label: `${key}: ${String(v)}`,
        grade: entity.grade,
        evidenceIds: entity.evidence.map((e) => e.evidenceId).slice(0, 3),
      });
    }
  }
  for (const key of RISK_FIELDS) {
    const v = entity.attributes[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      if (key.toLowerCase().includes("risk")) numericScore = v;
      drivers.push({
        label: `${key}: ${v}`,
        grade: entity.grade,
        evidenceIds: entity.evidence.map((e) => e.evidenceId).slice(0, 3),
      });
    }
  }

  if (drivers.length === 0) {
    return { score: null, tier: "unknown", grade: "UNKNOWN", drivers: [] };
  }
  const grade = weakestGrade(drivers.map((d) => d.grade));
  const score = numericScore;
  const tier: EieRisk["tier"] =
    score === null
      ? drivers.some((d) => d.label.toLowerCase().includes("sanction"))
        ? "high"
        : "medium"
      : score >= 80
        ? "critical"
        : score >= 60
          ? "high"
          : score >= 35
            ? "medium"
            : "low";
  return { score, tier, grade, drivers };
}

export function buildEntityProfile(
  registry: EntityRegistry,
  entityId: string,
  opts: BuildProfileOptions = {},
): EieEntityProfile | null {
  const entity = registry.get(entityId);
  if (!entity) return null;

  const related: EieRelatedEntity[] = registry
    .neighbours(entity.id)
    .map(({ relationship, entity: counterpart }) => ({
      relationship,
      counterpart,
      outbound: relationship.sourceId === entity.id,
    }))
    .sort(
      (a, b) =>
        b.relationship.confidence - a.relationship.confidence ||
        a.counterpart.label.localeCompare(b.counterpart.label),
    );

  const risk = computeRisk(entity);

  const summary: string[] = [
    `${entity.label} — ${entity.type.replace(/-/g, " ")}, canonical id ${entity.id}.`,
    `${entity.evidence.length} evidence record(s) from ${entity.sources.length} source(s); strongest supporting grade ${entity.grade}.`,
  ];
  if (entity.mergedIds.length > 0) {
    summary.push(
      `Entity resolution merged ${entity.mergedIds.length} duplicate identifier(s) into this record: ${entity.mergedIds.join(", ")}.`,
    );
  }
  if (related.length > 0) {
    summary.push(
      `${related.length} evidenced relationship(s), weakest supporting grade ${weakestGrade(
        related.map((r) => r.relationship.grade),
      )}.`,
    );
  }
  if (entity.timeline.length > 0) {
    summary.push(
      `Observed between ${entity.firstSeen} and ${entity.lastSeen} across ${entity.timeline.length} timeline event(s).`,
    );
  }
  summary.push(
    risk.score !== null
      ? `Risk score ${risk.score} (${risk.tier}), supported at ${risk.grade}.`
      : risk.drivers.length > 0
        ? `No numeric risk score published; ${risk.drivers.length} qualitative risk driver(s) present.`
        : "No risk-bearing evidence reached this entity — risk is unknown, not zero.",
  );

  const gaps: string[] = [];
  if (entity.timeline.length === 0)
    gaps.push("No timeline events — no dated evidence for this entity.");
  if (related.length === 0) gaps.push("No relationships — no record names a counterparty.");
  if (!related.some((r) => r.relationship.type === "owns")) {
    gaps.push("Ownership not evidenced — no source names a registered owner.");
  }
  if (risk.drivers.length === 0)
    gaps.push("No sanctions or compliance screening evidence present.");
  if ((opts.investigations ?? []).length === 0) {
    gaps.push("No investigation references this entity yet.");
  }

  const timeline = opts.timelineLimit
    ? entity.timeline.slice(-opts.timelineLimit)
    : entity.timeline;

  return {
    entity,
    summary,
    timeline,
    related,
    evidence: entity.evidence,
    risk,
    investigations: opts.investigations ?? [],
    gaps,
  };
}

/** Overall grade of a profile — the weakest link in the reconstruction. */
export function profileGrade(profile: EieEntityProfile): EvidenceGrade {
  const grades = [profile.entity.grade, ...profile.related.map((r) => r.relationship.grade)];
  return grades.length > 1 ? weakestGrade(grades) : strongestGrade(grades);
}
