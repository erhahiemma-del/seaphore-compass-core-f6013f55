import { listSignals } from "@/services/signals.service";
import type { ListOptions, ListResult, Repository, Id } from "./types";

export interface SignalRow {
  id: string;
  kind: string;
  severity: "high" | "medium" | "low" | "info" | string;
  confidence: string;
  entity_id?: string | null;
  observed_at: string;
  summary: string;
  [key: string]: unknown;
}

export class SupabaseSignalRepository implements Repository<SignalRow> {
  async list(opts: ListOptions = {}): Promise<ListResult<SignalRow>> {
    const rows = (await listSignals({ data: { limit: opts.limit ?? 100, offset: opts.offset ?? 0 } })) as SignalRow[];
    return { rows, total: rows.length };
  }
  async getById(_id: Id): Promise<SignalRow | null> {
    // Not exposed today; Signals are surfaced through the list feed and detail
    // panels. Add a getSignal server function when a dedicated signal detail
    // route ships.
    return null;
  }
}

export const signalRepository = new SupabaseSignalRepository();
