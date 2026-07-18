import { listSignals } from "@/services/signals.service";
import type { ListOptions, ListResult, Repository, Id } from "./types";

export interface SignalRow {
  id: string;
  domain: string;
  severity: string;
  confidence: string;
  entity_id?: string | null;
  observed_at: string;
  statement: string;
  [key: string]: unknown;
}

function unwrap<T>(env: unknown): T {
  const asEnv = env as { data?: T };
  return (asEnv?.data ?? (env as T));
}

export class SupabaseSignalRepository implements Repository<SignalRow> {
  async list(opts: ListOptions = {}): Promise<ListResult<SignalRow>> {
    const env = await listSignals({ data: { limit: opts.limit ?? 100, offset: opts.offset ?? 0 } });
    const rows = unwrap<SignalRow[]>(env) ?? [];
    return { rows, total: rows.length };
  }
  async getById(_id: Id): Promise<SignalRow | null> {
    return null;
  }
}

export const signalRepository = new SupabaseSignalRepository();
