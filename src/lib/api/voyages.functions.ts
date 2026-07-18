import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { envelope } from "./envelope";

const ListInput = z.object({
  vesselId: z.string().uuid().optional(),
  status: z.string().optional(),
  portId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export const listVoyages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = context.supabase
      .from("voyages")
      .select("*", { count: "exact" })
      .range(from, to);
    if (data.vesselId) q = q.eq("vessel_id", data.vesselId);
    if (data.status) q = q.eq("status", data.status as never);
    if (data.portId)
      q = q.or(
        `origin_port_id.eq.${data.portId},destination_port_id.eq.${data.portId}`,
      );
    if (data.from) q = q.gte("etd", data.from);
    if (data.to) q = q.lte("eta", data.to);
    const { data: rows, error, count } = await q;
    if (error) throw error;
    return envelope(rows ?? [], {
      pagination: { page: data.page, pageSize: data.pageSize, total: count ?? 0 },
    });
  });

export const getVoyage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: voyage, error } = await context.supabase
      .from("voyages")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    const [{ data: manifests }, { data: documents }] = await Promise.all([
      context.supabase.from("manifests").select("*").eq("voyage_id", data.id),
      context.supabase.from("documents").select("*").eq("voyage_id", data.id),
    ]);
    const manifestIds = (manifests ?? []).map((m) => m.id as string);
    let cargo: Array<Record<string, unknown>> = [];
    if (manifestIds.length) {
      const { data: c } = await context.supabase
        .from("cargo_items")
        .select("*")
        .in("manifest_id", manifestIds);
      cargo = c ?? [];
    }
    return envelope({ ...voyage, manifests, cargo, documents });
  });
