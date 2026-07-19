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
      const env = await searchEntities({ data: { q: opts.q } });
      const rows = (env.data ?? []) as EntityRow[];
      return { rows, total: rows.length };
    }
    const pageSize = opts.limit ?? 50;
    const page = opts.offset ? Math.floor(opts.offset / pageSize) + 1 : 1;
    const env = await listEntities({ data: { page, pageSize } });
    const rows = (env.data ?? []) as EntityRow[];
    return { rows, total: env.pagination?.total ?? rows.length };
  }

  async getById(id: Id): Promise<EntityRow | null> {
    const env = await getEntity({ data: { id } });
    return (env.data ?? null) as EntityRow | null;
  }
}

export const entityRepository = new SupabaseEntityRepository();
