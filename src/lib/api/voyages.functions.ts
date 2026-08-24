import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { envelope } from "./envelope";

/**
 * Voyage columns, plus the two port rows the endpoints point at.
 *
 * `origin_port_id` and `destination_port_id` are UUID foreign keys to
 * `ports.id`. A UUID is not a place — it cannot be resolved to a
 * position by anything downstream — so the join is done here, at the
 * database boundary, and the voyage arrives in the domain carrying its
 * ports' UN/LOCODEs rather than their primary keys.
 *
 * Embedded through the named foreign keys because `voyages` references
 * `ports` twice; without the constraint names PostgREST cannot tell
 * which relationship each embed means.
 *
 * Additive: every previously selected column is still returned, so
 * existing readers are unaffected.
 */
const VOYAGE_SELECT = `
  *,
  origin_port:ports!voyages_origin_port_id_fkey (id, unlocode, country),
  destination_port:ports!voyages_destination_port_id_fkey (id, unlocode, country)
`;

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
      .select(VOYAGE_SELECT, { count: "exact" })
      .range(from, to);
    if (data.vesselId) q = q.eq("vessel_id", data.vesselId);
    if (data.status) q = q.eq("status", data.status as never);
    if (data.portId)
      q = q.or(`origin_port_id.eq.${data.portId},destination_port_id.eq.${data.portId}`);
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
      .select(VOYAGE_SELECT)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    const [{ data: manifests }, { data: documents }] = await Promise.all([
      context.supabase.from("manifests").select("*").eq("voyage_id", data.id),
      context.supabase.from("documents").select("*").eq("voyage_id", data.id),
    ]);
    const manifestIds = (manifests ?? []).map((m) => m.id as string);
    const { data: cargo } = manifestIds.length
      ? await context.supabase.from("cargo_items").select("*").in("manifest_id", manifestIds)
      : { data: [] };
    return envelope({ ...voyage, manifests, cargo: cargo ?? [], documents });
  });
