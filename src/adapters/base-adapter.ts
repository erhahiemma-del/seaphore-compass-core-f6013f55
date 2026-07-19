/**
 * BaseAdapter — reusable integration primitive.
 *
 * Every external / model / user-upload source in the Data Source Matrix
 * extends this class. It enforces:
 *   - status-aware fetch: PLANNED → throw PlannedSourceError;
 *     NOT_IN_SCOPE → throw OutOfScopeSourceError.
 *   - a canonical {@link SourcedResult} envelope with confidence + timestamps.
 *   - a `healthCheck()` method the monitor server function calls on a schedule.
 *   - error surfacing that never fabricates data on failure.
 */

import {
  OutOfScopeSourceError,
  PlannedSourceError,
  type SourceRegistryEntry,
  type SourcedResult,
} from "./status";
import { getMatrixEntry } from "./matrix";

export interface HealthReport {
  state: "OK" | "DEGRADED" | "DOWN" | "UNKNOWN" | "NOT_APPLICABLE";
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
  checkedAt: string;
}

export abstract class BaseAdapter {
  readonly meta: SourceRegistryEntry;

  constructor(sourceId: string) {
    this.meta = getMatrixEntry(sourceId);
  }

  /** Guard called at the top of every public fetch method. */
  protected assertUsable(): void {
    if (this.meta.status === "NOT_IN_SCOPE") {
      throw new OutOfScopeSourceError(this.meta.id);
    }
    if (this.meta.status === "PLANNED") {
      throw new PlannedSourceError(this.meta.id, this.meta.provider);
    }
  }

  /** Wrap raw provider data into the honesty envelope. */
  protected envelope<T>(
    data: T | null,
    observedAt: string,
    opts: { inferred?: boolean; degradedReason?: string } = {},
  ): SourcedResult<T> {
    return {
      data,
      source: this.meta,
      observedAt,
      fetchedAt: new Date().toISOString(),
      confidence: this.meta.defaultConfidence,
      inferred: opts.inferred ?? this.meta.status === "INFERRED",
      degradedReason: opts.degradedReason,
    };
  }

  /**
   * Health probe. Overridden by real adapters to ping their upstream.
   * Default: PLANNED/NOT_IN_SCOPE → NOT_APPLICABLE, everything else UNKNOWN.
   */
  async healthCheck(): Promise<HealthReport> {
    if (this.meta.status === "PLANNED" || this.meta.status === "NOT_IN_SCOPE") {
      return { state: "NOT_APPLICABLE", checkedAt: new Date().toISOString() };
    }
    return { state: "UNKNOWN", checkedAt: new Date().toISOString() };
  }
}
