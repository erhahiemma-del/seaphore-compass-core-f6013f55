/**
 * INT-01A.3 — IPEF · Registry
 *
 * Process-wide rolling store of IPEF records.
 * One IpefRecord per pipeline execution (per OIE run).
 * Rolling window of 500 records — same discipline as the MIC CapturingSink.
 *
 * The registry is the single source of truth for the IPEF API endpoints
 * and the MIO Intelligence Provenance dashboard tab.
 */
import type { IpefRecord } from "./types";

class IpefRegistry {
  private readonly _records: IpefRecord[] = [];
  private readonly _maxCapture: number;

  constructor(maxCapture = 500) {
    this._maxCapture = maxCapture;
  }

  register(record: IpefRecord): void {
    if (this._records.length >= this._maxCapture) {
      this._records.shift(); // rolling window
    }
    this._records.push(record);
  }

  /** All records, newest first. */
  getAll(): ReadonlyArray<IpefRecord> {
    return this._records.slice().reverse();
  }

  /** Find by correlationId (== source_uip_id). */
  getByCorrelationId(correlationId: string): IpefRecord | null {
    return this._records.findLast((r) => r.correlationId === correlationId) ?? null;
  }

  get latest(): IpefRecord | null {
    return this._records[this._records.length - 1] ?? null;
  }

  get size(): number {
    return this._records.length;
  }

  clear(): void {
    this._records.length = 0;
  }

  /** Aggregate metrics for the MIO dashboard. */
  summary() {
    if (this._records.length === 0) return null;
    const all = this._records;
    const durations = all.map((r) => r.totalDurationMs);
    return {
      totalExecutions: all.length,
      successCount: all.filter((r) => r.overallStatus === "success").length,
      degradedCount: all.filter((r) => r.overallStatus === "degraded").length,
      failedCount: all.filter((r) => r.overallStatus === "failed").length,
      avgDurationMs: Math.round(durations.reduce((s, d) => s + d, 0) / all.length),
      totalGaps: all.reduce((s, r) => s + r.intelligenceGaps.length, 0),
      lastExecutedAt: all[all.length - 1]?.createdAt ?? null,
    };
  }
}

/** Process-wide singleton. */
export const ipefRegistry = new IpefRegistry(500);
