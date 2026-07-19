import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { envelope } from "./envelope";

const ListInput = z.object({
  status: z.string().optional(),
  voyageId: z.string().uuid().optional(),
  duplicate: z.boolean().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export const listManifests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = context.supabase.from("manifests").select("*", { count: "exact" }).range(from, to);
    if (data.voyageId) q = q.eq("voyage_id", data.voyageId);
    if (data.from) q = q.gte("submitted_at", data.from);
    if (data.to) q = q.lte("submitted_at", data.to);
    const { data: rows, error, count } = await q;
    if (error) throw error;
    return envelope(rows ?? [], {
      pagination: { page: data.page, pageSize: data.pageSize, total: count ?? 0 },
    });
  });

export const getManifest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: manifest, error } = await context.supabase
      .from("manifests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    const { data: cargo } = await context.supabase
      .from("cargo_items")
      .select("*")
      .eq("manifest_id", data.id);
    return envelope({ ...manifest, cargo_items: cargo ?? [] });
  });
