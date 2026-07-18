import { listVoyages, getVoyage } from "@/services/voyages.service";
import type { ListOptions, ListResult, Repository, Id } from "./types";

export interface VoyageRow {
  id: string;
  vessel_id: string;
  origin_port_id?: string | null;
  destination_port_id?: string | null;
  status?: string | null;
  confidence?: string | null;
  [key: string]: unknown;
}

export class SupabaseVoyageRepository implements Repository<VoyageRow> {
  async list(opts: ListOptions = {}): Promise<ListResult<VoyageRow>> {
    const rows = (await listVoyages({ data: { limit: opts.limit ?? 50, offset: opts.offset ?? 0 } })) as VoyageRow[];
    return { rows, total: rows.length };
  }
  async getById(id: Id): Promise<VoyageRow | null> {
    return (await getVoyage({ data: { id } })) as VoyageRow | null;
  }
}

export const voyageRepository = new SupabaseVoyageRepository();
