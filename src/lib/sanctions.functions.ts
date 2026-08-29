/**
 * Sanctions screening — server-function gateway.
 *
 * Thin wrappers only (per `tanstack-serverfn-splitting`): every runtime
 * path lives in `@/lib/server/opensanctions.server`, which holds the
 * credential and is blocked from client bundles.
 *
 * This is the ONE canonical screening service. The vessel drawer, search,
 * the Copilot and voice all call these functions — there is no second
 * screening engine and no second persistence path.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SanctionsMatchDecision, SanctionsScreeningRecord } from "@/lib/sanctions/match-state";

const roleSchema = z.enum(["vessel", "owner", "operator", "manager", "agent"]);

const screenInput = z.object({
  name: z.string().min(2).max(200),
  imo: z.string().max(20).optional(),
  role: roleSchema.default("vessel"),
  schema: z.enum(["Vessel", "Company", "Person", "LegalEntity"]).optional(),
  country: z.string().max(10).optional(),
  dataset: z.string().max(60).optional(),
});

const decisionInput = z.object({
  screeningId: z.string().uuid(),
  candidateId: z.string().min(1).max(200),
  candidateCaption: z.string().max(300).optional(),
  decision: z.enum(["CONFIRMED", "DISMISSED"]),
  reason: z.string().min(3).max(300),
  note: z.string().max(1000).optional(),
  evidenceRef: z.string().max(200).optional(),
});

/** Untyped view of the caller's client: the screening tables are new. */
type Db = SupabaseClient<never, never, never>;

/**
 * Screen a subject and persist the result.
 *
 * The row is written whatever the outcome — including provider failure —
 * because "we tried and the provider was down" is itself an operational
 * fact an officer must be able to see later.
 */
export const screenSubjectForSanctions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => screenInput.parse(data))
  .handler(async ({ data, context }): Promise<SanctionsScreeningRecord> => {
    const { screenSubject } = await import("@/lib/server/opensanctions.server");
    const { toRecord, insertScreening, writeScreeningAudit } =
      await import("@/lib/server/sanctions-store.server");

    const outcome = await screenSubject({
      name: data.name,
      imo: data.imo ?? null,
      schema: data.schema ?? (data.role === "vessel" ? "Vessel" : "Company"),
      country: data.country ?? null,
      dataset: data.dataset,
    });

    const db = context.supabase as unknown as Db;
    const row = await insertScreening(db, {
      subjectName: data.name,
      subjectImo: data.imo ?? null,
      entityKind: data.role === "vessel" ? "vessel" : "company",
      entityRole: data.role,
      requestedBy: context.userId,
      outcome,
    });

    await writeScreeningAudit(db, context.userId, row, outcome);
    return toRecord(row, []);
  });

/** Every screening ever recorded for a subject, newest first. */
export const listSanctionsScreenings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ imo: z.string().max(20).optional(), name: z.string().max(200).optional() })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<SanctionsScreeningRecord[]> => {
    const { loadScreenings } = await import("@/lib/server/sanctions-store.server");
    return loadScreenings(context.supabase as unknown as Db, data);
  });

/** Officer review outcome. The only origin of CONFIRMED_MATCH. */
export const recordSanctionsMatchDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => decisionInput.parse(data))
  .handler(async ({ data, context }): Promise<SanctionsMatchDecision> => {
    const { insertDecision } = await import("@/lib/server/sanctions-store.server");
    return insertDecision(context.supabase as unknown as Db, context.userId, data);
  });

/** Provider record behind one candidate, fetched only when asked for. */
export const getSanctionsEntityDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { entityDetail } = await import("@/lib/server/opensanctions.server");
    return entityDetail(data.id);
  });

/** Whether screening is available at all, without exposing the credential. */
export const getSanctionsProviderStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { credentialStatus } = await import("@/lib/server/opensanctions.server");
  return credentialStatus();
});
