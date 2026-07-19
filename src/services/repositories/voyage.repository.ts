import { listVoyages, getVoyage } from "@/services/voyages.service";
import type { ListOptions, ListResult, Repository, Id } from "./types";

export interface VoyageRow {
  id: string;
  vessel_id: string | null;
  origin_port_id?: string | null;
  destination_port_id?: string | null;
  status?: string | null;
  confidence?: string | null;
  [key: string]: unknown;
}

function unwrap<T>(env: unknown): T {
  const asEnv = env as { data?: T };
  return asEnv?.data ?? (env as T);
}

export class SupabaseVoyageRepository implements Repository<VoyageRow> {
  async list(opts: ListOptions = {}): Promise<ListResult<VoyageRow>> {
    const env = await listVoyages({ data: { limit: opts.limit ?? 50, offset: opts.offset ?? 0 } });
    const rows = unwrap<VoyageRow[]>(env) ?? [];
    return { rows, total: rows.length };
  }
  async getById(id: Id): Promise<VoyageRow | null> {
    const env = await getVoyage({ data: { id } });
    return unwrap<VoyageRow | null>(env) ?? null;
  }
}

export const voyageRepository = new SupabaseVoyageRepository();
