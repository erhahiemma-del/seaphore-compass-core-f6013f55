import type { Entity } from "@/types/entity.types";
import { listEntities, getEntity, searchEntities } from "@/services/entities.service";
import type { ListOptions, ListResult, Repository, Id } from "./types";

/**
 * EntityRepository — read side backed by the Entities server-function service.
 * Writes go through dedicated intake server functions; see `entities.service`.
 */
export class SupabaseEntityRepository implements Repository<Entity> {
  async list(opts: ListOptions = {}): Promise<ListResult<Entity>> {
    if (opts.q) {
      const rows = (await searchEntities({ data: { q: opts.q, limit: opts.limit ?? 50 } })) as Entity[];
      return { rows, total: rows.length };
    }
    const rows = (await listEntities({ data: { limit: opts.limit ?? 50, offset: opts.offset ?? 0 } })) as Entity[];
    return { rows, total: rows.length };
  }

  async getById(id: Id): Promise<Entity | null> {
    return (await getEntity({ data: { id } })) as Entity | null;
  }
}

export const entityRepository = new SupabaseEntityRepository();
