/**
 * Sprint 11 · Ring-buffer stores for logs, model/evidence usage,
 * feedback, and errors. Bounded memory; newest wins.
 */
import type {
  ErrorLog,
  EvidenceUsage,
  ModelUsage,
  OfficerFeedback,
  QueryLog,
  StageTiming,
} from "./types";

function ring<T>(capacity: number) {
  const buf: T[] = [];
  return {
    push(item: T) {
      buf.push(item);
      if (buf.length > capacity) buf.splice(0, buf.length - capacity);
    },
    all(): readonly T[] {
      return buf.slice();
    },
    filter(pred: (t: T) => boolean): readonly T[] {
      return buf.filter(pred);
    },
    size(): number {
      return buf.length;
    },
    clear(): void {
      buf.length = 0;
    },
  };
}

export interface ObservabilityStore {
  queries: ReturnType<typeof ring<QueryLog>>;
  timings: ReturnType<typeof ring<StageTiming>>;
  models: ReturnType<typeof ring<ModelUsage>>;
  evidence: ReturnType<typeof ring<EvidenceUsage>>;
  feedback: ReturnType<typeof ring<OfficerFeedback>>;
  errors: ReturnType<typeof ring<ErrorLog>>;
}

export function createObservabilityStore(capacity = 1000): ObservabilityStore {
  return {
    queries: ring<QueryLog>(capacity),
    timings: ring<StageTiming>(capacity * 6),
    models: ring<ModelUsage>(capacity),
    evidence: ring<EvidenceUsage>(capacity * 4),
    feedback: ring<OfficerFeedback>(capacity),
    errors: ring<ErrorLog>(capacity),
  };
}
