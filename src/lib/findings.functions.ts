/**
 * Intelligence findings — server-function gateway.
 *
 * Thin wrappers only: every runtime path lives in
 * `@/lib/server/*.server`, which is blocked from client bundles. No
 * provider is called from here — findings are persisted from records the
 * provider domains already hold, and decisions are the officer's.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { FindingLink } from "@/lib/server/findings-store.server";
import type { PersistedFinding } from "@/services/findings/record";

type Db = SupabaseClient<never, never, never>;

const linkInput = z.object({
  findingId: z.string().min(1).max(200),
  findingType: z.string().min(1).max(60),
  subjectType: z.string().min(1).max(30),
  subjectId: z.string().min(1).max(120),
  subjectLabel: z.string().max(200).optional(),
  source: z.string().min(1).max(80),
  sourceRecordId: z.string().max(120).optional(),
  summary: z.string().max(500).optional(),
  evidenceRef: z.string().max(200).optional(),
  investigationId: z.string().uuid().optional(),
});

const statusEnum = z.enum([
  "NEW",
  "UNDER_REVIEW",
  "CONFIRMED",
  "DISMISSED",
  "INVESTIGATION_OPEN",
  "RESOLVED",
]);

/**
 * Persist findings from the records the provider domains already hold.
 *
 * Idempotent: a screening that already produced a finding is left alone,
 * including its status and the officer decisions on it.
 */
export const syncIntelligenceFindings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { syncFindingsFromScreenings } = await import("@/lib/server/finding-sync.server");
    return syncFindingsFromScreenings(context.supabase as unknown as Db, context.userId);
  });

/** Every persisted finding an officer may see, newest first. */
export const listIntelligenceFindings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        subjectId: z.string().max(120).optional(),
        status: z.array(statusEnum).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<PersistedFinding[]> => {
    const { loadFindings } = await import("@/lib/server/finding-records.server");
    return loadFindings(context.supabase as unknown as Db, data);
  });

/** One finding with its full decision history. */
export const getIntelligenceFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ findingId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<PersistedFinding | null> => {
    const { loadFinding } = await import("@/lib/server/finding-records.server");
    return loadFinding(context.supabase as unknown as Db, data.findingId);
  });

/**
 * Record an officer's decision. Confirmation and dismissal are the
 * officer's alone: nothing in the system may reach this without them.
 */
export const decideIntelligenceFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        findingId: z.string().uuid(),
        decision: z.enum(["CONFIRM", "DISMISS", "OPEN_INVESTIGATION", "NOTE", "RESOLVE"]),
        reason: z.string().max(200).optional(),
        note: z.string().max(2000).optional(),
        evidenceRef: z.string().max(200).optional(),
        investigationId: z.string().uuid().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<PersistedFinding> => {
    const { decideFinding } = await import("@/lib/server/finding-records.server");
    return decideFinding(context.supabase as unknown as Db, context.userId, data);
  });

/** The audit trail recorded against a finding or a case. */
export const listFindingAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        findingId: z.string().uuid().optional(),
        investigationId: z.string().uuid().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { loadFindingAudit } = await import("@/lib/server/finding-records.server");
    return loadFindingAudit(context.supabase as unknown as Db, data);
  });


/**
 * Open a case for a finding, or attach the finding to an existing one.
 * The subject travels as typed columns — never as free text, and never as
 * an invented voyage id.
 */
export const openInvestigationForFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => linkInput.parse(data))
  .handler(async ({ data, context }) => {
    const { linkFindingToInvestigation } = await import("@/lib/server/findings-store.server");
    return linkFindingToInvestigation(context.supabase as unknown as Db, context.userId, data);
  });

/** Every case a subject's findings are attached to, newest first. */
export const listFindingLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        subjectId: z.string().max(120).optional(),
        investigationId: z.string().uuid().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<FindingLink[]> => {
    const { loadFindingLinks } = await import("@/lib/server/findings-store.server");
    return loadFindingLinks(context.supabase as unknown as Db, data);
  });
