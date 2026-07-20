/**
 * Sprint 7 · Zod schemas — strict validation at fusion boundaries.
 * Fail-fast if an agent output drifts from its declared contract.
 */
import { z } from "zod";
import { EVIDENCE_GRADES } from "./types";

export const EvidenceGradeSchema = z.enum(EVIDENCE_GRADES);

/**
 * Raw evidence atom accepted by the fusion pipeline. Adapters convert each
 * agent output into an array of these before normalisation runs.
 */
export const RawEvidenceSchema = z.object({
  id: z.string().min(1),
  agent: z.string().min(1),
  sourceSystem: z.string().min(1),
  entityIds: z.array(z.string().min(1)).min(1),
  attribute: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  unit: z.string().nullable().optional(),
  grade: EvidenceGradeSchema,
  collectedAt: z.string().min(1),
});
export type RawEvidence = z.infer<typeof RawEvidenceSchema>;

export const NormalizedEvidenceSchema = RawEvidenceSchema.extend({
  unit: z.string().nullable(),
  contentHash: z.string().min(1),
  raw: z.unknown(),
});

export const ScoredEvidenceSchema = NormalizedEvidenceSchema.extend({
  authority: z.number().min(0).max(1),
  recency: z.number().min(0).max(1),
  gradeWeight: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  mergedFrom: z.array(z.string()),
  conflictsWith: z.array(z.string()),
});

export const FusedEvidenceBundleSchema = z.object({
  ranked: z.array(ScoredEvidenceSchema),
  conflicts: z.array(
    z.object({
      attribute: z.string(),
      entityId: z.string(),
      a: ScoredEvidenceSchema,
      b: ScoredEvidenceSchema,
      reason: z.string(),
    }),
  ),
  metrics: z.object({
    inputCount: z.number().int().nonnegative(),
    normalizedCount: z.number().int().nonnegative(),
    dedupedCount: z.number().int().nonnegative(),
    duplicateCount: z.number().int().nonnegative(),
    conflictCount: z.number().int().nonnegative(),
    sourcesQueried: z.number().int().nonnegative(),
    agentsReporting: z.number().int().nonnegative(),
    generatedAt: z.string(),
    durationMs: z.number().nonnegative(),
  }),
});
