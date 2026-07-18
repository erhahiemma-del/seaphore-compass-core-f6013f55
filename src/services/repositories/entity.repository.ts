import type { EntityRef } from "@/types/entity.types";
import { listEntities, getEntity, searchEntities } from "@/services/entities.service";
import type { ListOptions, ListResult, Repository, Id } from "./types";

export type EntityRow = EntityRef & Record<string, unknown>;

/**
 * EntityRepository — read side backed by the Entities server-function service.
 * Writes go through dedicated intake server functions; see `entities.service`.
 */
export class SupabaseEntityRepository implements Repository<EntityRow> {
  async list(opts: ListOptions = {}): Promise<ListResult<EntityRow>> {
    if (opts.q) {
      const env = await searchEntities({ data: { q: opts.q, limit: opts.limit ?? 50 } });
      const rows = ((env as { data?: EntityRow[] }).data ?? (env as unknown as EntityRow[])) as EntityRow[];
      return { rows, total: rows.length };
    }
    const env = await listEntities({ data: { limit: opts.limit ?? 50, offset: opts.offset ?? 0 } });
    const rows = ((env as { data?: EntityRow[] }).data ?? (env as unknown as EntityRow[])) as EntityRow[];
    return { rows, total: rows.length };
  }

  async getById(id: Id): Promise<EntityRow | null> {
    const env = await getEntity({ data: { id } });
    return ((env as { data?: EntityRow | null }).data ?? (env as unknown as EntityRow | null)) ?? null;
  }
}

export const entityRepository = new SupabaseEntityRepository();
