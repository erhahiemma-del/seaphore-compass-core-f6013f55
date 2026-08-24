import { listVoyages, getVoyage } from "@/services/voyages.service";
import type { JoinedPortRow } from "@/services/geospatial/port-link";
import type { ListOptions, ListResult, Repository, Id } from "./types";

/*
 * The UUID → UN/LOCODE translation lives in the geospatial domain, in
 * `port-link.ts`, and is re-exported here for callers working at this
 * boundary. The dependency points that way on purpose: the domain must
 * not import the repository, and `port-link.ts` has no server
 * dependencies to drag into the map bundle.
 */
export { toPortLink, PORT_LINK_NOTES } from "@/services/geospatial/port-link";
export type { JoinedPortRow, PortLink, PortLinkState } from "@/services/geospatial/port-link";

export interface VoyageRow {
  id: string;
  vessel_id: string | null;
  /** UUID foreign key. Never a location code — see `toPortLink`. */
  origin_port_id?: string | null;
  destination_port_id?: string | null;
  /** Embedded by `VOYAGE_SELECT`. Null when the row has no such port. */
  origin_port?: JoinedPortRow | null;
  destination_port?: JoinedPortRow | null;
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
