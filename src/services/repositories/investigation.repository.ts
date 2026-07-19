import { listInvestigations, getInvestigation } from "@/services/investigations.service";
import type { InvestigationSummary } from "@/types/investigation.types";
import type { ListOptions, ListResult, Repository, Id } from "./types";

export type InvestigationRow = InvestigationSummary & Record<string, unknown>;

function unwrap<T>(env: unknown): T {
  const asEnv = env as { data?: T };
  return asEnv?.data ?? (env as T);
}

export class SupabaseInvestigationRepository implements Repository<InvestigationRow> {
  async list(opts: ListOptions = {}): Promise<ListResult<InvestigationRow>> {
    const env = await listInvestigations({
      data: { limit: opts.limit ?? 50, offset: opts.offset ?? 0 },
    });
    const rows = unwrap<InvestigationRow[]>(env) ?? [];
    return { rows, total: rows.length };
  }
  async getById(id: Id): Promise<InvestigationRow | null> {
    const env = await getInvestigation({ data: { id } });
    return unwrap<InvestigationRow | null>(env) ?? null;
  }
}

export const investigationRepository = new SupabaseInvestigationRepository();
