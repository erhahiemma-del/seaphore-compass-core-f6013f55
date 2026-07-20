/**
 * Sprint 7 · Layer 1 — Normalization.
 *
 * Standardises formats, units and timestamps into `NormalizedEvidence`.
 * All transforms are pure & non-mutating. `raw` preserves the original.
 */
import { RawEvidenceSchema, type RawEvidence } from "./schemas";
import type { NormalizedEvidence } from "./types";
import { claimHash } from "./hash";

/** ISO-8601 UTC. Falls back to input if unparseable so the audit trail keeps the raw string. */
function toIsoUtc(input: string): string {
  const t = Date.parse(input);
  if (Number.isNaN(t)) return input;
  return new Date(t).toISOString();
}

/** Trim + collapse whitespace + lower-case for string comparison keys. */
function canonicalString(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Simple currency-unit normaliser — keeps the number, records the unit. */
function canonicalUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const u = unit.trim().toUpperCase();
  return u.length ? u : null;
}

function canonicalValue(value: RawEvidence["value"]): NormalizedEvidence["value"] {
  if (typeof value === "string") return canonicalString(value);
  return value;
}

/** Validate + normalise one raw evidence atom. Returns a frozen record. */
export function normalizeOne(input: unknown): NormalizedEvidence {
  const parsed = RawEvidenceSchema.parse(input);
  const unit = canonicalUnit(parsed.unit ?? null);
  const value = canonicalValue(parsed.value);
  const collectedAt = toIsoUtc(parsed.collectedAt);
  const contentHash = claimHash({
    sourceSystem: parsed.sourceSystem,
    attribute: parsed.attribute,
    value,
    unit,
  });

  const normalized: NormalizedEvidence = {
    id: parsed.id,
    agent: parsed.agent,
    sourceSystem: parsed.sourceSystem,
    entityIds: Object.freeze([...parsed.entityIds]),
    attribute: parsed.attribute.trim().toLowerCase(),
    value,
    unit,
    grade: parsed.grade,
    collectedAt,
    contentHash,
    raw: input,
  };
  return Object.freeze(normalized);
}

export function normalizeMany(inputs: readonly unknown[]): readonly NormalizedEvidence[] {
  return Object.freeze(inputs.map(normalizeOne));
}
