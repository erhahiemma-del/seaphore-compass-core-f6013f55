/**
 * /api/entities  — endpoints from Backend & API Contract.
 * All calls require Supabase JWT (API-1) and go through RLS (API-2).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { envelope } from "./envelope";

const ListInput = z.object({
  type: z.string().optional(),
  confidence: z.string().optional(),
  riskMin: z.number().int().min(0).max(100).optional(),
  riskMax: z.number().int().min(0).max(100).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export const listEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = context.supabase.from("entities").select("*", { count: "exact" }).range(from, to);
    if (data.type) q = q.eq("type", data.type as never);
    if (data.confidence) q = q.eq("confidence", data.confidence as never);
    if (data.riskMin !== undefined) q = q.gte("risk_score", data.riskMin);
    if (data.riskMax !== undefined) q = q.lte("risk_score", data.riskMax);
    const { data: rows, error, count } = await q;
    if (error) throw error;
    return envelope(rows ?? [], {
      pagination: { page: data.page, pageSize: data.pageSize, total: count ?? 0 },
    });
  });

export const getEntity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: entity, error } = await context.supabase
      .from("entities")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!entity) return envelope(null);
    const { data: rels } = await context.supabase
      .from("relationships")
      .select("*")
      .or(`source_id.eq.${data.id},target_id.eq.${data.id}`);
    return envelope({ ...entity, relationships: rels ?? [] });
  });

export const listEntityRelationships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        type: z.string().optional(),
        confidence: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("relationships")
      .select("*")
      .or(`source_id.eq.${data.id},target_id.eq.${data.id}`);
    if (data.type) q = q.eq("type", data.type);
    if (data.confidence) q = q.eq("confidence", data.confidence as never);
    const { data: rows, error } = await q;
    if (error) throw error;
    return envelope(rows ?? []);
  });

export const searchEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const term = `%${data.q}%`;
    const { data: rows, error } = await context.supabase
      .from("entities")
      .select("*")
      .or(`name.ilike.${term},aliases.cs.{${data.q}}`)
      .limit(25);
    if (error) throw error;
    return envelope(rows ?? []);
  });
