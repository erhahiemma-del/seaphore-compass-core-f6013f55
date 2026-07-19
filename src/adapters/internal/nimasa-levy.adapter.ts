/**
 * NIMASA internal levy system. Status: ACTIVE.
 * Levy records are already stored in Seaphore's own database (public.*),
 * so this adapter is a thin identity wrapper for status/audit purposes.
 */
import { BaseAdapter, type HealthReport } from "../base-adapter";
import type { SourcedResult } from "../status";

export interface LevyRecord { assessmentId: string; vesselImo: string; grossFreightUsd: number; leviedAmountUsd: number; receiptRef?: string; observedAt: string }

export class NimasaLevyAdapter extends BaseAdapter {
  constructor() { super("nimasa_levy"); }
  attach<T extends LevyRecord | LevyRecord[]>(records: T): SourcedResult<T> {
    this.assertUsable();
    const observedAt = Array.isArray(records)
      ? records[0]?.observedAt ?? new Date().toISOString()
      : records.observedAt;
    return this.envelope<T>(records, observedAt);
  }
  async healthCheck(): Promise<HealthReport> {
    return { state: "OK", checkedAt: new Date().toISOString() };
  }
}
export const nimasaLevy = new NimasaLevyAdapter();
