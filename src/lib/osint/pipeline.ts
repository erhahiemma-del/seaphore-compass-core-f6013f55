/**
 * Normalization pipeline.
 *
 * Validates the output of a connector's `normalize()` against the
 * SeaphoreRecord schema. Invalid records are rejected with a structured
 * error and never reach the database.
 */
import type { SeaphoreRecord } from "./types";

const ENTITY_TYPES = new Set([
  "VESSEL",
  "VOYAGE",
  "AGENT",
  "CARGO",
  "OWNER",
  "PORT",
  "SANCTION",
  "WEATHER",
  "ALERT",
]);

const CONFIDENCE_LEVELS = new Set([
  "OBSERVED",
  "DECLARED",
  "INFERRED",
  "CORROBORATED",
  "VERIFIED",
  "AUDITED",
]);

export interface ValidationOk {
  ok: true;
  record: SeaphoreRecord;
}
export interface ValidationErr {
  ok: false;
  error: string;
}

export function validateRecord(record: SeaphoreRecord): ValidationOk | ValidationErr {
  if (!record || typeof record !== "object") return { ok: false, error: "record is not an object" };
  if (!record.sourceId) return { ok: false, error: "missing sourceId" };
  if (!record.sourceRef) return { ok: false, error: "missing sourceRef" };
  if (!ENTITY_TYPES.has(record.entityType))
    return { ok: false, error: `invalid entityType: ${record.entityType}` };
  if (!record.entityId) return { ok: false, error: "missing entityId" };
  if (typeof record.confidence !== "number" || record.confidence < 0 || record.confidence > 1)
    return { ok: false, error: "confidence must be 0..1" };
  if (!CONFIDENCE_LEVELS.has(record.confidenceLevel))
    return { ok: false, error: `invalid confidenceLevel: ${record.confidenceLevel}` };
  if (!record.fetchedAt) return { ok: false, error: "missing fetchedAt" };
  if (!record.validFrom) return { ok: false, error: "missing validFrom" };
  if (!Array.isArray(record.tags)) return { ok: false, error: "tags must be an array" };
  return { ok: true, record };
}
