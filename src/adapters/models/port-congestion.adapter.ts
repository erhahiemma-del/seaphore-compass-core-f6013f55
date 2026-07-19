/**
 * Port congestion — INFERRED. Computed from vessel queue + historical
 * patterns already stored in Seaphore. Every returned figure carries the
 * INFERRED chip; the adapter never claims OBSERVED data.
 */
import { BaseAdapter } from "../base-adapter";
import type { SourcedResult } from "../status";

export interface CongestionScore {
  portId: string;
  queueLength: number;
  avgWaitHours: number;
  score: number; // 0-100
  computedAt: string;
  method: string;
}

export class PortCongestionModel extends BaseAdapter {
  constructor() { super("port_congestion"); }
  async score(portId: string, queueLength: number, avgWaitHours: number): Promise<SourcedResult<CongestionScore>> {
    this.assertUsable();
    const raw = queueLength * 6 + avgWaitHours * 2;
    const score = Math.max(0, Math.min(100, raw));
    return this.envelope<CongestionScore>(
      {
        portId,
        queueLength,
        avgWaitHours,
        score,
        computedAt: new Date().toISOString(),
        method: "queueLength*6 + avgWaitHours*2 (clamped 0-100)",
      },
      new Date().toISOString(),
      { inferred: true },
    );
  }
}
export const portCongestion = new PortCongestionModel();
