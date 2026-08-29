/**
 * Intelligence findings — server-function gateway.
 *
 * Thin wrappers only: every runtime path lives in
 * `@/lib/server/findings-store.server`, which is blocked from client
 * bundles. No provider is called from here — findings are projected from
 * records the provider domains already persisted.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { FindingLink } from "@/lib/server/findings-store.server";

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
