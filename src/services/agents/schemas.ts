/**
 * Sprint 6 · Output schemas for each specialist agent.
 * These are the contract the Evidence Fusion Engine (Sprint 7) will consume.
 * Keep shapes narrow, JSON-serialisable, and grade-tagged.
 */
import { z } from "zod";

export const EvidenceGradeSchema = z.enum([
  "verified",
  "corroborated",
  "observed",
  "reported",
  "inferred",
  "unconfirmed",
]);

const CitationSchema = z.object({
  source: z.string(),
  ref: z.string(),
  observedAt: z.string(),
});

// ── Ownership ──────────────────────────────────────────────────────────────
export const OwnershipOutputSchema = z.object({
  subjectEntityId: z.string(),
  legalOwner: z.object({ name: z.string(), jurisdiction: z.string() }).nullable(),
  beneficialOwners: z.array(
    z.object({
      name: z.string(),
      sharePct: z.number(),
      grade: EvidenceGradeSchema,
      sanctions: z.array(z.string()),
    }),
  ),
  chain: z.array(z.object({ from: z.string(), to: z.string(), relation: z.string() })),
  citations: z.array(CitationSchema),
});
export type OwnershipOutput = z.infer<typeof OwnershipOutputSchema>;

// ── Revenue ────────────────────────────────────────────────────────────────
export const RevenueOutputSchema = z.object({
  subjectEntityId: z.string(),
  currency: z.string(),
  declaredRevenue: z.number(),
  observedRevenue: z.number(),
  gap: z.number(),
  anomalies: z.array(
    z.object({ id: z.string(), label: z.string(), delta: z.number(), grade: EvidenceGradeSchema }),
  ),
  citations: z.array(CitationSchema),
});
export type RevenueOutput = z.infer<typeof RevenueOutputSchema>;

// ── Compliance ─────────────────────────────────────────────────────────────
export const ComplianceOutputSchema = z.object({
  subjectEntityId: z.string(),
  status: z.enum(["compliant", "watch", "breach", "unknown"]),
  certificates: z.array(
    z.object({
      code: z.string(),
      issuer: z.string(),
      validUntil: z.string().nullable(),
      grade: EvidenceGradeSchema,
    }),
  ),
  portStateFindings: z.array(
    z.object({ port: z.string(), finding: z.string(), severity: z.enum(["low", "med", "high"]) }),
  ),
  citations: z.array(CitationSchema),
});
export type ComplianceOutput = z.infer<typeof ComplianceOutputSchema>;

// ── Manifest ───────────────────────────────────────────────────────────────
export const ManifestOutputSchema = z.object({
  subjectEntityId: z.string(),
  manifestId: z.string(),
  declaredContainers: z.number(),
  observedContainers: z.number(),
  mismatches: z.array(
    z.object({
      containerNo: z.string(),
      declared: z.string(),
      observed: z.string(),
      grade: EvidenceGradeSchema,
    }),
  ),
  citations: z.array(CitationSchema),
});
export type ManifestOutput = z.infer<typeof ManifestOutputSchema>;

// ── Evidence ───────────────────────────────────────────────────────────────
export const EvidenceOutputSchema = z.object({
  subjectEntityId: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      sourceSystem: z.string(),
      grade: EvidenceGradeSchema,
      contentHash: z.string(),
      collectedAt: z.string(),
    }),
  ),
  citations: z.array(CitationSchema),
});
export type EvidenceOutput = z.infer<typeof EvidenceOutputSchema>;

// ── Forecast ───────────────────────────────────────────────────────────────
export const ForecastOutputSchema = z.object({
  subjectEntityId: z.string(),
  patterns: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      matchScore: z.number(),
      grade: EvidenceGradeSchema,
      windowDays: z.number(),
    }),
  ),
  citations: z.array(CitationSchema),
});
export type ForecastOutput = z.infer<typeof ForecastOutputSchema>;
