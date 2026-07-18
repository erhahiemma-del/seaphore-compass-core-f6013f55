import { listInvestigations, getInvestigation } from "@/services/investigations.service";
import type { Investigation } from "@/types/investigation.types";
import type { ListOptions, ListResult, Repository, Id } from "./types";

export class SupabaseInvestigationRepository implements Repository<Investigation> {
  async list(opts: ListOptions = {}): Promise<ListResult<Investigation>> {
    const rows = (await listInvestigations({ data: { limit: opts.limit ?? 50, offset: opts.offset ?? 0 } })) as Investigation[];
    return { rows, total: rows.length };
  }
  async getById(id: Id): Promise<Investigation | null> {
    return (await getInvestigation({ data: { id } })) as Investigation | null;
  }
}

export const investigationRepository = new SupabaseInvestigationRepository();
