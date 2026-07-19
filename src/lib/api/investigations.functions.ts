import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { envelope } from "./envelope";

const ListInput = z.object({
  status: z.string().optional(),
  officerId: z.string().uuid().optional(),
  riskLevel: z.string().optional(),
});

export const listInvestigations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("investigations").select("*");
    if (data.status) q = q.eq("status", data.status as never);
    if (data.officerId) q = q.eq("lead_officer_id", data.officerId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return envelope(rows ?? []);
  });

export const openInvestigation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        case_number: z.string().min(1),
        scenario: z.string().min(1),
        target_voyage_id: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("investigations")
      .insert({
        case_number: data.case_number,
        scenario: data.scenario,
        target_voyage_id: data.target_voyage_id ?? null,
        lead_officer_id: context.userId,
        status: "open",
        opened_at: new Date().toISOString(),
      } as never)
      .select("*")
      .single();
    if (error) throw error;
    return envelope(row);
  });

export const getInvestigation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: inv }, { data: ev }, { data: audit }, { data: decisions }] = await Promise.all([
      context.supabase.from("investigations").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("evidence").select("*").eq("investigation_id", data.id),
      context.supabase.from("audit_log").select("*").eq("entity_id", data.id),
      context.supabase.from("decisions").select("*").eq("investigation_id", data.id),
    ]);
    return envelope({ ...inv, evidence: ev, audit_trail: audit, decisions });
  });

export const uploadEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        evidence_type: z.string().min(1),
        source: z.string().min(1),
        storage_path: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("evidence")
      .insert({
        investigation_id: data.id,
        evidence_type: data.evidence_type,
        source: data.source,
        storage_path: data.storage_path,
        collected_by: context.userId,
        collected_at: new Date().toISOString(),
      } as never)
      .select("*")
      .single();
    if (error) throw error;
    return envelope(row);
  });

export const submitDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.string().min(1),
        reason: z.string().min(1),
        notes: z.string().optional(),
        signature_data: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("decisions")
      .insert({
        investigation_id: data.id,
        decision: data.decision,
        reason: data.reason,
        notes: data.notes ?? null,
        signature_data: data.signature_data,
        officer_id: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return envelope(row);
  });
